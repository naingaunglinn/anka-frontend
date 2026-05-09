import type { Employee, Engineer, GlobalOverhead, CompanySettings } from './business'
import type { Currency } from '@/lib/currencyConfig'
import type { ComplexityResult } from '@/lib/dealComplexity'

export interface AITeamBuilderInput {
    dealId: string
    clientBudget: number
    timelineMonths: number
    workloadHours: number
    workloadDescription: string
    workloadDocumentText?: string
    requiredSkills?: string[]           // skill names required for this project
    /**
     * Pre-computed difficulty band + score. Drives the target team size in
     * the system prompt (easy → 2 people, medium → 3-4, hard → 5-7).
     * Computed deterministically by lib/dealComplexity so Claude doesn't
     * have to infer "is this hard?" from prose.
     */
    complexity?: ComplexityResult
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
