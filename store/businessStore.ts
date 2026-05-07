import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
    Role,
    Department,
    Employee,
    GlobalOverhead,
    CompanySettings,
    Deal,
    Contract,
    Invoice,
    Milestone,
    Project,
    TimeEntry,
    Engineer,
    DepartmentCapacity,
    RoleType,
} from "../types/business";
import { calculateSoftBookedHours } from "../lib/calculations";
import {
    insertDepartment, updateDepartmentDB, deleteDepartmentDB,
    insertRole, updateRoleDB, deleteRoleDB,
    insertEmployee, updateEmployeeDB, deleteEmployeeDB,
    insertGlobalOverhead, updateGlobalOverheadDB, deleteGlobalOverheadDB,
    upsertCompanySettings,
} from '@/lib/queries/organization';
import api from '@/lib/api';
import { toDeal, dealToApiPayload, toContract, toProject, toInvoice, toTimeEntry } from '@/lib/dealsMapper';
import { normalizeError } from '@/lib/errorHandler';
import toast from 'react-hot-toast';

// ── Payload serialisers (frontend camelCase → API snake_case) ─────────────────
// Kept private to this module; only the fields the backend accepts as writable.

function employeeToEngineer(employee: Employee): Engineer | null {
    if (!employee.capacityRole || employee.status !== 'Active') return null;

    return {
        id: employee.id,
        name: employee.name,
        role: employee.capacityRole,
        monthlySalary: employee.monthlySalary,
        monthlyCapacityHours: employee.workableHours,
    };
}

function employeesToEngineers(employees: Employee[]): Engineer[] {
    return employees
        .map(employeeToEngineer)
        .filter((engineer): engineer is Engineer => engineer !== null);
}

function contractToApiPayload(c: Partial<Contract>): Record<string, unknown> {
    const p: Record<string, unknown> = {};
    if (c.status !== undefined)    p.status     = c.status;
    if (c.notes !== undefined)     p.notes      = c.notes;
    if (c.endDate !== undefined)   p.end_date   = c.endDate;
    if (c.totalValue !== undefined) p.total_value = c.totalValue;
    return p;
}

function projectToApiPayload(u: Partial<Project>): Record<string, unknown> {
    const p: Record<string, unknown> = {};
    if (u.status !== undefined)      p.status       = u.status;
    if (u.name !== undefined)        p.name         = u.name;
    if (u.budgetHours !== undefined) p.budget_hours = u.budgetHours;
    if (u.endDate !== undefined)     p.end_date     = u.endDate;
    if (u.consumedHours !== undefined) p.consumed_hours = u.consumedHours;
    return p;
}

// ── Store Interface ───────────────────────────────────────────────────────────

export interface BusinessState {
    departments: Department[];
    roles: Role[];
    employees: Employee[];
    engineers: Engineer[];
    globalOverheads: GlobalOverhead[];
    companySettings: CompanySettings;
    deals: Deal[];
    contracts: Contract[];
    invoices: Invoice[];
    milestones: Milestone[];
    projects: Project[];
    timeEntries: TimeEntry[];

    // Actions — Org (all routed through lib/queries/organization.ts → Laravel API)
    updateCompanySettings: (settings: Partial<CompanySettings>) => Promise<void>;
    addEmployee: (emp: Employee) => Promise<void>;
    updateEmployee: (id: string, emp: Partial<Employee>) => Promise<void>;
    deleteEmployee: (id: string) => Promise<void>;
    addRole: (role: Role) => Promise<void>;
    updateRole: (id: string, role: Partial<Role>) => Promise<void>;
    deleteRole: (id: string) => Promise<void>;
    addDepartment: (dept: Department) => Promise<void>;
    updateDepartment: (id: string, dept: Partial<Department>) => Promise<void>;
    deleteDepartment: (id: string) => Promise<void>;
    addGlobalOverhead: (oh: GlobalOverhead) => Promise<void>;
    updateGlobalOverhead: (id: string, oh: Partial<GlobalOverhead>) => Promise<void>;
    deleteGlobalOverhead: (id: string) => Promise<void>;

