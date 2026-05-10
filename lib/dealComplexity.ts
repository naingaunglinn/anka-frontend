/**
 * Deterministic project-difficulty heuristic for the AI Team Builder.
 *
 * Computes a 0-10 score and an easy/medium/hard band from signals available
 * at deal-creation or AI-team-build time. Used as a structured input to
 * Claude so team size matches project difficulty (easy → 2 people, medium →
 * 3-4, hard → 5-7) without Claude having to infer "is this hard?" from prose.
 *
 * Phase 1: derived only — no DB column. Lives in this pure module so the
 * formula is easy to tweak without a migration. When complexity earns a
 * second consumer (filtering, dashboard KPIs, manual override), promote it
 * to a stored column on `deals`/`projects`.
 */

export type ComplexityBand = 'easy' | 'medium' | 'hard'

export interface ComplexityInput {
    workloadHours: number
    timelineMonths: number
    workloadDescription?: string
    workloadDocumentText?: string
    requiredSkills?: string[]
    /** Deal ghost roles — only `roleType` is read. Pass an empty list if none. */
    ghostRoles?: Array<{ roleType?: string }>
}

export interface ComplexitySignals {
    /** workloadHours per month / 100 — proxies concurrent burn pressure. */
    burnRate: number
    /** requiredSkills.length × 0.5 — multidisciplinary breadth. */
    skillBreadth: number
    /** +2 if description mentions a hard-tech keyword, else 0. */
    hardKeyword: number
    /** +1 if description mentions a medium-tech keyword, else 0. */
    mediumKeyword: number
    /** Distinct ghost role types × 0.3 — team-shape variety from sales' estimate. */
    ghostVariety: number
}

export interface ComplexityResult {
    /** Rounded to 1 decimal place; clamped to [0, 10]. */
    score: number
    band: ComplexityBand
    signals: ComplexitySignals
}

// Curated keyword lists. Hard signals = "needs senior weight, careful design,
// likely a real risk surface". Medium = "non-trivial but well-trodden".
const HARD_KEYWORDS  = /\b(compliance|soc[\s-]?2|hipaa|pci|gdpr|scale|real[\s-]?time|low[\s-]?latency|multi[\s-]?tenant|distributed|machine[\s-]?learning|\bai\b|\bml\b|blockchain|payments?|fintech|millions? of users|streaming|kubernetes)\b/i
const MEDIUM_KEYWORDS = /\b(dashboard|integration|admin|crud|portal|cms|microservice|api|migration|reporting|analytics)\b/i

const EASY_MAX_SCORE   = 2.5
const MEDIUM_MAX_SCORE = 5.5

export function computeDealComplexity(input: ComplexityInput): ComplexityResult {
    // Avoid divide-by-zero on a not-yet-set timeline. Clamp to >=1 month so
    // a "1 hour, 0 month" deal doesn't blow burnRate to Infinity.
    const months = Math.max(1, input.timelineMonths || 0)
    const hours  = Math.max(0, input.workloadHours || 0)

    const burnRate     = (hours / months) / 100
    const skillBreadth = (input.requiredSkills?.length ?? 0) * 0.5

    const description = `${input.workloadDescription ?? ''} ${input.workloadDocumentText ?? ''}`
    const hardKeyword   = HARD_KEYWORDS.test(description)   ? 2 : 0
    const mediumKeyword = MEDIUM_KEYWORDS.test(description) ? 1 : 0

    const uniqueRoleTypes = new Set(
        (input.ghostRoles ?? [])
            .map(g => g.roleType)
            .filter((r): r is string => typeof r === 'string' && r.length > 0),
    )
    const ghostVariety = uniqueRoleTypes.size * 0.3

    const rawScore = burnRate + skillBreadth + hardKeyword + mediumKeyword + ghostVariety
    // Round to 1dp before clamping so the user-facing score is stable across
    // tiny floating-point drift in burnRate.
    const score = Math.max(0, Math.min(10, Math.round(rawScore * 10) / 10))

    const band: ComplexityBand =
        score <= EASY_MAX_SCORE   ? 'easy'
        : score <= MEDIUM_MAX_SCORE ? 'medium'
        : 'hard'

    return {
        score,
        band,
        signals: { burnRate, skillBreadth, hardKeyword, mediumKeyword, ghostVariety },
    }
}
