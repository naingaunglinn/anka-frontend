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

// --- Initial Mock Data ---

const INITIAL_ENGINEERS: Engineer[] = [
    { id: "e1", name: "Alice Frontend", role: "frontend", monthlySalary: 8000, monthlyCapacityHours: 160 },
    { id: "e2", name: "Bob Backend", role: "backend", monthlySalary: 9000, monthlyCapacityHours: 160 },
    { id: "e3", name: "Charlie PM", role: "pm", monthlySalary: 7000, monthlyCapacityHours: 160 },
    { id: "e4", name: "Diana QA", role: "qa", monthlySalary: 6000, monthlyCapacityHours: 160 },
    { id: "e5", name: "Eve Frontend", role: "frontend", monthlySalary: 7500, monthlyCapacityHours: 160 },
];


const MOCK_DEPARTMENTS: Department[] = [
    { id: "d1", name: "Engineering", manager: "Alice Roberts", headcount: 3 },
    { id: "d2", name: "Design", manager: "Mark Smith", headcount: 1 },
];

const MOCK_ROLES: Role[] = [
    { id: "r1", title: "Senior Developer", department: "Engineering", rate: 150 },
    { id: "r2", title: "Mid Developer", department: "Engineering", rate: 100 },
    { id: "r3", title: "UI/UX Designer", department: "Design", rate: 120 },
    { id: "r4", title: "Project Manager", department: "Engineering", rate: 130 },
];

const MOCK_EMPLOYEES: Employee[] = [
    { id: "e1", name: "John Doe", role: "r1", monthlySalary: 8000, workableHours: 160, costPerHour: 50, status: "Active" },
    { id: "e2", name: "Jane Smith", role: "r3", monthlySalary: 6400, workableHours: 160, costPerHour: 40, status: "Active" },
    { id: "e3", name: "Bob Backend", role: "r2", monthlySalary: 5600, workableHours: 160, costPerHour: 35, status: "Active" },
    { id: "e4", name: "Alice PM", role: "r4", monthlySalary: 7200, workableHours: 160, costPerHour: 45, status: "Active" },
];

const MOCK_OVERHEADS: GlobalOverhead[] = [
    { id: "o1", category: "Software Licenses", description: "AWS, GitHub, Slack, Figma", monthlyCost: 5200 },
    { id: "o2", category: "Office Rent", description: "HQ Lease", monthlyCost: 12000 },
];

const MOCK_SETTINGS: CompanySettings = {
    overheadPercentage: 20,
    bufferPercentage: 10,
    yearlyFixedCost: 500000,
};

const MOCK_DEALS: Deal[] = [
    {
        id: "deal-1",
        name: "Cloud Migration",
        client: "Acme Corp",
        estimatedValue: 120000,
        winProbability: 100,
        status: "won",
        targetMargin: 30,
        estimationResources: [
            { id: "res1", featureName: "Architecture Setup", roleId: "r1", hours: 100 },
            { id: "res2", featureName: "Data Migration", roleId: "r2", hours: 200 },
        ],
        projectOverheads: [{ id: "po1", name: "AWS Setup Fee", cost: 2000 }],
    },
    {
        id: "deal-2",
        name: "Mobile App Redesign",
        client: "Startup Inc",
        estimatedValue: 85000,
        winProbability: 75,
        status: "proposal",
        targetMargin: 40,
        estimationResources: [
            { id: "res3", featureName: "UI/UX Design", roleId: "r3", hours: 120 },
            { id: "res4", featureName: "Frontend Dev", roleId: "r2", hours: 160 },
        ],
        projectOverheads: [],
    },
    {
        id: "deal-3",
        name: "Security Audit",
        client: "Global Tech",
        estimatedValue: 45000,
        winProbability: 20,
        status: "lead",
        targetMargin: 25,
        estimationResources: [],
        projectOverheads: [],
    },
];

const MOCK_CONTRACTS: Contract[] = [
    { id: "CON-001", dealId: "deal-1", client: "Acme Corp", totalValue: 120000, revenueRecognized: 40000, status: "Active" }
];

const MOCK_INVOICES: Invoice[] = [
    { id: "INV-1042", contractId: "CON-001", date: "2024-03-01", amount: 40000, tax: 4000, status: "Paid" },
    { id: "INV-1043", contractId: "CON-001", date: "2024-04-01", amount: 40000, tax: 4000, status: "Pending" }
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
    updateCompanySettings: (settings: Partial<CompanySettings>) => void;
    addEmployee: (emp: Employee) => void;
    updateEmployee: (id: string, emp: Partial<Employee>) => void;
    deleteEmployee: (id: string) => void;
    addRole: (role: Role) => void;
    updateRole: (id: string, role: Partial<Role>) => void;
    deleteRole: (id: string) => void;
    addDepartment: (dept: Department) => void;
    updateDepartment: (id: string, dept: Partial<Department>) => void;
    deleteDepartment: (id: string) => void;
    addGlobalOverhead: (oh: GlobalOverhead) => void;
    updateGlobalOverhead: (id: string, oh: Partial<GlobalOverhead>) => void;
    deleteGlobalOverhead: (id: string) => void;

    // Actions - CRM & Deals
    addDeal: (deal: Deal) => void;
    updateDeal: (id: string, updates: Partial<Deal>) => void;
    deleteDeal: (id: string) => void;
    updateDealStage: (id: string, status: string, probability?: number) => void;
    assignEngineer: (dealId: string, engineerId: string, allocatedHours: number) => void;


    // Actions - Cross-module trigger
    winDeal: (dealId: string) => void;

    // Actions - Time tracking
    addTimeEntry: (entry: TimeEntry) => void;

    // Actions - Contracts/Billing
    addInvoice: (invoice: Invoice) => void;

    // Getters
    getCapacityPool: () => DepartmentCapacity[];
    getFinancialPnL: () => any[];
    getDealEstimation: (dealId: string) => { laborCost: number; overheadCost: number; suggestedPrice: number; expectedProfit: number; totalCost: number };
}

