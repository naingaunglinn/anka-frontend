import type { Employee, Engineer, GlobalOverhead, CompanySettings } from './business'
import type { Currency } from '@/lib/currencyConfig'

export interface AITeamBuilderInput {
    dealId: string
    clientBudget: number
    timelineMonths: number
    workloadHours: number
    workloadDescription: string
    workloadDocumentText?: string
    requiredSkills?: string[]           // skill names required for this project
    employees: Employee[]
    engineers: Engineer[]
    globalOverheads: GlobalOverhead[]
    companySettings: CompanySettings
    currency?: Currency
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
    matchedSkills?: string[]            // skills this member covers
    skillMatchScore?: number             // percentage 0-100
}

export interface SkillGapAnalysis {
    coveredSkills: string[]
    gapSkills: string[]
    recommendations: string[]
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
    skillGapAnalysis?: SkillGapAnalysis  // NEW: AI-generated skill gap analysis
}
