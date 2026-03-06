import type { Employee, Engineer, GlobalOverhead, CompanySettings } from './business'

export interface AITeamBuilderInput {
    dealId: string
    clientBudget: number
    timelineMonths: number
    workloadHours: number
    workloadDescription: string
    workloadDocumentText?: string
    employees: Employee[]
    engineers: Engineer[]
    globalOverheads: GlobalOverhead[]
    companySettings: CompanySettings
}

export interface AITeamMember {
    employeeId: string
    name: string
    role: string
    allocatedHours: number
    monthlySalary: number
    costPerHour: number
    totalCost: number
    reasoning: string
}

export interface AITeamBuilderResult {
    team: AITeamMember[]
    baseLaborCost: number
    overheadCost: number
    bufferCost: number
    totalEstimatedCost: number
    estimatedGrossProfit: number
    profitMarginPercent: number
    isFeasible: boolean
    feasibilityNote: string
    aiReasoning: string
    warnings: string[]
}
