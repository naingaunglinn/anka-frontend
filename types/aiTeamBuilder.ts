import type { Employee, Engineer, GlobalOverhead, CompanySettings } from './business'
import type { Currency } from '@/lib/currencyConfig'
import type { ComplexityResult } from '@/lib/dealComplexity'

export interface AITeamBuilderInput {
    dealId: string
    /** Deal title — surfaced in the prompt so Claude knows which project it's staffing. */
    dealName?: string
    /** Client name — gives Claude additional context (industry signals, etc.). */
    dealClient?: string
    clientBudget: number
    timelineMonths: number
    workloadHours: number
    workloadDescription: string
    workloadDocumentText?: string
    requiredSkills?: string[]
    complexity?: ComplexityResult
    employees: Employee[]
    engineers: Engineer[]
    globalOverheads: GlobalOverhead[]
    companySettings: CompanySettings
    currency?: Currency
    /** employeeId → available monthly hours after subtracting load from other open deals */
    employeeAvailability?: Record<string, number>
    /** Ghost roles the user pre-defined in Cost Estimate — used as a soft team-shape constraint */
    ghostRoles?: Array<{ roleType: string; quantity: number; minMonthlySalary: number; maxMonthlySalary: number }>
    /** Last AI result — passed on regeneration so Claude can produce a meaningfully different suggestion */
    previousResult?: AITeamBuilderResult
    /** Optional user note explaining why they're regenerating */
    regenerateFeedback?: string
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