    // Actions — CRM & Deals (routed through lib/api.ts)
    addDeal: (deal: Deal) => Promise<void>;
    updateDeal: (id: string, updates: Partial<Deal>) => Promise<void>;
    deleteDeal: (id: string) => Promise<void>;
    updateDealStage: (id: string, status: string, probability?: number) => Promise<void>;
    assignEngineer: (dealId: string, employeeId: string, allocatedHours: number) => void;

    // Actions — Cross-module trigger
    winDeal: (dealId: string, winReason?: string) => Promise<void>;
    loseDeal: (dealId: string, lossReason: string) => Promise<void>;

    // Actions — Contracts (routed through lib/api.ts; created only via winDeal)
    updateContract: (id: string, updates: Partial<Contract>) => Promise<void>;
    deleteContract: (id: string) => Promise<void>;

    // Actions — Projects (routed through lib/api.ts; created only via winDeal)
    updateProject: (id: string, updates: Partial<Project>) => Promise<void>;
    deleteProject: (id: string) => Promise<void>;

    // Actions — Time Tracking (routed through lib/api.ts)
    addTimeEntry: (entry: TimeEntry) => Promise<void>;
    approveTimeEntry: (id: string) => Promise<void>;
    deleteTimeEntry: (id: string) => Promise<void>;

    // Actions — Contracts / Billing (routed through lib/api.ts)
    addInvoice: (invoice: Invoice) => Promise<void>;
    payInvoice: (id: string) => Promise<void>;
    deleteInvoice: (id: string) => Promise<void>;

    // Getters
    getCapacityPool: () => DepartmentCapacity[];
    getFinancialPnL: () => { month: string; revenue: number; directLabor: number; overhead: number; grossProfit: number; operatingProfit: number; netProfit: number }[];
    getDealEstimation: (dealId: string) => { laborCost: number; overheadCost: number; suggestedPrice: number; expectedProfit: number; totalCost: number };
}

// ── Store Implementation ──────────────────────────────────────────────────────