// --- Store Implementation ---

export const useBusinessStore = create<BusinessState>()(
    persist(
        (set, get) => ({
            departments: MOCK_DEPARTMENTS,
            roles: MOCK_ROLES,
            employees: MOCK_EMPLOYEES,
            engineers: INITIAL_ENGINEERS,
            globalOverheads: MOCK_OVERHEADS,
            companySettings: MOCK_SETTINGS,
            deals: MOCK_DEALS,
            contracts: MOCK_CONTRACTS,
            invoices: MOCK_INVOICES,
            milestones: MOCK_MILESTONES,
            projects: MOCK_PROJECTS,
            timeEntries: MOCK_TIME_ENTRIES,

            updateCompanySettings: (settings) => set((state) => ({ companySettings: { ...state.companySettings, ...settings } })),

            // Org Handlers
            addEmployee: (emp) => set((state) => ({ employees: [...state.employees, emp] })),
            updateEmployee: (id, emp) => set((state) => ({ employees: state.employees.map(e => e.id === id ? { ...e, ...emp } : e) })),
            deleteEmployee: (id) => set((state) => ({ employees: state.employees.filter(e => e.id !== id) })),

            addRole: (role) => set((state) => ({ roles: [...state.roles, role] })),
            updateRole: (id, role) => set((state) => ({ roles: state.roles.map(r => r.id === id ? { ...r, ...role } : r) })),
            deleteRole: (id) => set((state) => ({ roles: state.roles.filter(r => r.id !== id) })),

            addDepartment: (dept) => set((state) => ({ departments: [...state.departments, dept] })),
            updateDepartment: (id, dept) => set((state) => ({ departments: state.departments.map(d => d.id === id ? { ...d, ...dept } : d) })),
            deleteDepartment: (id) => set((state) => ({ departments: state.departments.filter(d => d.id !== id) })),

            addGlobalOverhead: (oh) => set((state) => ({ globalOverheads: [...state.globalOverheads, oh] })),
            updateGlobalOverhead: (id, oh) => set((state) => ({ globalOverheads: state.globalOverheads.map(o => o.id === id ? { ...o, ...oh } : o) })),
            deleteGlobalOverhead: (id) => set((state) => ({ globalOverheads: state.globalOverheads.filter(o => o.id !== id) })),

            // CRM Handlers
            addDeal: (deal) => set((state) => ({ deals: [...state.deals, deal] })),
            updateDeal: (id, updates) => set((state) => ({ deals: state.deals.map(d => d.id === id ? { ...d, ...updates } : d) })),
            deleteDeal: (id) => set((state) => ({ deals: state.deals.filter(d => d.id !== id) })),
            updateDealStage: (id, status, probability) => set((state) => ({
                deals: state.deals.map(d => d.id === id ? { ...d, status: status as any, winProbability: probability } : d)
            })),

            winDeal: (dealId) => {
                const state = get();
                const deal = state.deals.find(d => d.id === dealId);
                if (!deal) return;

                // Mark deal as won
                get().updateDealStage(dealId, 'won', 100);

                // Auto-generate Contract
                const newContract: Contract = {
                    id: `CON-${Math.floor(Math.random() * 10000)}`,
                    dealId: deal.id,
                    client: deal.client || "Client",
                    totalValue: deal.clientBudget || deal.estimatedValue || 0,
                    revenueRecognized: 0,
                    status: 'Active'
                };

                // Auto-generate Project
                const est = get().getDealEstimation(dealId);
                const totalHoursLegacy = (deal.estimationResources || []).reduce((sum, res) => sum + res.hours, 0);
                const totalHours = deal.workloadHours || totalHoursLegacy || 0;

                const newProject: Project = {
                    id: `PRJ-${Math.floor(Math.random() * 10000)}`,
                    contractId: newContract.id,
                    name: deal.name,
                    client: deal.client || "Client",
                    budgetHours: totalHours > 0 ? totalHours : 0, // Fallback if no estimation provided
                    consumedHours: 0,
                    status: 'Not Started'
                };

                set((state) => ({
                    contracts: [...state.contracts, newContract],
                    projects: [...state.projects, newProject]
                }));
            },

            addTimeEntry: (entry) => set((state) => {
                // Also update project consumed hours automatically
                const updatedProjects = state.projects.map(p => {
                    if (p.id === entry.projectId) {
                        return { ...p, consumedHours: p.consumedHours + entry.hours, status: 'On Track' as any };
                    }
                    return p;
                });
                return { timeEntries: [...state.timeEntries, entry], projects: updatedProjects };
            }),

            addInvoice: (invoice) => set((state) => ({ invoices: [...state.invoices, invoice] })),

            getDealEstimation: (dealId) => {
                const state = get();
                const deal = state.deals.find(d => d.id === dealId);
                if (!deal) return { laborCost: 0, overheadCost: 0, suggestedPrice: 0, expectedProfit: 0, totalCost: 0 };

                // If deal has the new calculated fields from the unified form, return them
                if (deal.totalEstimatedCost !== undefined) {
                    return {
                        laborCost: deal.baseLaborCost || 0,
                        overheadCost: (deal.overheadCost || 0) + (deal.bufferCost || 0),
                        suggestedPrice: deal.clientBudget || 0,
                        expectedProfit: deal.estimatedGrossProfit || 0,
                        totalCost: deal.totalEstimatedCost || 0
                    };
                }

                // Fallback to old dynamic calculation for legacy deals
                let laborCost = 0;
                (deal.estimationResources || []).forEach(res => {
                    const role = state.roles.find(r => r.id === res.roleId);
                    // Use employee costPerHour or fall back to a default cost based on billing rate (e.g., 50% of bill rate)
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

            assignEngineer: (dealId, engineerId, allocatedHours) =>
                set((state) => {
                    return {
                        deals: state.deals.map((deal) => {
                            if (deal.id !== dealId) return deal;

                            const existingAssignments = deal.hardAssignments || [];
                            const assignmentIndex = existingAssignments.findIndex(
                                (a) => a.engineerId === engineerId
                            );

                            let newAssignments = [...existingAssignments];

                            if (assignmentIndex >= 0) {
                                if (allocatedHours === 0) {
                                    newAssignments.splice(assignmentIndex, 1);
                                } else {
                                    newAssignments[assignmentIndex] = {
                                        engineerId,
                                        allocatedHours,
                                    };
                                }
                            } else if (allocatedHours > 0) {
                                newAssignments.push({ engineerId, allocatedHours });
                            }

                            return { ...deal, hardAssignments: newAssignments };
                        }),
                    };
                }),

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
                        const hardAssignments = deal.hardAssignments || [];
                        hardAssignments.forEach((assignment) => {
                            const eng = state.engineers.find((e) => e.id === assignment.engineerId);
                            if (eng && pool[eng.role]) {
                                pool[eng.role].hardBookedHours += assignment.allocatedHours;
                            }
                        });
                    } else {
                        (deal.ghostRoles || []).forEach((gr) => {
                            const totalRequiredHours = gr.quantity * 160;
                            const prob = deal.winProbability || 0;
                            const softBooked = calculateSoftBookedHours(totalRequiredHours, prob);
                            if (pool[gr.role]) {
                                pool[gr.role].softBookedHours += softBooked;
                            }
                        });
                    }
                });

                return Object.values(pool);
            },

            getFinancialPnL: () => {
                const state = get();
                // Simple group by month
                const monthlyData: Record<string, { revenue: number, directLabor: number, overhead: number }> = {};

                // 1. Revenue from Invoices
                state.invoices.forEach(inv => {
                    const month = new Date(inv.date).toLocaleString('default', { month: 'short' });
                    if (!monthlyData[month]) monthlyData[month] = { revenue: 0, directLabor: 0, overhead: 0 };
                    monthlyData[month].revenue += inv.amount;
                });

                // 2. Direct Labor from Time Entries
                state.timeEntries.forEach(entry => {
                    const month = new Date(entry.date).toLocaleString('default', { month: 'short' });
                    if (!monthlyData[month]) monthlyData[month] = { revenue: 0, directLabor: 0, overhead: 0 };

                    const emp = state.employees.find(e => e.id === entry.employeeId);
                    const hourlyCost = emp ? emp.costPerHour : 0;
                    monthlyData[month].directLabor += (entry.hours * hourlyCost);
                });

                // 3. Global Overhead applied monthly (distribute total monthly overhead)
                const totalMonthlyGlobalOverhead = state.globalOverheads.reduce((sum, oh) => sum + oh.monthlyCost, 0);

                Object.keys(monthlyData).forEach(month => {
                    monthlyData[month].overhead += totalMonthlyGlobalOverhead;
                });

                // Convert to array and calculate profits
                return Object.keys(monthlyData).map(month => {
                    const { revenue, directLabor, overhead } = monthlyData[month];
                    const grossProfit = revenue - directLabor;
                    const operatingProfit = grossProfit - overhead;
                    const netProfit = operatingProfit * 0.8; // Simple 20% tax

                    return { month, revenue, directLabor, overhead, grossProfit, operatingProfit, netProfit };
                });
            }
        }),
        {
            name: "unified-agency-store",
        }
    )
);
