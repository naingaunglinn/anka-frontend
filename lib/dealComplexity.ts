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
    /** +0.5 per additional hard-domain keyword beyond the first (max +1.0) — co-occurring hard signals compound risk. */
    domainDepth: number
}

export interface ComplexityResult {
    /** Rounded to 1 decimal place; clamped to [0, 10]. */
    score: number
    band: ComplexityBand
    signals: ComplexitySignals
}

// Split into two simpler patterns to stay within linter complexity limits.
const HARD_KEYWORDS_A = /\b(compliance|hipaa|pci|gdpr|soc2|real.?time|low.?latency|multi.?tenant)\b/i
const HARD_KEYWORDS_B = /\b(distributed|machine.?learning|blockchain|payments?|fintech|streaming|kubernetes)\b/i
const MEDIUM_KEYWORDS = /\b(dashboard|integration|admin|crud|portal|cms|microservice|api|migration|reporting|analytics)\b/i

function testHardKeywords(text: string): boolean {
    return HARD_KEYWORDS_A.test(text) || HARD_KEYWORDS_B.test(text)
}

function countHardMatches(text: string): number {
    let count = 0
    const reA = new RegExp(HARD_KEYWORDS_A.source, 'gi')
    const reB = new RegExp(HARD_KEYWORDS_B.source, 'gi')
    while (reA.exec(text) !== null) count++
    while (reB.exec(text) !== null) count++
    return count
}

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
    const hardKeyword   = testHardKeywords(description) ? 2 : 0
    const mediumKeyword = MEDIUM_KEYWORDS.test(description) ? 1 : 0

    // Co-occurrence bonus: multiple hard-domain signals compound risk.
    const hardMatchCount = countHardMatches(description)
    const domainDepth = hardMatchCount >= 2 ? Math.min(hardMatchCount - 1, 2) * 0.5 : 0

    const uniqueRoleTypes = new Set(
        (input.ghostRoles ?? [])
            .map(g => g.roleType)
            .filter((r): r is string => typeof r === 'string' && r.length > 0),
    )
    const ghostVariety = uniqueRoleTypes.size * 0.3

    const rawScore = burnRate + skillBreadth + hardKeyword + mediumKeyword + ghostVariety + domainDepth
    // Round to 1dp before clamping so the user-facing score is stable across
    // tiny floating-point drift in burnRate.
    const score = Math.max(0, Math.min(10, Math.round(rawScore * 10) / 10))

    let band: ComplexityBand = 'hard'
    if (score <= EASY_MAX_SCORE) band = 'easy'
    else if (score <= MEDIUM_MAX_SCORE) band = 'medium'

    return {
        score,
        band,
        signals: { burnRate, skillBreadth, hardKeyword, mediumKeyword, ghostVariety, domainDepth },
    }
}

// ─── "Need Management" recommendation ────────────────────────────────────
//
// Drives the AI Team Builder's leadership toggle. Returns a recommended
// boolean PLUS a short reasoning string the UI shows beside the toggle, so
// the user understands WHY the AI is suggesting on/off and can override
// with confidence. Pure derivation from existing complexity signals + ghost
// roles + timeline — no extra Claude call needed.

export interface ManagementRecommendation {
    /** True = the team should include a leadership-level employee. */
    recommended: boolean
    /** 1-2 sentence explanation, surfaced in the UI next to the toggle. */
    reasoning: string
}

export function recommendManagement(
    complexity: ComplexityResult,
    ghostRoleCount: number,
    timelineMonths: number,
): ManagementRecommendation {
    const months = Math.max(1, timelineMonths || 0)

    // Hard projects always benefit from leadership — coordination overhead
    // and risk warrant a senior coordinator regardless of duration.
    if (complexity.band === 'hard') {
        return {
            recommended: true,
            reasoning: `Hard complexity (${complexity.score.toFixed(1)}/10) — coordination + risk warrant a Lead.`,
        }
    }

    // Medium projects: lean on additional signals.
    if (complexity.band === 'medium') {
        if (ghostRoleCount >= 3) {
            return {
                recommended: true,
                reasoning: `Medium complexity, ${ghostRoleCount} workstreams — multi-discipline coordination needs a Senior+.`,
            }
        }
        if (months >= 4) {
            return {
                recommended: true,
                reasoning: `Medium complexity, ${months}-month timeline — long enough that leadership pays off.`,
            }
        }
        return {
            recommended: false,
            reasoning: `Medium complexity, single workstream and short timeline — small enough to skip leadership overhead.`,
        }
    }

    // Easy projects: skip leadership unless the ghost-role variety hints
    // otherwise (e.g. a "small" project that nonetheless touches design +
    // backend + PM probably needs someone to own it).
    if (ghostRoleCount >= 3) {
        return {
            recommended: true,
            reasoning: `Easy band but ${ghostRoleCount} workstreams — coordination across disciplines warrants a Senior+.`,
        }
    }

    return {
        recommended: false,
        reasoning: `Easy complexity (${complexity.score.toFixed(1)}/10) and lean scope — no need to spend budget on a Lead.`,
    }
}
