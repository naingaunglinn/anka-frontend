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
    Skill,
} from "../types/business";
import { calculateSoftBookedHours } from "../lib/calculations";
import {
    insertDepartment, updateDepartmentDB, deleteDepartmentDB,
    insertRole, updateRoleDB, deleteRoleDB,
    insertEmployee, updateEmployeeDB, deleteEmployeeDB,
    insertGlobalOverhead, updateGlobalOverheadDB, deleteGlobalOverheadDB,
    upsertCompanySettings,
    insertSkill, updateSkillDB, deleteSkillDB,
} from '@/lib/queries/organization';
import api from '@/lib/api';
import { toDeal, dealToApiPayload, toContract, toProject, toInvoice, toTimeEntry } from '@/lib/dealsMapper';
import { useTenantStore } from '@/store/tenantStore';
import { normalizeError } from '@/lib/errorHandler';
import toast from 'react-hot-toast';

// ── Payload serialisers (frontend camelCase → API snake_case) ─────────────────
// Kept private to this module; only the fields the backend accepts as writable.

// Returns the RAW monthly salary (basic + allowance, no overhead loading).
// Downstream consumers (CRM AI Team Builder, /estimation rate helpers) apply
// the loaded-cost markup (×1.15) and sell markup (×3) themselves, so this
// passes through the unadjusted payroll figure.
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
    if (u.status !== undefined)             p.status             = u.status;
    if (u.name !== undefined)               p.name               = u.name;
    if (u.budgetHours !== undefined)        p.budget_hours       = u.budgetHours;
    if (u.endDate !== undefined)            p.end_date           = u.endDate;
    if (u.consumedHours !== undefined)      p.consumed_hours     = u.consumedHours;
    if (u.kickoffDate !== undefined)        p.kickoff_date       = u.kickoffDate || null;
    if (u.projectManagerId !== undefined)   p.project_manager_id = u.projectManagerId || null;
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
    skills: Skill[];

    // Actions — Org (all routed through lib/queries/organization.ts → Laravel API)
    updateCompanySettings: (settings: Partial<CompanySettings>) => Promise<void>;
    addEmployee: (emp: Employee, credentials?: { email: string; password: string }) => Promise<void>;
    updateEmployee: (id: string, emp: Partial<Employee>, credentials?: { email?: string; password?: string }) => Promise<void>;
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

    // Actions — Skills
    addSkill: (skill: Skill) => Promise<void>;
    updateSkill: (id: string, skill: Partial<Skill>) => Promise<void>;
    deleteSkill: (id: string) => Promise<void>;

    // Actions — CRM & Deals (routed through lib/api.ts)
    addDeal: (deal: Deal) => Promise<Deal>;
    updateDeal: (id: string, updates: Partial<Deal>) => Promise<void>;
    deleteDeal: (id: string) => Promise<void>;
    dropDeal: (dealId: string, reason: string) => Promise<void>;
    assignEngineer: (dealId: string, employeeId: string, allocatedHours: number) => void;

    // Actions — Contracts (routed through lib/api.ts; created only via the
    // contract-draft mark-signed flow, which fires win_deal() server-side).
    updateContract: (id: string, updates: Partial<Contract>) => Promise<void>;
    deleteContract: (id: string) => Promise<void>;

    // Actions — Projects (routed through lib/api.ts; created server-side
    // by the win_deal() stored procedure when a draft is marked signed).
    updateProject: (id: string, updates: Partial<Project>) => Promise<void>;
    deleteProject: (id: string) => Promise<void>;

    // Actions — Time Tracking (routed through lib/api.ts)
    addTimeEntry: (entry: TimeEntry) => Promise<void>;
    approveTimeEntry: (id: string) => Promise<void>;
    deleteTimeEntry: (id: string) => Promise<void>;

    // Actions — Contracts / Billing (routed through lib/api.ts)
    addInvoice: (invoice: Invoice) => Promise<void>;
    updateInvoice: (id: string, updates: Partial<Invoice>) => Promise<void>;
    payInvoice: (id: string, amount?: number) => Promise<void>;
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
            skills: [],
            companySettings: {
                overheadPercentage:           20,
                bufferPercentage:             10,
                yearlyFixedCost:              0,
                annualInitialBudget:          1_000_000_000,
                employerTaxPercentage:        8,
                benefitsPercentage:           12,
                costToBillRatio:              0.40,
                defaultMonthlyCapacityHours:  160,
                fallbackHourlyCost:           50,
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

            addEmployee: async (emp, credentials) => {
                const snapshot = get().employees;
                set(s => {
                    const employees = [...s.employees, emp];
                    return { employees, engineers: employeesToEngineers(employees) };
                });
                try {
                    await insertEmployee(emp, credentials);
                } catch (err) {
                    set({ employees: snapshot, engineers: employeesToEngineers(snapshot) });
                    toast.error(`Failed to add employee: ${normalizeError(err).message}`);
                }
            },
            updateEmployee: async (id, emp, credentials) => {
                const snapshot = get().employees;
                const existing = snapshot.find(e => e.id === id);
                if (!existing) return;
                // Merge `emp` (and a new email if the manager changed it) into the
                // optimistic store update so the UI reflects the change immediately.
                const merged = { ...existing, ...emp, ...(credentials?.email ? { email: credentials.email } : {}) };
                set(s => {
                    const employees = s.employees.map(e => e.id === id ? merged : e);
                    return { employees, engineers: employeesToEngineers(employees) };
                });
                try {
                    await updateEmployeeDB(merged, credentials);
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

            addSkill: async (skill) => {
                const snapshot = get().skills;
                set(s => ({ skills: [...s.skills, skill] }));
                try {
                    await insertSkill(skill);
                } catch (err) {
                    set({ skills: snapshot });
                    toast.error(`Failed to add skill: ${normalizeError(err).message}`);
                }
            },
            updateSkill: async (id, skill) => {
                const snapshot = get().skills;
                const existing = snapshot.find(sk => sk.id === id);
                if (!existing) return;
                set(s => ({ skills: s.skills.map(sk => sk.id === id ? { ...sk, ...skill } : sk) }));
                try {
                    await updateSkillDB({ ...existing, ...skill });
                } catch (err) {
                    set({ skills: snapshot });
                    toast.error(`Failed to update skill: ${normalizeError(err).message}`);
                }
            },
            deleteSkill: async (id) => {
                const snapshot = get().skills;
                set(s => ({ skills: s.skills.filter(sk => sk.id !== id) }));
                try {
                    await deleteSkillDB(id);
                } catch (err) {
                    set({ skills: snapshot });
                    toast.error(`Failed to delete skill: ${normalizeError(err).message}`);
                }
            },

            // ── CRM / Deals ──────────────────────────────────────────────────

            addDeal: async (deal) => {
                const snapshot = get().deals;
                // Trust a pre-minted client UUID from /crm/new (it generates one
                // in useState so the same id round-trips); only mint a temp id
                // when the caller hasn't supplied one. Using crypto.randomUUID
                // (not Date.now) so two near-simultaneous adds can't collide.
                const tempId = deal.id && !deal.id.startsWith('temp-')
                    ? deal.id
                    : `temp-${crypto.randomUUID()}`;
                set(s => ({ deals: [...s.deals, { ...deal, id: tempId }] }));
                try {
                    const { data } = await api.post('/deals', dealToApiPayload(deal));
                    const created = toDeal(data.data ?? data);
                    set(s => ({ deals: s.deals.map(d => d.id === tempId ? created : d) }));
                    return created;
                } catch (err) {
                    set({ deals: snapshot });
                    toast.error(`Failed to create deal: ${normalizeError(err).message}`);
                    throw err;
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
                    // Re-throw so React Query treats the mutation as failed.
                    // Otherwise callers using `mutateAsync` proceed (e.g. router.push)
                    // after a rolled-back update, making a failed save look successful.
                    throw err;
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
                    throw err;
                }
            },
            dropDeal: async (dealId, reason) => {
                const snapshot = get().deals;
                set(s => ({
                    deals: s.deals.map(d =>
                        d.id === dealId
                            ? {
                                ...d,
                                lifecycleStatus: 'dropped' as const,
                                droppedAtStage: (d.status === 'won' || !d.status)
                                    ? null
                                    : (d.status as 'lead' | 'qualified' | 'negotiation'),
                                winProbability: 0,
                                lossReason: reason,
                            }
                            : d
                    ),
                }));
                try {
                    const { data } = await api.post(`/deals/${dealId}/drop`, { reason });
                    const updated = toDeal(data.data ?? data);
                    set(s => ({ deals: s.deals.map(d => d.id === dealId ? { ...d, ...updated } : d) }));
                    toast.success('Deal dropped.');
                } catch (err) {
                    set({ deals: snapshot });
                    toast.error(`Failed to drop deal: ${normalizeError(err).message}`);
                    throw err;
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
                    // Surface the soft-gate warning the API attaches when the linked
                    // contract isn't yet Signed/Active. We don't block approval — the
                    // approver just sees a warning toast next to the success.
                    if (data?.warning) {
                        toast(data.warning, { icon: '⚠️', duration: 6000 });
                    }
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
                    // Only Draft/Pending are valid on creation (other statuses
                    // are reached via /pay or /send). Default to Pending so the
                    // modal's intent is honoured — issuing an invoice for AR.
                    const statusOnCreate = invoice.status === 'Draft' ? 'Draft' : 'Pending';
                    const { data } = await api.post('/invoices', {
                        contract_id:  invoice.contractId,
                        milestone_id: invoice.milestoneId ?? null,
                        issue_date:   invoice.issueDate,
                        due_date:     invoice.dueDate ?? null,
                        amount:       invoice.amount,
                        tax:          invoice.tax,
                        status:       statusOnCreate,
                        notes:        invoice.notes ?? null,
                        // total is GENERATED ALWAYS by DB — never send it
                    });
                    const created = toInvoice(data.data ?? data);
                    set(s => ({ invoices: s.invoices.map(i => i.id === tempId ? created : i) }));
                } catch (err) {
                    set({ invoices: snapshot });
                    toast.error(`Failed to create invoice: ${normalizeError(err).message}`);
                    throw err;
                }
            },

            updateInvoice: async (id, updates) => {
                const snapshot = get().invoices;
                set(s => ({ invoices: s.invoices.map(i => i.id === id ? { ...i, ...updates } : i) }));
                try {
                    const { data } = await api.patch(`/invoices/${id}`, {
                        milestone_id: updates.milestoneId ?? null,
                        issue_date:   updates.issueDate,
                        due_date:     updates.dueDate ?? null,
                        amount:       updates.amount,
                        tax:          updates.tax,
                        notes:        updates.notes,
                    });
                    const updated = toInvoice(data.data ?? data);
                    set(s => ({ invoices: s.invoices.map(i => i.id === id ? updated : i) }));
                } catch (err) {
                    set({ invoices: snapshot });
                    toast.error(`Failed to update invoice: ${normalizeError(err).message}`);
                    throw err;
                }
            },

            payInvoice: async (id, amount) => {
                const snapshotInvoices  = get().invoices;
                const snapshotContracts = get().contracts;
                // No optimistic status flip — partial payments produce 'Partially Paid'
                // which depends on running totals. Let the server be the source of truth
                // and just paint the result when it arrives.
                try {
                    const body = amount !== undefined ? { amount } : {};
                    const { data } = await api.patch(`/invoices/${id}/pay`, body);
                    const paid = toInvoice(data.data ?? data);
                    const prevPaid = snapshotInvoices.find(i => i.id === id)?.paidAmount ?? 0;
                    const delta    = (paid.paidAmount ?? 0) - prevPaid;
                    set(s => ({
                        invoices: s.invoices.map(i => i.id === id ? paid : i),
                        // Accrual shift: payments now increment cash_collected, not
                        // revenue_recognized (which is driven by milestone Accept).
                        contracts: s.contracts.map(c =>
                            c.id === paid.contractId
                                ? { ...c, cashCollected: (c.cashCollected ?? 0) + delta }
                                : c
                        ),
                    }));
                } catch (err) {
                    set({ invoices: snapshotInvoices, contracts: snapshotContracts });
                    toast.error(`Failed to record payment: ${normalizeError(err).message}`);
                    throw err;
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

                // Capacity pool reads from `employees` (the live org headcount),
                // not the largely-unused `engineers` slice. Each active employee
                // contributes their workableHours to the bucket that matches
                // their capacityRole. This keeps Total / Hard / Soft all
                // computed off the same source so they reconcile.
                const monthlyCapacity = state.companySettings.defaultMonthlyCapacityHours || 160;
                state.employees.forEach(emp => {
                    if (emp.status !== 'Active') return;
                    const bucket = emp.capacityRole;
                    if (!bucket || !pool[bucket]) return;
                    pool[bucket].totalMonthlyHours += emp.workableHours ?? monthlyCapacity;
                });

                state.deals.forEach(deal => {
                    const status = deal.status || 'lead';
                    if (status === "lost") return;

                    // Negotiation = late-stage commitment, treat as hard-booked
                    // (same semantics as the old `contract` stage). Won always
                    // is. Earlier stages contribute soft bookings only.
                    if (status === "won" || status === "negotiation") {
                        (deal.hardAssignments || []).forEach(a => {
                            const emp = state.employees.find(e => e.id === a.employeeId);
                            const bucket = emp?.capacityRole;
                            if (bucket && pool[bucket]) pool[bucket].hardBookedHours += a.allocatedHours;
                        });
                    } else {
                        // Soft-booked hours = qty × monthlyCapacity × allocationFraction
                        // × timelineMonths × winProbability%. The previous formula
                        // skipped allocationFraction AND timelineMonths, so a
                        // half-time 6-month role and a full-time 1-month role
                        // produced identical numbers.
                        const prob   = deal.winProbability || 0;
                        const months = deal.timelineMonths || 1;
                        (deal.ghostRoles || []).forEach(gr => {
                            const allocFrac  = (gr.months || 100) / 100;
                            const totalHours = gr.quantity * monthlyCapacity * allocFrac * months;
                            const softBooked = calculateSoftBookedHours(totalHours, prob);
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
                        const recognizedDate = inv.paidAt ?? inv.issueDate;
                        const month = new Date(recognizedDate).toLocaleString('default', { month: 'short', year: 'numeric', timeZone: 'UTC' });
                        if (!monthly[month]) monthly[month] = { revenue: 0, directLabor: 0, overhead: 0 };
                        monthly[month].revenue += inv.total ?? (inv.amount + inv.tax);
                    });

                state.timeEntries.forEach(entry => {
                    const month = new Date(entry.date).toLocaleString('default', { month: 'short', year: 'numeric', timeZone: 'UTC' });
                    if (!monthly[month]) monthly[month] = { revenue: 0, directLabor: 0, overhead: 0 };
                });

                // Salaried direct labor: every month carries the full payroll of currently
                // Active + On Leave staff. Schema has no contractor flag, so all employees
                // are salaried. Historical months reflect today's headcount — hire/termination
                // history is not yet tracked.
                //
                // Uses RAW monthlySalary (basic + allowance), NOT the loaded ×1.15 cost
                // used on /organization + /estimation. The 15% absorbed-overhead markup
                // is a quoting concept (covers shared costs already booked into
                // globalOverheads); adding it to directLabor here would double-count.
                const monthlyPayroll = state.employees
                    .filter(e => e.status === 'Active' || e.status === 'On Leave')
                    .reduce((sum, e) => sum + e.monthlySalary, 0);

                Object.keys(monthly).forEach(m => {
                    monthly[m].directLabor = monthlyPayroll;
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

                // Sort chronologically so dashboard / forecast always read the last month correctly
                const sortedMonths = Object.keys(monthly).sort((a, b) => {
                    const da = new Date(`${a} 01`).getTime();
                    const db = new Date(`${b} 01`).getTime();
                    return da - db;
                });

                const taxRate = useTenantStore.getState().currentTenant?.taxRate ?? 0.20;

                return sortedMonths.map(month => {
                    const { revenue, directLabor, overhead } = monthly[month];
                    const grossProfit    = revenue - directLabor;
                    const operatingProfit = grossProfit - overhead;
                    const netProfit      = operatingProfit * (1 - taxRate);
                    return { month, revenue, directLabor, overhead, grossProfit, operatingProfit, netProfit };
                });
            },

            getDealEstimation: (dealId) => {
                const state = get();
                const deal = state.deals.find(d => d.id === dealId);
                if (!deal) return { laborCost: 0, overheadCost: 0, suggestedPrice: 0, expectedProfit: 0, totalCost: 0 };

                if (deal.totalEstimatedCost !== undefined) {
                    // suggestedPrice derived from total cost + target margin
                    // (same margin-on-cost formula the EstimationSimulator
                    // uses). Previously this returned `deal.clientBudget`,
                    // which is what the *client* offered — not what we'd
                    // *suggest* charging. Fall back to clientBudget when no
                    // targetMargin is set.
                    const totalCost = deal.totalEstimatedCost || 0;
                    const marginDec = Math.min(0.95, Math.max(0, (deal.targetMargin || 0) / 100));
                    const suggestedPrice = deal.targetMargin && marginDec < 1
                        ? totalCost / (1 - marginDec)
                        : (deal.clientBudget || 0);
                    return {
                        laborCost:      deal.baseLaborCost || 0,
                        overheadCost:   (deal.overheadCost || 0) + (deal.bufferCost || 0),
                        suggestedPrice,
                        expectedProfit: deal.estimatedGrossProfit || 0,
                        totalCost,
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