export const useBusinessStore = create<BusinessState>()(
    persist(
        (set, get) => ({
            departments: [],
            roles: [],
            employees: [],
            engineers: [],
            globalOverheads: [],
            companySettings: {
                overheadPercentage: 20,
                bufferPercentage: 10,
                yearlyFixedCost: 0,
                employerTaxPercentage: 8,
                benefitsPercentage: 12,
            },
            deals: [],
            contracts: [],
            invoices: [],
            milestones: [],
            projects: [],
            timeEntries: [],

            // ── Org ─────────────────────────────────────────────────────────

            updateCompanySettings: async (settings) => {
                const snapshot = get().companySettings;
                const updated = { ...snapshot, ...settings };
                set({ companySettings: updated });
                try {
                    await upsertCompanySettings(updated);
                } catch (err) {
                    set({ companySettings: snapshot });
                    toast.error(`Failed to save company settings: ${normalizeError(err).message}`);
                }
            },

            addEmployee: async (emp) => {
                const snapshot = get().employees;
                set(s => {
                    const employees = [...s.employees, emp];
                    return { employees, engineers: employeesToEngineers(employees) };
                });
                try {
                    await insertEmployee(emp);
                } catch (err) {
                    set({ employees: snapshot, engineers: employeesToEngineers(snapshot) });
                    toast.error(`Failed to add employee: ${normalizeError(err).message}`);
                }
            },
            updateEmployee: async (id, emp) => {
                const snapshot = get().employees;
                const existing = snapshot.find(e => e.id === id);
                if (!existing) return;
                set(s => {
                    const employees = s.employees.map(e => e.id === id ? { ...e, ...emp } : e);
                    return { employees, engineers: employeesToEngineers(employees) };
                });
                try {
                    await updateEmployeeDB({ ...existing, ...emp });
                } catch (err) {
                    set({ employees: snapshot, engineers: employeesToEngineers(snapshot) });
                    toast.error(`Failed to update employee: ${normalizeError(err).message}`);
                }
            },
            deleteEmployee: async (id) => {
                const snapshot = get().employees;
                set(s => {
                    const employees = s.employees.filter(e => e.id !== id);
                    return { employees, engineers: employeesToEngineers(employees) };
                });
                try {
                    await deleteEmployeeDB(id);
                } catch (err) {
                    set({ employees: snapshot, engineers: employeesToEngineers(snapshot) });
                    toast.error(`Failed to delete employee: ${normalizeError(err).message}`);
                }
            },

            addRole: async (role) => {
                const snapshot = get().roles;
                set(s => ({ roles: [...s.roles, role] }));
                try {
                    await insertRole(role);
                } catch (err) {
                    set({ roles: snapshot });
                    toast.error(`Failed to add role: ${normalizeError(err).message}`);
                }
            },
            updateRole: async (id, role) => {
                const snapshot = get().roles;
                const existing = snapshot.find(r => r.id === id);
                if (!existing) return;
                set(s => ({ roles: s.roles.map(r => r.id === id ? { ...r, ...role } : r) }));
                try {
                    await updateRoleDB({ ...existing, ...role });
                } catch (err) {
                    set({ roles: snapshot });
                    toast.error(`Failed to update role: ${normalizeError(err).message}`);
                }
            },
            deleteRole: async (id) => {
                const snapshot = get().roles;
                set(s => ({ roles: s.roles.filter(r => r.id !== id) }));
                try {
                    await deleteRoleDB(id);
                } catch (err) {
                    set({ roles: snapshot });
                    toast.error(`Failed to delete role: ${normalizeError(err).message}`);
                }
            },

            addDepartment: async (dept) => {
                const snapshot = get().departments;
                set(s => ({ departments: [...s.departments, dept] }));
                try {
                    await insertDepartment(dept);
                } catch (err) {
                    set({ departments: snapshot });
                    toast.error(`Failed to add department: ${normalizeError(err).message}`);
                }
            },
            updateDepartment: async (id, dept) => {
                const snapshot = get().departments;
                const existing = snapshot.find(d => d.id === id);
                if (!existing) return;
                set(s => ({ departments: s.departments.map(d => d.id === id ? { ...d, ...dept } : d) }));
                try {
                    await updateDepartmentDB({ ...existing, ...dept });
                } catch (err) {
                    set({ departments: snapshot });
                    toast.error(`Failed to update department: ${normalizeError(err).message}`);
                }
            },
            deleteDepartment: async (id) => {
                const snapshot = get().departments;
                set(s => ({ departments: s.departments.filter(d => d.id !== id) }));
                try {
                    await deleteDepartmentDB(id);
                } catch (err) {
                    set({ departments: snapshot });
                    toast.error(`Failed to delete department: ${normalizeError(err).message}`);
                }
            },

            addGlobalOverhead: async (oh) => {
                const snapshot = get().globalOverheads;
                set(s => ({ globalOverheads: [...s.globalOverheads, oh] }));
                try {
                    await insertGlobalOverhead(oh);
                } catch (err) {
                    set({ globalOverheads: snapshot });
                    toast.error(`Failed to add overhead: ${normalizeError(err).message}`);
                }
            },
            updateGlobalOverhead: async (id, oh) => {
                const snapshot = get().globalOverheads;
                const existing = snapshot.find(o => o.id === id);
                if (!existing) return;
                set(s => ({ globalOverheads: s.globalOverheads.map(o => o.id === id ? { ...o, ...oh } : o) }));
                try {
                    await updateGlobalOverheadDB({ ...existing, ...oh });
                } catch (err) {
                    set({ globalOverheads: snapshot });
                    toast.error(`Failed to update overhead: ${normalizeError(err).message}`);
                }
            },
            deleteGlobalOverhead: async (id) => {
                const snapshot = get().globalOverheads;
                set(s => ({ globalOverheads: s.globalOverheads.filter(o => o.id !== id) }));
                try {
                    await deleteGlobalOverheadDB(id);
                } catch (err) {
                    set({ globalOverheads: snapshot });
                    toast.error(`Failed to delete overhead: ${normalizeError(err).message}`);
                }
            },

            // ── CRM / Deals ──────────────────────────────────────────────────

            addDeal: async (deal) => {
                const snapshot = get().deals;
                const tempId = `temp-${Date.now()}`;
                set(s => ({ deals: [...s.deals, { ...deal, id: tempId }] }));
                try {
                    const { data } = await api.post('/deals', dealToApiPayload(deal));
                    const created = toDeal(data.data ?? data);
                    set(s => ({ deals: s.deals.map(d => d.id === tempId ? created : d) }));
                } catch (err) {
                    set({ deals: snapshot });
                    toast.error(`Failed to create deal: ${normalizeError(err).message}`);
                }
            },
            updateDeal: async (id, updates) => {
                const snapshot = get().deals;
                set(s => ({ deals: s.deals.map(d => d.id === id ? { ...d, ...updates } : d) }));
                try {
                    await api.put(`/deals/${id}`, dealToApiPayload(updates));
                } catch (err) {
                    set({ deals: snapshot });
                    toast.error(`Failed to update deal: ${normalizeError(err).message}`);
                }
            },
            deleteDeal: async (id) => {
                const snapshot = get().deals;
                set(s => ({ deals: s.deals.filter(d => d.id !== id) }));
                try {
                    await api.delete(`/deals/${id}`);
                } catch (err) {
                    set({ deals: snapshot });
                    toast.error(`Failed to delete deal: ${normalizeError(err).message}`);
                }
            },
            updateDealStage: async (id, status, probability) => {
                const snapshot = get().deals;
                set(s => ({
                    deals: s.deals.map(d =>
                        d.id === id
                            ? { ...d, status: status as Deal['status'], winProbability: probability }
                            : d
                    ),
                }));
                try {
                    await api.patch(`/deals/${id}/stage`, { status, win_probability: probability });
                } catch (err) {
                    set({ deals: snapshot });
                    toast.error(`Failed to update deal stage: ${normalizeError(err).message}`);
                }
            },

            winDeal: async (dealId, winReason) => {
                const snapshotDeals     = get().deals;
                const snapshotContracts = get().contracts;
                const snapshotProjects  = get().projects;

                // Optimistic: reflect the win immediately so the Kanban column moves
                // before we hear back from the stored procedure
                set(s => ({
                    deals: s.deals.map(d =>
                        d.id === dealId
                            ? { ...d, status: 'won' as const, winProbability: 100, winReason }
                            : d
                    ),
                }));

                try {
                    const body = winReason ? { win_reason: winReason } : {};
                    const { data } = await api.post(`/deals/${dealId}/win`, body);

                    const serverContract = toContract(data.contract);
                    const serverProject  = toProject(data.project);

                    set(s => ({
                        // Merge server fields into the existing deal to preserve ghost roles and
                        // hard assignments that the win endpoint may not eager-load
                        deals: s.deals.map(d => d.id === dealId ? { ...d, ...toDeal(data.deal) } : d),
                        // Filter-before-append keeps the operation idempotent on retry
                        contracts: [...s.contracts.filter(c => c.id !== serverContract.id), serverContract],
                        projects:  [...s.projects.filter(p => p.id !== serverProject.id),  serverProject],
                    }));

                    toast.success(`Deal won! Contract ${data.contract.contract_number} created.`);
                } catch (err) {
                    set({ deals: snapshotDeals, contracts: snapshotContracts, projects: snapshotProjects });
                    const { message } = normalizeError(err);
                    // The stored proc raises a constraint violation on duplicate wins or
                    // missing required data — surface the server's message directly
                    toast.error(`Failed to win deal: ${message}`);
                }
            },

            loseDeal: async (dealId, lossReason) => {
                const snapshot = get().deals;
                set(s => ({
                    deals: s.deals.map(d =>
                        d.id === dealId
                            ? { ...d, status: 'lost' as const, winProbability: 0, lossReason }
                            : d
                    ),
                }));
                try {
                    const { data } = await api.post(`/deals/${dealId}/lose`, { loss_reason: lossReason });
                    const updated = toDeal(data.data ?? data);
                    set(s => ({ deals: s.deals.map(d => d.id === dealId ? { ...d, ...updated } : d) }));
                    toast.success('Deal marked as lost.');
                } catch (err) {
                    set({ deals: snapshot });
                    toast.error(`Failed to mark deal as lost: ${normalizeError(err).message}`);
                }
            },

            // ── Contracts ────────────────────────────────────────────────────

            updateContract: async (id, updates) => {
                const snapshot = get().contracts;
                set(s => ({
                    contracts: s.contracts.map(c => c.id === id ? { ...c, ...updates } : c),
                }));
                try {
                    const { data } = await api.patch(`/contracts/${id}`, contractToApiPayload(updates));
                    const updated = toContract(data.data ?? data);
                    set(s => ({
                        contracts: s.contracts.map(c => c.id === id ? updated : c),
                    }));
                } catch (err) {
                    set({ contracts: snapshot });
                    toast.error(`Failed to update contract: ${normalizeError(err).message}`);
                }
            },
            deleteContract: async (id) => {
                const snapshot = get().contracts;
                set(s => ({ contracts: s.contracts.filter(c => c.id !== id) }));
                try {
                    await api.delete(`/contracts/${id}`);
                } catch (err) {
                    set({ contracts: snapshot });
                    toast.error(`Failed to delete contract: ${normalizeError(err).message}`);
                }
            },

            // ── Projects ─────────────────────────────────────────────────────

            updateProject: async (id, updates) => {
                const snapshot = get().projects;
                set(s => ({
                    projects: s.projects.map(p => p.id === id ? { ...p, ...updates } : p),
                }));
                try {
                    const { data } = await api.patch(`/projects/${id}`, projectToApiPayload(updates));
                    const updated = toProject(data.data ?? data);
                    set(s => ({ projects: s.projects.map(p => p.id === id ? updated : p) }));
                } catch (err) {
                    set({ projects: snapshot });
                    toast.error(`Failed to update project: ${normalizeError(err).message}`);
                }
            },
            deleteProject: async (id) => {
                const snapshot = get().projects;
                set(s => ({ projects: s.projects.filter(p => p.id !== id) }));
                try {
                    await api.delete(`/projects/${id}`);
                } catch (err) {
                    set({ projects: snapshot });
                    toast.error(`Failed to delete project: ${normalizeError(err).message}`);
                }
            },

            // ── Time Tracking ─────────────────────────────────────────────────

            addTimeEntry: async (entry) => {
                const snapshot = get().timeEntries;
                const tempId = `temp-${Date.now()}`;
                set(s => ({
                    timeEntries: [...s.timeEntries, { ...entry, id: tempId, status: 'Draft' as const }],
                }));
                try {
                    const { data } = await api.post('/time-entries', {
                        project_id:  entry.projectId,
                        employee_id: entry.employeeId,
                        task:        entry.task,
                        date:        entry.date,
                        hours:       entry.hours,
                        billable:    entry.billable,
                    });
                    const created = toTimeEntry(data.data ?? data);
                    set(s => ({
                        timeEntries: s.timeEntries.map(t => t.id === tempId ? created : t),
                    }));
                } catch (err) {
                    set({ timeEntries: snapshot });
                    toast.error(`Failed to create time entry: ${normalizeError(err).message}`);
                }
            },

            approveTimeEntry: async (id) => {
                const snapshot = get().timeEntries;
                const now = new Date().toISOString();
                // Optimistic: show Approved immediately so the approver sees instant feedback
                set(s => ({
                    timeEntries: s.timeEntries.map(t =>
                        t.id === id ? { ...t, status: 'Approved' as const, approvedAt: now } : t
                    ),
                }));
                try {
                    const { data } = await api.patch(`/time-entries/${id}/approve`);
                    const approved = toTimeEntry(data.data ?? data);
                    set(s => ({
                        timeEntries: s.timeEntries.map(t => t.id === id ? approved : t),
                    }));
                } catch (err) {
                    set({ timeEntries: snapshot });
                    // 423 = another request holds the pessimistic lock — normalizeError
                    // returns "This record is currently being modified. Please try again."
                    toast.error(`Failed to approve time entry: ${normalizeError(err).message}`);
                }
            },

            deleteTimeEntry: async (id) => {
                const snapshot = get().timeEntries;
                set(s => ({ timeEntries: s.timeEntries.filter(t => t.id !== id) }));
                try {
                    await api.delete(`/time-entries/${id}`);
                } catch (err) {
                    set({ timeEntries: snapshot });
                    toast.error(`Failed to delete time entry: ${normalizeError(err).message}`);
                }
            },

            // ── Invoices / Billing ────────────────────────────────────────────

            addInvoice: async (invoice) => {
                const snapshot = get().invoices;
                const tempId = `temp-${Date.now()}`;
                set(s => ({ invoices: [...s.invoices, { ...invoice, id: tempId }] }));
                try {
                    const { data } = await api.post('/invoices', {
                        contract_id:  invoice.contractId,
                        milestone_id: invoice.milestoneId ?? null,
                        issue_date:   invoice.issueDate,
                        due_date:     invoice.dueDate ?? null,
                        amount:       invoice.amount,
                        tax:          invoice.tax,
                        notes:        invoice.notes ?? null,
                        // total is GENERATED ALWAYS by DB — never send it
                    });
                    const created = toInvoice(data.data ?? data);
                    set(s => ({ invoices: s.invoices.map(i => i.id === tempId ? created : i) }));
                } catch (err) {
                    set({ invoices: snapshot });
                    toast.error(`Failed to create invoice: ${normalizeError(err).message}`);
                }
            },

            payInvoice: async (id) => {
                const snapshotInvoices  = get().invoices;
                const snapshotContracts = get().contracts;
                // Optimistic: mark as Paid immediately
                set(s => ({
                    invoices: s.invoices.map(i =>
                        i.id === id ? { ...i, status: 'Paid' as const } : i
                    ),
                }));
                try {
                    const { data } = await api.patch(`/invoices/${id}/pay`);
                    const paid = toInvoice(data.data ?? data);
                    set(s => ({
                        invoices: s.invoices.map(i => i.id === id ? paid : i),
                        // Reflect the new revenue_recognized total on the parent contract
                        contracts: s.contracts.map(c =>
                            c.id === paid.contractId
                                ? { ...c, revenueRecognized: c.revenueRecognized + (paid.amount + paid.tax) }
                                : c
                        ),
                    }));
                } catch (err) {
                    set({ invoices: snapshotInvoices, contracts: snapshotContracts });
                    // 409 = invoice already paid; normalizeError surfaces the server message
                    toast.error(`Failed to pay invoice: ${normalizeError(err).message}`);
                }
            },

            deleteInvoice: async (id) => {
                const snapshot = get().invoices;
                set(s => ({ invoices: s.invoices.filter(i => i.id !== id) }));
                try {
                    await api.delete(`/invoices/${id}`);
                } catch (err) {
                    set({ invoices: snapshot });
                    toast.error(`Failed to delete invoice: ${normalizeError(err).message}`);
                }
            },

            // ── Pure-client helpers ───────────────────────────────────────────

            assignEngineer: (dealId, employeeId, allocatedHours) =>
                set((state) => ({
                    deals: state.deals.map((deal) => {
                        if (deal.id !== dealId) return deal;
                        const existing = deal.hardAssignments || [];
                        const idx = existing.findIndex(a => a.employeeId === employeeId);
                        const next = [...existing];
                        if (idx >= 0) {
                            if (allocatedHours === 0) next.splice(idx, 1);
                            else next[idx] = { employeeId, allocatedHours };
                        } else if (allocatedHours > 0) {
                            next.push({ employeeId, allocatedHours });
                        }
                        return { ...deal, hardAssignments: next };
                    }),
                })),

            // ── Computed getters ──────────────────────────────────────────────

            getCapacityPool: () => {
                const state = get();
                const pool: Record<RoleType, DepartmentCapacity> = {
                    frontend: { role: "frontend", totalMonthlyHours: 0, softBookedHours: 0, hardBookedHours: 0 },
                    backend:  { role: "backend",  totalMonthlyHours: 0, softBookedHours: 0, hardBookedHours: 0 },
                    pm:       { role: "pm",        totalMonthlyHours: 0, softBookedHours: 0, hardBookedHours: 0 },
                    qa:       { role: "qa",        totalMonthlyHours: 0, softBookedHours: 0, hardBookedHours: 0 },
                    design:   { role: "design",    totalMonthlyHours: 0, softBookedHours: 0, hardBookedHours: 0 },
                };

                state.engineers.forEach(eng => {
                    if (pool[eng.role]) pool[eng.role].totalMonthlyHours += eng.monthlyCapacityHours;
                });

                state.deals.forEach(deal => {
                    const status = deal.status || 'inquiry';
                    if (status === "lost") return;

                    if (status === "won" || status === "contract") {
                        (deal.hardAssignments || []).forEach(a => {
                            const eng = state.engineers.find(e => e.id === a.employeeId);
                            if (eng && pool[eng.role]) pool[eng.role].hardBookedHours += a.allocatedHours;
                        });
                    } else {
                        (deal.ghostRoles || []).forEach(gr => {
                            const prob = deal.winProbability || 0;
                            const softBooked = calculateSoftBookedHours(gr.quantity * 160, prob);
                            if (pool[gr.roleType]) pool[gr.roleType].softBookedHours += softBooked;
                        });
                    }
                });

                return Object.values(pool);
            },

            getFinancialPnL: () => {
                const state = get();
                const monthly: Record<string, { revenue: number; directLabor: number; overhead: number }> = {};

                state.invoices
                    .filter(inv => inv.status === 'Paid')
                    .forEach(inv => {
                        const month = new Date(inv.issueDate).toLocaleString('default', { month: 'short', year: 'numeric', timeZone: 'UTC' });
                        if (!monthly[month]) monthly[month] = { revenue: 0, directLabor: 0, overhead: 0 };
                        monthly[month].revenue += inv.amount;
                    });

                state.timeEntries
                    .filter(e => e.status === 'Approved')
                    .forEach(entry => {
                        const month = new Date(entry.date).toLocaleString('default', { month: 'short', year: 'numeric', timeZone: 'UTC' });
                        if (!monthly[month]) monthly[month] = { revenue: 0, directLabor: 0, overhead: 0 };
                        const emp = state.employees.find(e => e.id === entry.employeeId);
                        monthly[month].directLabor += entry.hours * (emp?.costPerHour ?? 0);
                    });

                // For each P&L month, sum overheads that either have no period (always-on)
                // or explicitly match that month/year.
                Object.keys(monthly).forEach(m => {
                    const [monthName, yearStr] = m.split(' ');
                    const year = parseInt(yearStr, 10);
                    const monthNum = new Date(`${monthName} 1, ${yearStr}`).getMonth() + 1;
                    const periodOverhead = state.globalOverheads
                        .filter(oh => !oh.effectiveYear || (oh.effectiveYear === year && oh.effectiveMonth === monthNum))
                        .reduce((s, oh) => s + oh.monthlyCost, 0);
                    monthly[m].overhead += periodOverhead;
                });

                return Object.keys(monthly).map(month => {
                    const { revenue, directLabor, overhead } = monthly[month];
                    const grossProfit    = revenue - directLabor;
                    const operatingProfit = grossProfit - overhead;
                    const netProfit      = operatingProfit * 0.8;
                    return { month, revenue, directLabor, overhead, grossProfit, operatingProfit, netProfit };
                });
            },

            getDealEstimation: (dealId) => {
                const state = get();
                const deal = state.deals.find(d => d.id === dealId);
                if (!deal) return { laborCost: 0, overheadCost: 0, suggestedPrice: 0, expectedProfit: 0, totalCost: 0 };

                if (deal.totalEstimatedCost !== undefined) {
                    return {
                        laborCost:      deal.baseLaborCost || 0,
                        overheadCost:   (deal.overheadCost || 0) + (deal.bufferCost || 0),
                        suggestedPrice: deal.clientBudget || 0,
                        expectedProfit: deal.estimatedGrossProfit || 0,
                        totalCost:      deal.totalEstimatedCost || 0,
                    };
                }

                let laborCost = 0;
                (deal.estimationResources || []).forEach(res => {
                    const role = state.roles.find(r => r.id === res.roleId);
                    laborCost += res.hours * (role ? role.rate * 0.5 : 50);
                });

                const overheadCost = (deal.projectOverheads || []).reduce((s, oh) => s + oh.cost, 0);
                const totalCost = laborCost + overheadCost;
                const targetMarginDecimal = (deal.targetMargin || 0) / 100;
                const suggestedPrice = targetMarginDecimal < 1 ? totalCost / (1 - targetMarginDecimal) : 0;
                const expectedProfit = suggestedPrice - totalCost;

                return { laborCost, overheadCost, suggestedPrice, expectedProfit, totalCost };
            },
        }),
        {
            name: "unified-agency-store",
            skipHydration: true,
        }
    )
);
