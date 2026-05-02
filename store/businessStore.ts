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
} from '@/lib/supabaseOrganization';
import api from '@/lib/api';
import { toDeal, dealToApiPayload, toContract, toProject } from '@/lib/dealsMapper';
import toast from 'react-hot-toast';

// --- Initial Mock Data ---

const INITIAL_ENGINEERS: Engineer[] = [
    { id: "e1", name: "Alice Frontend", role: "frontend", monthlySalary: 8000, monthlyCapacityHours: 160 },
    { id: "e2", name: "Bob Backend", role: "backend", monthlySalary: 9000, monthlyCapacityHours: 160 },
    { id: "e3", name: "Charlie PM", role: "pm", monthlySalary: 7000, monthlyCapacityHours: 160 },
    { id: "e4", name: "Diana QA", role: "qa", monthlySalary: 6000, monthlyCapacityHours: 160 },
    { id: "e5", name: "Eve Frontend", role: "frontend", monthlySalary: 7500, monthlyCapacityHours: 160 },
];



const MOCK_CONTRACTS: Contract[] = [
    { id: "CON-001", dealId: "deal-1", client: "Acme Corp", totalValue: 120000, revenueRecognized: 40000, status: "Active" }
];

const MOCK_INVOICES: Invoice[] = [
    { id: "INV-1042", contractId: "CON-001", issueDate: "2024-03-01", amount: 40000, tax: 4000, status: "Paid" },
    { id: "INV-1043", contractId: "CON-001", issueDate: "2024-04-01", amount: 40000, tax: 4000, status: "Pending" }
];

const MOCK_MILESTONES: Milestone[] = [
    { id: "MIL-01", contractId: "CON-001", name: "Project Kickoff", dueDate: "2024-03-15", amount: 20000, status: "Completed" },
    { id: "MIL-02", contractId: "CON-001", name: "Phase 1 Delivery", dueDate: "2024-04-30", amount: 50000, status: "In Progress" }
];

const MOCK_PROJECTS: Project[] = [
    { id: "PRJ-101", contractId: "CON-001", name: "Cloud Migration", client: "Acme Corp", budgetHours: 300, consumedHours: 250, status: "On Track" }
];

const MOCK_TIME_ENTRIES: TimeEntry[] = [
    { id: "t1", projectId: "PRJ-101", employeeId: "e1", task: "Database Schema Setup", date: "2024-03-10", hours: 40, billable: true, status: "Approved" },
    { id: "t2", projectId: "PRJ-101", employeeId: "e3", task: "API Migration", date: "2024-03-15", hours: 210, billable: true, status: "Approved" }
];


// --- Store Interface ---

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

    // Actions - Org
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

    // Actions - CRM & Deals
    addDeal: (deal: Deal) => Promise<void>;
    updateDeal: (id: string, updates: Partial<Deal>) => Promise<void>;
    deleteDeal: (id: string) => Promise<void>;
    updateDealStage: (id: string, status: string, probability?: number) => Promise<void>;
    assignEngineer: (dealId: string, employeeId: string, allocatedHours: number) => void;

    // Actions - Cross-module trigger
    winDeal: (dealId: string) => Promise<void>;

    // Actions - Time tracking
    addTimeEntry: (entry: TimeEntry) => void;

    // Actions - Contracts/Billing
    addInvoice: (invoice: Invoice) => void;

    // Getters
    getCapacityPool: () => DepartmentCapacity[];
    getFinancialPnL: () => { month: string; revenue: number; directLabor: number; overhead: number; grossProfit: number; operatingProfit: number; netProfit: number }[];
    getDealEstimation: (dealId: string) => { laborCost: number; overheadCost: number; suggestedPrice: number; expectedProfit: number; totalCost: number };
}

// --- Store Implementation ---

