import type { Employee, Engineer, GlobalOverhead, CompanySettings } from './business'
import type { Currency } from '@/lib/currencyConfig'
import type { ComplexityResult } from '@/lib/dealComplexity'

export interface AITeamBuilderInput {
    dealId: string
    /** Deal title — surfaced in the prompt so Claude knows which project it's staffing. */
    dealName?: string
    /** Client name — gives Claude additional context (industry signals, etc.). */
    dealClient?: string
    /**
     * "Need Management" toggle. When TRUE (default) the prompt forces the AI
     * to include at least one leadership-level employee (rank.level ≥ 30 OR
     * a roleTitle marking them as Lead/Senior/Head/Manager). When FALSE the
     * leadership requirement is dropped so small projects can be staffed
     * lean without a token senior on top.
     */
    requireLeadership?: boolean
    /**
     * Rich per-employee context fetched from the backend
     * /deals/{deal}/ai-team-builder-context endpoint. Carries rank +
     * past_projects (capped at 3, only Active/Completed, skipped for
     * employees with no skill overlap to save tokens). When unavailable
     * the prompt falls back to the static employees array + roleTitle
     * keyword matching.
     */
    employeeContext?: AITeamBuilderEmployeeContext[]
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

/**
 * Rich employee context shape returned by the AI-team-builder-context endpoint.
 * Kept snake_case to mirror the Laravel payload — the prompt builder
 * consumes this verbatim without renaming.
 */
export interface AITeamBuilderEmployeeContext {
    id: string
    name: string
    role?: string
    role_name?: string | null
    capacity_role?: string | null
    capacity_role_name?: string | null
    monthly_salary: number
    workable_hours: number
    cost_per_hour: number
    status: string
    rank: {
        id: string
        code: string
        name: string
        level: number
    } | null
    skills: Array<{
        skill_id: string
        name: string
        category?: string | null
        proficiency?: 'beginner' | 'intermediate' | 'expert' | null
    }>
    past_projects: Array<{
        id: string
        name: string
        client: string | null
        status: string
        start_date: string | null
        deal_description: string | null
    }>
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
