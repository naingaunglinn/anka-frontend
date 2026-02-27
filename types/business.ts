export type RoleType = "frontend" | "backend" | "pm" | "qa";

export interface GhostRole {
    id: string;
    role: RoleType;
    quantity: number;
    months: number;
    avgMonthlySalary: number;
}

export interface Engineer {
    id: string;
    name: string;
    role: RoleType;
    monthlySalary: number;
    monthlyCapacityHours: number;
}

export interface HardAssignment {
    engineerId: string;
    allocatedHours: number;
}

export interface Deal {
    id: string;
    name: string;
    clientBudget: number;
    timelineMonths: number;
    workloadHours: number;
    probability: number; // 0-100
    stage: "inquiry" | "proposal" | "won" | "lost";

    ghostRoles: GhostRole[];

    hardAssignments?: HardAssignment[];

    baseLaborCost: number;
    overheadCost: number;
    bufferCost: number;
    totalEstimatedCost: number;
    estimatedGrossProfit: number;
}

export interface DepartmentCapacity {
    role: RoleType;
    totalMonthlyHours: number;
    softBookedHours: number;
    hardBookedHours: number;
}

export interface CompanySettings {
    overheadPercentage: number;
    bufferPercentage: number;
    yearlyFixedCost: number;
}
