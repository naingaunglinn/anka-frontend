import type { AITeamBuilderInput, AITeamBuilderResult, AITeamMember } from '@/types/aiTeamBuilder'
import { CURRENCY_CONFIG } from '@/lib/currencyConfig'

export const SYSTEM_PROMPT = `Context: You are helping a digital agency plan project staffing and costs.

IMPORTANT: All monetary values in this prompt are in USD (United States Dollars).
The system has already normalized budgets, salaries, and costs to USD using the
tenant's exchange rates. Do NOT convert currencies — use the provided numbers as-is.

Given a project brief and a pool of available employees, produce a staffing recommendation
and cost breakdown following these rules.

- Assign employees from the provided list using their exact IDs.
- Allocated hours per person must not exceed their maxProjectHours.

**Target team shape — apply this FIRST, then refine with the priorities below.**

The user prompt provides a Project Complexity section with a deterministic difficulty band. That band sets the default team size and structure:

  - **easy** (score ≤ 2.5): aim for **2 people total** — 1 hands-on generalist whose capacityRole matches the project description (e.g. a full-stack or designer for a marketing site) + 1 leadership-level employee. Do NOT add specialists, do NOT add a PM, do NOT add extra hands. The project doesn't justify the coordination cost.
  - **medium** (score 2.6–5.5): aim for **3-4 people total** — 2-3 specialists whose capacityRoles cover the project's main workstreams + 1 leadership-level employee. Add a PM only if the description has clear coordination signals (multi-stakeholder, multi-phase, multiple workstreams).
  - **hard** (score > 5.5): aim for **5-7 people total** — specialists across each major workstream + 1 PM-class employee + 1 leadership-level employee. Senior weight increases.

Override the default size only when:
  - Budget can't fit the default shape → downsize and explain the sacrifice in warnings.
  - A required skill can't be covered by the default shape → add the carrier (or list in gapSkills if budget can't afford them).
  - Workload hours can't be absorbed by the default team size → adjust allocations or add hands.

Don't deviate from the band's default size for any other reason. Over-staffing easy projects wastes budget; under-staffing hard projects causes risk.

Each employee in the pool has these fields you should weigh during selection:
  - capacityRole: bucket — frontend / backend / pm / qa / design (or unknown).
  - roleTitle: their billing role text (e.g. "Senior Backend Engineer", "Junior Frontend Engineer", "Scrum Master", "Head of Organization", or null). Read seniority from the title:
      • Leadership: titles containing Lead, Senior, Head, Master, Principal, or Manager.
      • Junior: titles containing Junior, Intern, or Associate.
      • Mid-level: everything else (or null roleTitle).
  - skills: their recorded skills with proficiency (expert/intermediate/beginner).
  - costPerHour, monthlySalary, maxProjectHours: cost & capacity.

Selection priorities — weigh these together to produce the best feasible team. They are NOT strict tiers; trade off as needed.

  1. **Budget feasibility (HARD CONSTRAINT).** totalEstimatedCost must stay ≤ clientBudget. If satisfying the priorities below would blow the budget, hold the budget and explain in warnings + gapSkills which factors were sacrificed and why.

  2. **Required skills.** For every entry in requiredSkills, include a carrier when budget allows, preferring higher proficiency (expert > intermediate > beginner). When budget can't afford to include a carrier, list the skill in gapSkills with a hire/contract recommendation rather than forcing the team over budget.

  3. **Team composition.**
     • Include at least 1 leadership-level employee (roleTitle marks them as Lead/Senior/Head/Master/Principal/Manager) when any exist in the pool — every team needs technical leadership.
     • Include 1 PM-class employee (capacityRole = pm OR roleTitle implies project management) when the project description suggests coordination work (multi-stakeholder, multi-month, multiple workstreams).
     • Balance senior vs junior weight against workload complexity. Short or well-scoped projects tolerate junior-heavy teams; complex or long projects warrant more senior weight. Do NOT staff the entire team with seniors when juniors can handle routine workstreams — that wastes budget.

  4. **Workload coverage.** Collectively, the team's allocatedHours should approximate the project's total workload hours. Underallocate if budget forces it; flag significant underallocation in warnings.

  5. **Capacity-role fit.** Pick capacityRoles that match the project description (e.g. brand-heavy projects need design; data-heavy projects need backend).

  6. **Cost efficiency.** Among comparable candidates, prefer lower costPerHour.

Allocation realism (apply per team member):
  - A specialist covering a single niche skill (brand identity, ML, blockchain, etc.) usually contributes a fraction of project hours — allocate proportional to actual contribution (e.g. 40-160h for a brand-identity specialist on a multi-component build), NOT full project capacity.
  - A leader spends time on guidance and reviews; typical lead allocation is 30-60% of their maxProjectHours.
  - Junior employees can be fully utilized on routine workstreams.

- baseLaborCost = sum of (allocatedHours × costPerHour) for all team members
- overheadCost = baseLaborCost × overheadPercentage
- bufferCost = (baseLaborCost + overheadCost) × bufferPercentage
- totalEstimatedCost = baseLaborCost + overheadCost + bufferCost
- estimatedGrossProfit = clientBudget - totalEstimatedCost
- profitMarginPercent = (estimatedGrossProfit / clientBudget) × 100
- isFeasible = totalEstimatedCost <= clientBudget
- feasibilityNote: if feasible write "Project is within budget", otherwise state the amount it exceeds by
- aiReasoning: 3–5 sentences explaining team selection, balancing skill coverage, leadership, seniority mix, and cost. When a niche-skill specialist was included, say so explicitly and note their allocation rationale.
- warnings: list capacity issues, margins below 10%, budget risks, skill gaps that couldn't fit, or missing leadership.
- skillGapAnalysis: for each team member include matchedSkills and skillMatchScore (percentage of required skills they cover, 0-100). coveredSkills = required skills at least one selected team member has. gapSkills = required skills nobody on the team covers, either because no carrier exists in the pool OR including the carrier would have violated budget feasibility. recommendations = actionable suggestions to fill genuine gaps.

Output format (JSON):
{
  "team": [{ "employeeId": string, "name": string, "role": string, "allocatedHours": number, "monthlySalary": number, "costPerHour": number, "totalCost": number, "reasoning": string, "matchedSkills": string[], "skillMatchScore": number }],
  "baseLaborCost": number,
  "overheadCost": number,
  "bufferCost": number,
  "totalEstimatedCost": number,
  "estimatedGrossProfit": number,
  "profitMarginPercent": number,
  "isFeasible": boolean,
  "feasibilityNote": string,
  "aiReasoning": string,
  "warnings": string[],
  "skillGapAnalysis": {
    "coveredSkills": string[],
    "gapSkills": string[],
    "recommendations": string[]
  }
}`

