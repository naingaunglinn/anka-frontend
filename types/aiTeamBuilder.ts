import type { Employee, Engineer, GlobalOverhead, CompanySettings, RoleType, CapacityRole, Rank } from './business'
import type { Currency } from '@/lib/currencyConfig'
import type { ComplexityResult } from '@/lib/dealComplexity'

export interface AITeamBuilderInput {
    dealId: string
    /**
     * Output shape. 'employees' (default) makes Claude pick specific Employees
     * from the pool and return `team` (per-person picks). 'roles' makes Claude
     * suggest a ghost-role-shaped composition using the tenant's Engineer
     * salary brackets — used by /estimation, which costs the deal at role
     * level before any staffing decision is made.
     */
    outputMode?: 'employees' | 'roles'
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
    /**
     * Tenant's capacity roles (from /organization → Capacity Roles). When
     * present, the role-mode prompt uses these as the allowed role buckets
     * instead of the hardcoded frontend/backend/design/qa/pm seed list.
     * Each engineer's `role` field must match one of these `code` values
     * for the engineer to be considered.
     */
    availableRoles?: CapacityRole[]
    /**
     * Tenant's seniority ranks (from /organization → Ranks). When present,
     * the role-mode prompt asks the AI to split each chosen role bucket
     * into rank-specific rows, so a "Backend × 2" suggestion becomes
     * "Backend Senior × 1" + "Backend Mid × 1" with rank-appropriate
     * salary ranges. Higher `level` = more senior.
     */
    availableRanks?: Rank[]
    /**
     * Pre-existing Scope & Labor estimate aggregated by capacity-role code
     * (the Option A anchor). When present, the role-mode prompt is told to
     * treat these as the canonical per-bucket workload — overriding its
     * own generic 50/30/10/7/3 distribution heuristic. The `roleCode` may
     * be one of the tenant's capacity_role codes OR the sentinel
     * "unmapped" for hours whose job_role didn't resolve to a capacity
     * bucket; the AI is told to redistribute the unmapped slice.
     */
    scopeBreakdown?: Array<{ roleCode: string; hours: number }>
    /** Total of scopeBreakdown — convenience; the prompt also computes this. */
    scopeTotalHours?: number
    globalOverheads: GlobalOverhead[]
    companySettings: CompanySettings
    currency?: Currency
    expectedCloseDate?: string
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

/**
 * Role-shaped output used when AITeamBuilderInput.outputMode === 'roles'.
 * Maps cleanly onto deal_ghost_roles when the user accepts the suggestion.
 */
export interface AISuggestedRole {
    roleType: RoleType
    /** Display label — e.g. "Backend Engineer" or "Backend Engineer (Senior)". */
    label: string
    /**
     * Rank code matching one of the tenant's Rank.code values (e.g.
     * "Junior" / "Mid" / "Senior" / "Lead"). Null when ranks weren't passed
     * in the input (backward compat) or the AI chose not to specify
     * seniority. When present, each suggestion row represents one
     * (role × rank) cohort — the AI splits multi-quantity buckets into
     * one row per rank to make seniority intent explicit.
     */
    rankCode?: string | null
    quantity: number
    /** Months on the project. Often equals timelineMonths, but Claude may shorten for late-stage roles. */
    months: number
    /** Total project hours for this role bucket (across all `quantity` slots). */
    allocatedHours: number
    /** Cost-bracket range pulled from the tenant's engineers list. */
    minMonthlySalary: number
    maxMonthlySalary: number
    /** Mid-point × quantity × months — convenience, frontend can recompute. */
    estimatedCost: number
    reasoning: string
}

export interface AITeamBuilderResult {
    team: AITeamMember[]
    /** Populated when outputMode === 'roles'. Empty/undefined in employees mode. */
    roles?: AISuggestedRole[]
    /**
     * Populated by role mode when the input did not specify workloadHours
     * (or sent zero). Claude proposes a total hour count based on the
     * project description, budget, and timeline. The frontend displays it
     * and the user can save it back to the deal if they want.
     */
    estimatedTotalHours?: number
    /**
     * Role mode only. Σ (quantity × months × 160) across all suggested roles.
     * The prompt requires this to be ≥ estimatedTotalHours and ≤ 1.15× it.
     */
    totalCapacityHours?: number
    /**
     * Role mode only. totalCapacityHours / estimatedTotalHours, rounded to 2dp.
     * Coverage check: a value < 1.0 means the suggested team cannot deliver
     * the workload in the timeline — the server-side validator retries when
     * this happens, and the frontend surfaces a warning if it still slips.
     */
    coverageRatio?: number
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
