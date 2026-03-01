export type RoleType = "frontend" | "backend" | "pm" | "qa" | "design" | string;

// --- Organization ---
export interface Role {
    id: string;
    title: string;
    department: string;
    rate: number; // Billable rate to client
}

export interface Department {
    id: string;
    name: string;
    manager: string;
    headcount: number;
}

export interface Employee {
    id: string;
    name: string;
    role: string;
    monthlySalary: number;
    workableHours: number;
    costPerHour: number;
    status: 'Active' | 'On Leave' | 'Terminated';
}

export interface Engineer {
    id: string;
    name: string;
    role: RoleType;
    monthlySalary: number;
    monthlyCapacityHours: number;
}

export interface DepartmentCapacity {
    role: RoleType;
    totalMonthlyHours: number;
    softBookedHours: number;
    hardBookedHours: number;
}

export interface GlobalOverhead {
    id: string;
    category: string;
    description: string;
    monthlyCost: number;
}

export interface CompanySettings {
    overheadPercentage: number;
    bufferPercentage: number;
    yearlyFixedCost: number;
}

// --- CRM & Estimation ---
export interface EstimationResource {
    id: string;
    featureName: string;
    roleId: string; // Links to Role
    hours: number;
}

export interface ProjectOverhead {
    id: string;
    name: string;
    cost: number;
}

export interface GhostRole {
    id: string;
    role: RoleType;
    quantity: number;
    months: number;
    avgMonthlySalary: number;
}

export interface HardAssignment {
    engineerId: string;
    allocatedHours: number;
}

export interface Deal {
    id: string;
    name: string;
    client?: string;
    estimatedValue?: number;
    winProbability?: number;
    status?: "lead" | "opportunity" | "inquiry" | "proposal" | "contract" | "won" | "lost";

    // Legacy fields for Deals UI
    clientBudget?: number;
    timelineMonths?: number;
    workloadHours?: number;
    ghostRoles?: GhostRole[];
    hardAssignments?: HardAssignment[];
    baseLaborCost?: number;
    overheadCost?: number;
    bufferCost?: number;
    totalEstimatedCost?: number;
    estimatedGrossProfit?: number;

    // Estimation Data attached to Deal 
    estimationResources?: EstimationResource[];
    projectOverheads?: ProjectOverhead[];
    targetMargin?: number;
}

// --- Contracts & Billing ---
export interface Contract {
    id: string;
    dealId: string;
    client: string;
    totalValue: number;
    revenueRecognized: number;
    status: 'Active' | 'Completed' | 'Draft';
}

export interface Invoice {
    id: string;
    contractId: string;
    date: string;
    amount: number;
    tax: number;
    status: 'Draft' | 'Pending' | 'Paid';
}

export interface Milestone {
    id: string;
    contractId: string;
    name: string;
    dueDate: string;
    amount: number;
    status: 'Pending' | 'In Progress' | 'Completed';
}

// --- Projects & Time Tracking ---
export interface Project {
    id: string;
    contractId: string;
    name: string;
    client: string;
    budgetHours: number;
    consumedHours: number;
    status: 'Not Started' | 'On Track' | 'At Risk' | 'Over Budget' | 'Completed';
}

export interface TimeEntry {
    id: string;
    projectId: string;
    employeeId: string;
    task: string;
    date: string; // YYYY-MM-DD
    hours: number;
    billable: boolean;
    status: 'Draft' | 'Pending' | 'Approved';
}

// --- Dashboard Capacity (Derived or Legacy) ---
export interface DepartmentCapacity {
    role: RoleType;
    totalMonthlyHours: number;
    softBookedHours: number;
    hardBookedHours: number;
}