export function buildUserPrompt(input: AITeamBuilderInput): string {
    const activeEmployees = input.employees
        .filter(e => e.status === 'Active')
        .map(e => {
            // Use real available hours (after other deals) when provided, else fall back to static capacity.
            const availableMonthly = input.employeeAvailability?.[e.id] ?? e.workableHours
            return {
                id: e.id,
                name: e.name,
                capacityRole: e.capacityRole ?? 'unknown',
                roleTitle: e.roleName ?? null,
                costPerHour: e.costPerHour,
                monthlySalary: e.monthlySalary,
                monthlyCapacityHours: availableMonthly,
                maxProjectHours: availableMonthly * input.timelineMonths,
                skills: (e.skills ?? []).map((s: { name?: string; skillId?: string; proficiency?: string }) => ({
                    name: s.name ?? s.skillId ?? 'unknown',
                    proficiency: s.proficiency ?? 'intermediate',
                })),
            }
        })
        // Exclude employees with no available capacity — they can't contribute and waste Claude's context.
        .filter(e => e.maxProjectHours > 0)

    const overheadDecimal = input.companySettings.overheadPercentage / 100
    const bufferDecimal = input.companySettings.bufferPercentage / 100

    const complexitySection = input.complexity
        ? `## Project Complexity (deterministic — use this to size the team)

Computed band: **${input.complexity.band}** (score ${input.complexity.score} / 10)

Signal breakdown:
  - burn rate (workloadHours / months / 100): ${input.complexity.signals.burnRate.toFixed(2)}
  - skill breadth (requiredSkills × 0.5):     ${input.complexity.signals.skillBreadth.toFixed(2)}
  - hard-keyword bonus:                        ${input.complexity.signals.hardKeyword}
  - medium-keyword bonus:                      ${input.complexity.signals.mediumKeyword}
  - ghost-role variety:                        ${input.complexity.signals.ghostVariety.toFixed(2)}

Apply the target team shape from the system prompt for the ${input.complexity.band} band. Deviate only for the override reasons listed there.
`
        : ''

    const sym = '$'

    let ghostRolesSection = ''
    if (input.ghostRoles && input.ghostRoles.length > 0) {
        const lines = input.ghostRoles.map(gr => `- ${gr.quantity}× ${gr.roleType} (salary range: $${gr.minMonthlySalary.toLocaleString()} – $${gr.maxMonthlySalary.toLocaleString()} USD)`).join('\n')
        ghostRolesSection = `## Pre-defined Team Shape (soft constraint)

The user already sketched this composition in Cost Estimate. Respect it unless budget or skill coverage forces a deviation — explain any deviations in warnings.

${lines}

`
    }

    let previousResultSection = ''
    if (input.previousResult) {
        const feedbackNote = input.regenerateFeedback
            ? ` Their feedback: "${input.regenerateFeedback}"`
            : ''
        const regenerateInstruction = input.regenerateFeedback
            ? "Address the user's specific feedback."
            : 'Try a different composition, seniority mix, or allocation strategy.'
        const prevTeam = input.previousResult.team.map(m => `${m.name} (${m.role}, ${m.allocatedHours}h)`).join(', ')
        previousResultSection = `## Previous AI Recommendation (regeneration context)

The user wants a different result.${feedbackNote}

Previous team: ${prevTeam}
Previous total cost: ${sym}${input.previousResult.totalEstimatedCost.toLocaleString()} | margin: ${input.previousResult.profitMarginPercent.toFixed(1)}%

Produce a meaningfully different recommendation. ${regenerateInstruction}

`
    }

    return `## Client Project Brief

Currency: USD (all values normalized to US Dollars)
Budget: $${input.clientBudget.toLocaleString()}
Timeline: ${input.timelineMonths} months
Total Workload: ${input.workloadHours} hours

Project Description:
${input.workloadDescription || 'No description provided.'}
${input.workloadDocumentText
            ? `\nAdditional Document:\n${input.workloadDocumentText.slice(0, 3000)}`
            : ''}

${ghostRolesSection}${previousResultSection}${complexitySection}
## Required Skills
${input.requiredSkills && input.requiredSkills.length > 0
    ? input.requiredSkills.map(s => `- ${s}`).join('\n')
    : 'No specific skills required.'}

## Available Employees (active only — empty \`skills\` array means no recorded skills, NOT that the employee can do anything)

${JSON.stringify(activeEmployees, null, 2)}

---
## Company Financial Settings

Overhead Percentage: ${input.companySettings.overheadPercentage}% (use decimal ${overheadDecimal} for calculations)
Risk Buffer Percentage: ${input.companySettings.bufferPercentage}% (use decimal ${bufferDecimal} for calculations)
Yearly Fixed Cost: $${input.companySettings.yearlyFixedCost.toLocaleString()} (USD)

## Monthly Overhead Items (USD)

${JSON.stringify(
                input.globalOverheads.map(o => ({ category: o.category, monthlyCost: o.monthlyCost })),
                null, 2
            )}

---

## Final compliance checklist (verify BEFORE returning)

  - For each entry in "Required Skills": is some pool employee a carrier? If yes and budget allows, include them. If yes but inclusion would violate budget feasibility, list the skill in gapSkills with a hire/contract recommendation.
  - Does the team have at least one leadership-level employee (roleTitle marks them Lead/Senior/Head/Master/Principal/Manager) when any exist in the pool? If not, fix it before returning.
  - Are allocations realistic? A specialist's allocatedHours should reflect their actual contribution scope, not full project capacity. A leader is typically 30-60% of their maxProjectHours.
  - Does totalEstimatedCost ≤ clientBudget? If not, drop the lowest-impact additions until it does, and explain the trade-offs in warnings.

Build the optimal team and return ONLY the AITeamBuilderResult JSON object.`
}