export const useBusinessStore = create<BusinessState>()(
    persist(
        (set, get) => ({
            departments: [],
            roles: [],
            employees: [],
            engineers: INITIAL_ENGINEERS,
            globalOverheads: [],
            companySettings: {
                overheadPercentage: 20,
                bufferPercentage: 10,
                yearlyFixedCost: 0,
                employerTaxPercentage: 8,
                benefitsPercentage: 12,
            },
            deals: [],
            contracts: MOCK_CONTRACTS,
            invoices: MOCK_INVOICES,
            milestones: MOCK_MILESTONES,
            projects: MOCK_PROJECTS,
            timeEntries: MOCK_TIME_ENTRIES,

            updateCompanySettings: async (settings) => {
                const snapshot = get().companySettings;
                const updated = { ...snapshot, ...settings };
                set({ companySettings: updated });
                try {
                    await upsertCompanySettings(updated);
                } catch (err) {
                    set({ companySettings: snapshot });
                    toast.error(`Failed to save company settings: ${(err as Error).message}`);
                }
            },

            // Org Handlers
            addEmployee: async (emp) => {
                const snapshot = get().employees;
                set(s => ({ employees: [...s.employees, emp] }));
                try {
                    await insertEmployee(emp);
                } catch (err) {
                    set({ employees: snapshot });
                    toast.error(`Failed to add employee: ${(err as Error).message}`);
                }
            },
            updateEmployee: async (id, emp) => {
                const snapshot = get().employees;
                const existing = snapshot.find(e => e.id === id);
                if (!existing) return;
                const updated = { ...existing, ...emp };
                set(s => ({ employees: s.employees.map(e => e.id === id ? updated : e) }));
                try {
                    await updateEmployeeDB(updated);
                } catch (err) {
                    set({ employees: snapshot });
                    toast.error(`Failed to update employee: ${(err as Error).message}`);
                }
            },
            deleteEmployee: async (id) => {
                const snapshot = get().employees;
                set(s => ({ employees: s.employees.filter(e => e.id !== id) }));
                try {
                    await deleteEmployeeDB(id);
                } catch (err) {
                    set({ employees: snapshot });
                    toast.error(`Failed to delete employee: ${(err as Error).message}`);
                }
            },

            addRole: async (role) => {
                const snapshot = get().roles;
                set(s => ({ roles: [...s.roles, role] }));
                try {
                    await insertRole(role);
                } catch (err) {
                    set({ roles: snapshot });
                    toast.error(`Failed to add role: ${(err as Error).message}`);
                }
            },
            updateRole: async (id, role) => {
                const snapshot = get().roles;
                const existing = snapshot.find(r => r.id === id);
                if (!existing) return;
                const updated = { ...existing, ...role };
                set(s => ({ roles: s.roles.map(r => r.id === id ? updated : r) }));
                try {
                    await updateRoleDB(updated);
                } catch (err) {
                    set({ roles: snapshot });
                    toast.error(`Failed to update role: ${(err as Error).message}`);
                }
            },
            deleteRole: async (id) => {
                const snapshot = get().roles;
                set(s => ({ roles: s.roles.filter(r => r.id !== id) }));
                try {
                    await deleteRoleDB(id);
                } catch (err) {
                    set({ roles: snapshot });
                    toast.error(`Failed to delete role: ${(err as Error).message}`);
                }
            },

            addDepartment: async (dept) => {
                const snapshot = get().departments;
                set(s => ({ departments: [...s.departments, dept] }));
                try {
                    await insertDepartment(dept);
                } catch (err) {
                    set({ departments: snapshot });
                    toast.error(`Failed to add department: ${(err as Error).message}`);
                }
            },
            updateDepartment: async (id, dept) => {
                const snapshot = get().departments;
                const existing = snapshot.find(d => d.id === id);
                if (!existing) return;
                const updated = { ...existing, ...dept };
                set(s => ({ departments: s.departments.map(d => d.id === id ? updated : d) }));
                try {
                    await updateDepartmentDB(updated);
                } catch (err) {
                    set({ departments: snapshot });
                    toast.error(`Failed to update department: ${(err as Error).message}`);
                }
            },
            deleteDepartment: async (id) => {
                const snapshot = get().departments;
                set(s => ({ departments: s.departments.filter(d => d.id !== id) }));
                try {
                    await deleteDepartmentDB(id);
                } catch (err) {
                    set({ departments: snapshot });
                    toast.error(`Failed to delete department: ${(err as Error).message}`);
                }
            },

            addGlobalOverhead: async (oh) => {
                const snapshot = get().globalOverheads;
                set(s => ({ globalOverheads: [...s.globalOverheads, oh] }));
                try {
                    await insertGlobalOverhead(oh);
                } catch (err) {
                    set({ globalOverheads: snapshot });
                    toast.error(`Failed to add overhead: ${(err as Error).message}`);
                }
            },
            updateGlobalOverhead: async (id, oh) => {
                const snapshot = get().globalOverheads;
                const existing = snapshot.find(o => o.id === id);
                if (!existing) return;
                const updated = { ...existing, ...oh };
                set(s => ({ globalOverheads: s.globalOverheads.map(o => o.id === id ? updated : o) }));
                try {
                    await updateGlobalOverheadDB(updated);
                } catch (err) {
                    set({ globalOverheads: snapshot });
                    toast.error(`Failed to update overhead: ${(err as Error).message}`);
                }
            },
            deleteGlobalOverhead: async (id) => {
                const snapshot = get().globalOverheads;
                set(s => ({ globalOverheads: s.globalOverheads.filter(o => o.id !== id) }));
                try {
                    await deleteGlobalOverheadDB(id);
                } catch (err) {
                    set({ globalOverheads: snapshot });
                    toast.error(`Failed to delete overhead: ${(err as Error).message}`);
                }
            },

            // CRM Handlers
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
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const message = (err as any).response?.data?.message ?? (err as Error).message;
                    toast.error(`Failed to create deal: ${message}`);
                }
            },
            updateDeal: async (id, updates) => {
                const snapshot = get().deals;
                set(s => ({ deals: s.deals.map(d => d.id === id ? { ...d, ...updates } : d) }));
                try {
                    await api.put(`/deals/${id}`, dealToApiPayload(updates));
                } catch (err) {
                    set({ deals: snapshot });
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const message = (err as any).response?.data?.message ?? (err as Error).message;
                    toast.error(`Failed to update deal: ${message}`);
                }
            },
            deleteDeal: async (id) => {
                const snapshot = get().deals;
                set(s => ({ deals: s.deals.filter(d => d.id !== id) }));
                try {
                    await api.delete(`/deals/${id}`);
                } catch (err) {
                    set({ deals: snapshot });
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const message = (err as any).response?.data?.message ?? (err as Error).message;
                    toast.error(`Failed to delete deal: ${message}`);
                }
            },
            updateDealStage: async (id, status, probability) => {
                const snapshot = get().deals;
                set(s => ({ deals: s.deals.map(d => d.id === id ? { ...d, status: status as Deal['status'], winProbability: probability } : d) }));
                try {
                    await api.patch(`/deals/${id}/stage`, { status, win_probability: probability });
                } catch (err) {
                    set({ deals: snapshot });
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const message = (err as any).response?.data?.message ?? (err as Error).message;
                    toast.error(`Failed to update deal stage: ${message}`);
                }
            },

            winDeal: async (dealId) => {
                const snapshotDeals = get().deals;
                const snapshotContracts = get().contracts;
                const snapshotProjects = get().projects;

                // Optimistic: mark deal as won immediately so the UI responds instantly
                set(s => ({
                    deals: s.deals.map(d => d.id === dealId
                        ? { ...d, status: 'won' as const, winProbability: 100 }
                        : d
                    ),
                }));

                try {
                    const { data } = await api.post(`/deals/${dealId}/win`);

                    set(s => ({
                        deals: s.deals.map(d => d.id === dealId ? toDeal(data.deal) : d),
                        contracts: [...s.contracts, toContract(data.contract)],
                        projects: [...s.projects, toProject(data.project)],
                    }));

                    toast.success(`Deal won! Contract ${data.contract.contract_number} created.`);
                } catch (err) {
                    set({ deals: snapshotDeals, contracts: snapshotContracts, projects: snapshotProjects });
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const message = (err as any).response?.data?.message ?? (err as Error).message;
                    toast.error(`Failed to win deal: ${message}`);
                }
            },

            addTimeEntry: (entry) => set((state) => ({
                timeEntries: [...state.timeEntries, entry],
            })),

            addInvoice: (invoice) => set((state) => ({ invoices: [...state.invoices, invoice] })),

            getDealEstimation: (dealId) => {
                const state = get();
                const deal = state.deals.find(d => d.id === dealId);
                if (!deal) return { laborCost: 0, overheadCost: 0, suggestedPrice: 0, expectedProfit: 0, totalCost: 0 };

                if (deal.totalEstimatedCost !== undefined) {
                    return {
                        laborCost: deal.baseLaborCost || 0,
                        overheadCost: (deal.overheadCost || 0) + (deal.bufferCost || 0),
                        suggestedPrice: deal.clientBudget || 0,
                        expectedProfit: deal.estimatedGrossProfit || 0,
                        totalCost: deal.totalEstimatedCost || 0
                    };
                }

                let laborCost = 0;
                (deal.estimationResources || []).forEach(res => {
                    const role = state.roles.find(r => r.id === res.roleId);
                    const costRate = role ? (role.rate * 0.5) : 50;
                    laborCost += res.hours * costRate;
                });

                const overheadCost = (deal.projectOverheads || []).reduce((sum, oh) => sum + oh.cost, 0);
                const totalCost = laborCost + overheadCost;
                const targetMarginDecimal = (deal.targetMargin || 0) / 100;
                const suggestedPrice = targetMarginDecimal < 1 ? totalCost / (1 - targetMarginDecimal) : 0;
                const expectedProfit = suggestedPrice - totalCost;

                return { laborCost, overheadCost, suggestedPrice, expectedProfit, totalCost };
            },

            assignEngineer: (dealId, employeeId, allocatedHours) =>
                set((state) => ({
                    deals: state.deals.map((deal) => {
                        if (deal.id !== dealId) return deal;

                        const existingAssignments = deal.hardAssignments || [];
                        const assignmentIndex = existingAssignments.findIndex(
                            (a) => a.employeeId === employeeId
                        );

                        const newAssignments = [...existingAssignments];

                        if (assignmentIndex >= 0) {
                            if (allocatedHours === 0) {
                                newAssignments.splice(assignmentIndex, 1);
                            } else {
                                newAssignments[assignmentIndex] = { employeeId, allocatedHours };
                            }
                        } else if (allocatedHours > 0) {
                            newAssignments.push({ employeeId, allocatedHours });
                        }

                        return { ...deal, hardAssignments: newAssignments };
                    }),
                })),

            getCapacityPool: () => {
                const state = get();
                const pool: Record<RoleType, DepartmentCapacity> = {
                    frontend: { role: "frontend", totalMonthlyHours: 0, softBookedHours: 0, hardBookedHours: 0 },
                    backend: { role: "backend", totalMonthlyHours: 0, softBookedHours: 0, hardBookedHours: 0 },
                    pm: { role: "pm", totalMonthlyHours: 0, softBookedHours: 0, hardBookedHours: 0 },
                    qa: { role: "qa", totalMonthlyHours: 0, softBookedHours: 0, hardBookedHours: 0 },
                    design: { role: "design", totalMonthlyHours: 0, softBookedHours: 0, hardBookedHours: 0 },
                };

                state.engineers.forEach((eng) => {
                    if (pool[eng.role]) {
                        pool[eng.role].totalMonthlyHours += eng.monthlyCapacityHours;
                    }
                });

                state.deals.forEach((deal) => {
                    const status = deal.status || 'inquiry';
                    if (status === "lost") return;

                    if (status === "won" || status === "contract") {
                        (deal.hardAssignments || []).forEach((assignment) => {
                            const eng = state.engineers.find((e) => e.id === assignment.employeeId);
                            if (eng && pool[eng.role]) {
                                pool[eng.role].hardBookedHours += assignment.allocatedHours;
                            }
                        });
                    } else {
                        (deal.ghostRoles || []).forEach((gr) => {
                            const totalRequiredHours = gr.quantity * 160;
                            const prob = deal.winProbability || 0;
                            const softBooked = calculateSoftBookedHours(totalRequiredHours, prob);
                            if (pool[gr.roleType]) {
                                pool[gr.roleType].softBookedHours += softBooked;
                            }
                        });
                    }
                });

                return Object.values(pool);
            },

            getFinancialPnL: () => {
                const state = get();
                const monthlyData: Record<string, { revenue: number, directLabor: number, overhead: number }> = {};

                // Revenue: only count Paid invoices
                state.invoices
                    .filter(inv => inv.status === 'Paid')
                    .forEach(inv => {
                        const month = new Date(inv.issueDate).toLocaleString('default', { month: 'short', year: 'numeric', timeZone: 'UTC' });
                        if (!monthlyData[month]) monthlyData[month] = { revenue: 0, directLabor: 0, overhead: 0 };
                        monthlyData[month].revenue += inv.amount;
                    });

                // Direct Labor: only count Approved time entries
                state.timeEntries
                    .filter(entry => entry.status === 'Approved')
                    .forEach(entry => {
                        const month = new Date(entry.date).toLocaleString('default', { month: 'short', year: 'numeric', timeZone: 'UTC' });
                        if (!monthlyData[month]) monthlyData[month] = { revenue: 0, directLabor: 0, overhead: 0 };
                        const emp = state.employees.find(e => e.id === entry.employeeId);
                        const hourlyCost = emp ? emp.costPerHour : 0;
                        monthlyData[month].directLabor += (entry.hours * hourlyCost);
                    });

                const totalMonthlyGlobalOverhead = state.globalOverheads.reduce((sum, oh) => sum + oh.monthlyCost, 0);

                Object.keys(monthlyData).forEach(month => {
                    monthlyData[month].overhead += totalMonthlyGlobalOverhead;
                });

                return Object.keys(monthlyData).map(month => {
                    const { revenue, directLabor, overhead } = monthlyData[month];
                    const grossProfit = revenue - directLabor;
                    const operatingProfit = grossProfit - overhead;
                    const netProfit = operatingProfit * 0.8;

                    return { month, revenue, directLabor, overhead, grossProfit, operatingProfit, netProfit };
                });
            }
        }),
        {
            name: "unified-agency-store",
            skipHydration: true,
        }
    )
);