// ── Server-side enforcement ──────────────────────────────────────────────────
//
// Belt-and-suspenders for the prompt: even with explicit selection rules,
// Claude occasionally leaves a uniquely-skilled employee off the team. Run
// this after parsing Claude's response — for any required skill that isn't
// on the team but IS held by some pool employee, consider force-adding the
// cheapest expert/intermediate/beginner carrier with a small specialist
// allocation. Budget-aware: only adds the carrier when doing so keeps
// totalEstimatedCost ≤ clientBudget. If the addition would violate the
// budget, the skill stays in gapSkills.

const PROFICIENCY_RANK: Record<string, number> = {
    expert: 3,
    intermediate: 2,
    beginner: 1,
}

function findCarrier(
    skill: string,
    employees: AITeamBuilderInput['employees'],
    excludedIds: Set<string>,
): { employee: AITeamBuilderInput['employees'][number]; proficiency: string } | null {
    const needle = skill.toLowerCase()
    const candidates = employees
        .filter(e => e.status === 'Active' && !excludedIds.has(e.id))
        .map(e => {
            const match = (e.skills ?? []).find(
                s => (s.name ?? '').toLowerCase() === needle,
            )
            return match ? { employee: e, proficiency: match.proficiency ?? 'intermediate' } : null
        })
        .filter((x): x is NonNullable<typeof x> => x !== null)
        .sort((a, b) => {
            const aRank = PROFICIENCY_RANK[a.proficiency] ?? 2
            const bRank = PROFICIENCY_RANK[b.proficiency] ?? 2
            if (aRank !== bRank) return bRank - aRank
            return (a.employee.costPerHour ?? 0) - (b.employee.costPerHour ?? 0)
        })
    return candidates[0] ?? null
}

export function enforceSkillCoverage(
    result: AITeamBuilderResult,
    input: AITeamBuilderInput,
): { result: AITeamBuilderResult; addedNames: string[]; skippedForBudget: string[] } {
    const required = input.requiredSkills ?? []
    if (required.length === 0) return { result, addedNames: [], skippedForBudget: [] }

    const selectedIds = new Set(result.team.map(t => t.employeeId))
    const teamCovers = new Set(
        result.team.flatMap(t => (t.matchedSkills ?? []).map(s => s.toLowerCase())),
    )

    const additions: AITeamMember[] = []
    const addedNames: string[] = []
    const skippedForBudget: string[] = []

    // Track running base labor cost so we can budget-check each candidate
    // addition without recomputing the whole team's costs every iteration.
    let runningBaseLabor = result.team.reduce((sum, m) => sum + (m.totalCost ?? 0), 0)
    const overheadPct = (input.companySettings?.overheadPercentage ?? 20) / 100
    const bufferPct   = (input.companySettings?.bufferPercentage ?? 10) / 100

    const projectTotalCost = (baseLabor: number) => {
        const overhead = baseLabor * overheadPct
        const buffer   = (baseLabor + overhead) * bufferPct
        return baseLabor + overhead + buffer
    }

    for (const skill of required) {
        if (teamCovers.has(skill.toLowerCase())) continue

        const carrier = findCarrier(skill, input.employees, selectedIds)
        if (!carrier) continue // genuinely uncovered — leave in gapSkills

        const emp = carrier.employee
        const maxProjectHours = (emp.workableHours ?? 0) * (input.timelineMonths ?? 1)
        // Conservative specialist-tier allocation: 8-40h. Big enough to be a
        // meaningful contribution, small enough that adding the carrier
        // rarely blows the budget. User can edit allocations after.
        const allocatedHours = Math.max(8, Math.min(40, Math.round(maxProjectHours * 0.25)))
        const totalCost = allocatedHours * (emp.costPerHour ?? 0)

        // Budget-aware skip: if including this carrier (even at the small
        // specialist allocation) would push the project over clientBudget,
        // leave the skill in gapSkills with whatever recommendation Claude
        // already produced. Holds the "budget is a hard constraint" rule.
        const projectedTotal = projectTotalCost(runningBaseLabor + totalCost)
        if (input.clientBudget > 0 && projectedTotal > input.clientBudget) {
            skippedForBudget.push(`${emp.name} (${skill})`)
            continue
        }

        additions.push({
            employeeId:      emp.id,
            name:            emp.name,
            role:            emp.capacityRole ?? 'specialist',
            allocatedHours,
            monthlySalary:   emp.monthlySalary ?? 0,
            costPerHour:     emp.costPerHour ?? 0,
            totalCost,
            reasoning:       `Auto-included to cover required skill "${skill}" — held at ${carrier.proficiency} proficiency. Specialist allocation (${allocatedHours}h) sized to fit the budget.`,
            matchedSkills:   [skill],
            skillMatchScore: 100,
        })
        runningBaseLabor += totalCost
        selectedIds.add(emp.id)
        teamCovers.add(skill.toLowerCase())
        addedNames.push(emp.name)
    }

    if (additions.length === 0) return { result, addedNames: [], skippedForBudget }

    // Recompute financials with the added members. overheadPct/bufferPct
    // were declared above and reused here so the budget-check math and the
    // final-result math always agree.
    const updatedTeam = [...result.team, ...additions]
    const baseLaborCost        = runningBaseLabor
    const overheadCost         = baseLaborCost * overheadPct
    const bufferCost           = (baseLaborCost + overheadCost) * bufferPct
    const totalEstimatedCost   = baseLaborCost + overheadCost + bufferCost
    const estimatedGrossProfit = input.clientBudget - totalEstimatedCost
    const profitMarginPercent  = input.clientBudget > 0
        ? (estimatedGrossProfit / input.clientBudget) * 100
        : 0
    const isFeasible = totalEstimatedCost <= input.clientBudget

    // Update gap analysis to reflect the new coverage.
    const newCovered = new Set(result.skillGapAnalysis?.coveredSkills ?? [])
    additions.forEach(a => (a.matchedSkills ?? []).forEach(s => newCovered.add(s)))
    const newGaps = (result.skillGapAnalysis?.gapSkills ?? []).filter(g => !newCovered.has(g))

    return {
        result: {
            ...result,
            team:                  updatedTeam,
            baseLaborCost:         Math.round(baseLaborCost),
            overheadCost:          Math.round(overheadCost),
            bufferCost:            Math.round(bufferCost),
            totalEstimatedCost:    Math.round(totalEstimatedCost),
            estimatedGrossProfit:  Math.round(estimatedGrossProfit),
            profitMarginPercent:   Math.round(profitMarginPercent * 100) / 100,
            isFeasible,
            feasibilityNote:       isFeasible
                ? 'Project is within budget'
                : `Project exceeds budget by ${Math.round(totalEstimatedCost - input.clientBudget).toLocaleString()}`,
            skillGapAnalysis: {
                coveredSkills:   Array.from(newCovered),
                gapSkills:       newGaps,
                recommendations: result.skillGapAnalysis?.recommendations ?? [],
            },
        },
        addedNames,
        skippedForBudget,
    }
}
