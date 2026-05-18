import type { AITeamBuilderInput, AITeamBuilderResult, AITeamMember, AITeamBuilderEmployeeContext } from '@/types/aiTeamBuilder'
import { CURRENCY_CONFIG } from '@/lib/currencyConfig'
import { applySellMarkup, applyBillingMarkup } from '@/lib/calculations'

// ── Role-mode prompt (outputMode === 'roles') ──────────────────────────────
//
// Used by /estimation's "AI Team Builder" panel. Asks Claude to suggest a
// ghost-role composition (role buckets × quantities × cost ranges) instead
// of picking real Employees. The user accepts the result into the deal's
// ghostRoles, and the scope estimator below then costs the project from
// those buckets.

export const ROLE_SYSTEM_PROMPT = `Context: You are helping a digital agency size and cost a software project at the ROLE level. You are NOT picking specific people — you are suggesting how many of each role bucket the project needs and what the going salary range is for each bucket.

IMPORTANT: All monetary values in this prompt are in USD. The system normalised everything to USD upstream — do NOT convert.

The tenant's role buckets are constrained to these five:
  - **frontend** — Frontend / UI engineering
  - **backend** — Backend / API / database / server engineering
  - **design** — Product design, UX/UI, brand
  - **qa** — Test engineering, QA automation
  - **pm** — Project management / product management (software)

Choose a subset of these buckets for the project. DO NOT invent new buckets.

**Workload hours — handle this case carefully.**

The user's brief may or may not include a "Total Workload" hour figure.
  - **If the brief says "Total Workload: 0 hours" or "Total Workload: not specified"**: the user doesn't know yet, and they want you to estimate. Propose a total hour count yourself based on the project description, the client budget (using the company's overhead/buffer settings to back into a feasible labor cost), and the timeline. Return your proposed number as **\`estimatedTotalHours\`** in the result. Use this estimate when sizing roles.
  - **If the brief gives a real number** (≥ 1): use it as-is. Echo it back in \`estimatedTotalHours\` for symmetry.

When proposing hours from scratch, sanity-check against feasibility: total hours × the average cost-per-hour implied by the salary brackets should leave room for overhead + buffer under the client budget. If the budget is impossibly tight at any realistic effort, propose the lowest defensible hour count and flag the budget-feasibility issue in \`warnings\`.

For each chosen bucket, output:
  - roleType (one of the five above)
  - label (human-readable, e.g. "Backend Engineer")
  - quantity (integer ≥ 1)
  - months (integer ≤ project timeline; shorter when the role only contributes in late stages)
  - allocatedHours (TOTAL hours for this bucket across all quantity slots over the role's months — should roughly sum across all roles to the project's total workload hours)
  - minMonthlySalary / maxMonthlySalary — pulled from the engineers (salary brackets) list provided. Pick a bracket that fits the seniority you're suggesting; min/max can span more than one bracket if you want a range. **Never invent salary numbers outside the bracket list — use what the tenant has.**
  - estimatedCost (quantity × months × ((min+max)/2))
  - reasoning (1-2 sentences justifying the bucket + quantity + seniority)

**Team-shape rules — apply the complexity band first:**
  - easy (score ≤ 2.5): aim for **2 role buckets** total — 1 hands-on bucket matching the project + 1 leadership-flavoured bucket (e.g. backend + design, or pm + frontend).
  - medium (2.6–5.5): **3-4 buckets** covering main workstreams + 1 PM if coordination signals are clear.
  - hard (> 5.5): **5 buckets** typically (all of frontend / backend / design / qa / pm).

**Quantity guidance:** for software projects, quantities are usually 1 per bucket. Only suggest quantity ≥ 2 when the workload is genuinely too heavy for one person at the chosen seniority (e.g. 1500h of backend work over 3 months → 2 backend engineers).

**Cost & Pricing Model — read carefully, this REPLACES the old overhead+buffer math.**

The agency uses a fixed pricing rule:
  - **Loaded monthly salary** = raw monthly salary × 1.15 (raw + 15% absorbed company overhead). Use this as the cost basis.
  - **Sell rate** = Loaded cost × 3 (what we bill the client for that labor).

**Cost rules:**
  - rawAvgMonthlySalary = (min + max) / 2 — pulled straight from the bracket.
  - loadedAvgMonthlySalary = rawAvgMonthlySalary × 1.15
  - **baseLaborCost = sum over roles of (quantity × months × loadedAvgMonthlySalary)** — the agency's labor cost basis.
  - overheadCost = 0  (the 15% is already absorbed into Loaded cost above; do NOT add it twice)
  - bufferCost = 0   (margin comes from the 3× sell markup, not a buffer line)
  - totalEstimatedCost = baseLaborCost  (cost basis, NOT the quoted price)
  - **suggestedQuote = baseLaborCost × 3** — the price we'd quote the client.
  - estimatedGrossProfit = suggestedQuote − totalEstimatedCost
  - profitMarginPercent = (estimatedGrossProfit / suggestedQuote) × 100   (under this fixed model this is always ~66.7%)
  - isFeasible = **suggestedQuote ≤ clientBudget**  (compare the QUOTE to the budget, not the cost basis)
  - feasibilityNote: if feasible say "Quote ($X) fits client budget"; else state how much the QUOTE exceeds the budget by
  - aiReasoning: 2–4 sentences on the role mix, seniority choices, and how the **quoted price** stacks up to budget
  - warnings: budget overage on the quote, missing critical bucket the project description implies but you couldn't fit

Note: each role's \`estimatedCost\` field stays at the cost-basis level: quantity × months × loadedAvgMonthlySalary. Do NOT multiply per-role estimatedCost by 3.

**Output schema (return ONLY this JSON, no prose):**
{
  "roles": [
    { "roleType": "frontend"|"backend"|"design"|"qa"|"pm",
      "label": string,
      "quantity": number,
      "months": number,
      "allocatedHours": number,
      "minMonthlySalary": number,
      "maxMonthlySalary": number,
      "estimatedCost": number,
      "reasoning": string
    }
  ],
  "team": [],
  "estimatedTotalHours": number,
  "baseLaborCost": number,
  "overheadCost": number,
  "bufferCost": number,
  "totalEstimatedCost": number,
  "estimatedGrossProfit": number,
  "profitMarginPercent": number,
  "isFeasible": boolean,
  "feasibilityNote": string,
  "aiReasoning": string,
  "warnings": string[]
}

\`team\` MUST be an empty array — role mode does not pick employees. The frontend renders \`roles\` only.`

export function buildRoleUserPrompt(input: AITeamBuilderInput): string {
    // Brackets, grouped by role bucket. Claude reads this to pick min/max for each
    // suggested role. Empty bucket = no bracket exists for that role; Claude can
    // either skip the bucket or warn about the missing bracket.
    const brackets: Record<string, Array<{ name: string; monthlySalary: number; capacityHours: number }>> = {
        frontend: [], backend: [], design: [], qa: [], pm: [],
    }
    for (const e of input.engineers) {
        if (brackets[e.role]) {
            brackets[e.role].push({
                name: e.name,
                monthlySalary: e.monthlySalary,
                capacityHours: e.monthlyCapacityHours,
            })
        }
    }

    const complexitySection = input.complexity
        ? `## Project Complexity (deterministic — use this to pick the number of buckets)

Computed band: **${input.complexity.band}** (score ${input.complexity.score} / 10)
`
        : ''

    const dealHeader = (input.dealName || input.dealClient)
        ? `Deal: ${input.dealName ?? '(untitled)'}${input.dealClient ? `  ·  Client: ${input.dealClient}` : ''}\n`
        : ''

    // Phrase the workload line based on whether the user provided a number.
    // When zero/missing, we ask Claude to propose one — the system prompt's
    // "Workload hours — handle this case carefully" section explains the
    // sentinel "not specified" wording it should react to.
    const workloadLine = (input.workloadHours && input.workloadHours > 0)
        ? `Total Workload: ${input.workloadHours} hours`
        : `Total Workload: not specified — estimate this yourself and return it as \`estimatedTotalHours\``

    return `## Project Brief

${dealHeader}Currency: USD
Budget: $${input.clientBudget.toLocaleString()}
Timeline: ${input.timelineMonths} months
${workloadLine}

Project Description:
${input.workloadDescription || 'No description provided.'}

${complexitySection}
## Engineer Salary Brackets (the tenant's actual cost data — pick min/max from these)

${JSON.stringify(brackets, null, 2)}

## Pricing Model

Loaded cost markup: 15% (raw salary × 1.15 = cost basis)
Sell markup: ×3 on loaded cost (cost basis × 3 = quoted price)

---

Pick the role mix this project actually needs. Return ONLY the JSON object described in the system prompt — \`roles\` populated, \`team\` empty.`
}
// ── End role-mode prompt ───────────────────────────────────────────────────

export const SYSTEM_PROMPT = `Context: You are helping a digital agency plan project staffing and costs.

IMPORTANT: All monetary values in this prompt are in USD (United States Dollars).
The system has already normalized budgets, salaries, and costs to USD using the
tenant's exchange rates. Do NOT convert currencies — use the provided numbers as-is.

Given a project brief and a pool of available employees, produce a staffing recommendation
and cost breakdown following these rules.

- Assign employees from the provided list using their exact IDs.
- Allocated hours per person must not exceed their maxProjectHours.

**IT / Technical roles only — HARD CONSTRAINT (apply BEFORE everything else).**

This team builder is for software project staffing. Decide whether each employee is in a technical (IT) role by reading their \`roleTitle\` AND \`departmentName\` together. Only consider employees whose role is technical.

Technical roles include (non-exhaustive):
  - Software engineering of any kind — frontend, backend, full-stack, mobile, embedded
  - Design / UX / UI / product design
  - QA / SDET / test engineer / automation engineer
  - DevOps / SRE / cloud / platform / infrastructure
  - Data / ML / AI / analytics engineering
  - Product manager or project manager **on software projects**
  - Engineering leadership: Lead, Principal, Architect, CTO, Engineering Manager, Technical Director

DO NOT pick employees in non-technical roles, even if the project has budget for them. Examples to exclude:
  - HR / People / Recruiting / Talent
  - Finance / Accounting / Bookkeeping / Payroll
  - Sales / Business Development / Account Management (Sales Engineers ARE technical and OK)
  - Marketing / Content / Brand / SEO / Social Media
  - Legal / Compliance / Contracts
  - Administration / Office Management / Reception / Executive Assistant
  - Customer Success / Customer Support (Technical Support IS technical and OK)
  - Operations / Logistics (unless DevOps/Platform Operations)

Use \`departmentName\` as a reinforcing signal: an employee in an "HR" or "Finance" department is non-technical regardless of how their role title reads. Conversely, an "Engineering" / "IT" / "Technology" / "Product" department reinforces a technical classification.

If you're uncertain about an employee, EXCLUDE them — false positives (picking a non-IT person) are worse than false negatives (skipping a borderline one). Note any excluded ambiguous picks in \`aiReasoning\`.

**Target team shape — apply this AFTER the IT-only filter, then refine with the priorities below.**

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
  - roleTitle: their billing role text (e.g. "Senior Backend Engineer").
  - **rank**: a structured seniority object \`{ code, level }\` where higher level = more senior. THIS IS THE CANONICAL SENIORITY SIGNAL when present:
      • level ≥ 40 → Lead / technical leadership
      • level ≥ 30 → Senior
      • level ≥ 20 → Mid-level
      • level ≤ 10 → Junior
    When \`rank\` is null, fall back to keyword-matching on roleTitle:
      • Leadership: titles containing Lead, Senior, Head, Master, Principal, or Manager.
      • Junior: titles containing Junior, Intern, or Associate.
      • Mid-level: everything else (or null roleTitle).
  - **pastProjects**: an array of recent projects this employee has worked on, each with \`{ name, client, status, dealDescription }\`. Used as the experience signal in the cost-vs-experience tiebreaker below.
  - skills: their recorded skills with proficiency (expert/intermediate/beginner).
  - costPerHour, monthlySalary, maxProjectHours: cost & capacity.

Selection priorities — weigh these together to produce the best feasible team. They are NOT strict tiers; trade off as needed.

  1. **Budget feasibility (HARD CONSTRAINT).** The **suggestedQuote** (cost basis × 3) must stay ≤ clientBudget. If satisfying the priorities below would blow the budget, hold the budget and explain in warnings + gapSkills which factors were sacrificed and why.

  2. **Required skills.** For every entry in requiredSkills, include a carrier when budget allows, preferring higher proficiency (expert > intermediate > beginner). When budget can't afford to include a carrier, list the skill in gapSkills with a hire/contract recommendation rather than forcing the team over budget.

  3. **Team composition.**
     • Leadership: see the "Need Management" instruction in the user prompt. When the user requested leadership, include at least 1 leadership-level employee (rank.level ≥ 30 OR roleTitle marks them as Lead/Senior/Head/Master/Principal/Manager) when any exist in the pool. When the user opted out of leadership ("Need Management = no"), do NOT add a senior solely for management — optimise for skill coverage + budget. Note this in aiReasoning either way.
     • Include 1 PM-class employee (capacityRole = pm OR roleTitle implies project management) when the project description suggests coordination work (multi-stakeholder, multi-month, multiple workstreams).
     • Balance senior vs junior weight against workload complexity. Short or well-scoped projects tolerate junior-heavy teams; complex or long projects warrant more senior weight. Do NOT staff the entire team with seniors when juniors can handle routine workstreams — that wastes budget.

  4. **Workload coverage.** Collectively, the team's allocatedHours should approximate the project's total workload hours. Underallocate if budget forces it; flag significant underallocation in warnings.

  5. **Capacity-role fit.** Pick capacityRoles that match the project description (e.g. brand-heavy projects need design; data-heavy projects need backend).

  6. **Past-project experience (tiebreaker — applies AFTER budget, skills, leadership, workload).** When two candidates are otherwise equal (same skill at same proficiency, same rank, both within budget), prefer the one whose \`pastProjects\` show similar work to the current deal description. "Similar" means same industry vertical, same deliverable type, or overlapping tech stack. **Past-project relevance beats raw cost efficiency** — picking a candidate with relevant past projects over a cheaper candidate without is encouraged. When neither candidate has relevant past projects, fall through to cost (prefer lower costPerHour). Reflect this choice in the team member's \`reasoning\` field, e.g. *"Picked over Y because X led a similar GCP backup project for Yazaki — productivity uplift offsets the small cost delta."*

  7. **Cost efficiency.** Among candidates with NO past-project differentiator, prefer lower costPerHour.

Allocation realism (apply per team member):
  - A specialist covering a single niche skill (brand identity, ML, blockchain, etc.) usually contributes a fraction of project hours — allocate proportional to actual contribution (e.g. 40-160h for a brand-identity specialist on a multi-component build), NOT full project capacity.
  - A leader spends time on guidance and reviews; typical lead allocation is 30-60% of their maxProjectHours.
  - Junior employees can be fully utilized on routine workstreams.

**Cost & Pricing Model — read carefully, this REPLACES the old overhead+buffer math.**

Each input employee's \`costPerHour\` is the RAW hourly rate (monthly_salary / workable_hours). The agency applies a fixed pricing rule:
  - **Loaded cost per hour** = costPerHour × 1.15 (raw + 15% absorbed company overhead). This is the cost basis.
  - **Sell rate per hour** = Loaded cost × 3 (what we bill the client per hour of that employee's time).

For each team member you return, set \`costPerHour\` to the **Loaded** value (raw × 1.15), and set \`totalCost\` to \`allocatedHours × loadedCostPerHour\`.

Then aggregate:
- baseLaborCost = sum of (allocatedHours × loadedCostPerHour) for all team members  (== Σ totalCost)
- overheadCost = 0  (the 15% is already absorbed into Loaded cost above; do NOT add it twice)
- bufferCost = 0   (margin comes from the 3× sell markup, not a buffer line)
- totalEstimatedCost = baseLaborCost  (cost basis, NOT the quoted price)
- **suggestedQuote = baseLaborCost × 3** — the price we'd quote the client.
- estimatedGrossProfit = suggestedQuote − totalEstimatedCost
- profitMarginPercent = (estimatedGrossProfit / suggestedQuote) × 100   (under this fixed model this is always ~66.7%)
- isFeasible = **suggestedQuote ≤ clientBudget**  (compare the QUOTE to the budget, not the cost basis)
- feasibilityNote: if feasible write "Quote ($X) fits client budget", otherwise state how much the QUOTE exceeds the budget by
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
    // Build a lookup of rich employee context by id (rank + past_projects)
    // — sourced from the AI-team-builder-context backend endpoint. Falls
    // back to {rank: null, pastProjects: []} when context isn't supplied.
    const ctxById = new Map<string, { rank: { code: string; level: number } | null; pastProjects: Array<{ name: string; client: string | null; status: string; dealDescription: string | null }> }>()
    for (const c of input.employeeContext ?? []) {
        ctxById.set(c.id, {
            rank: c.rank ? { code: c.rank.code, level: c.rank.level } : null,
            pastProjects: (c.past_projects ?? []).map(p => ({
                name: p.name,
                client: p.client,
                status: p.status,
                dealDescription: p.deal_description,
            })),
        })
    }

    const activeEmployees = input.employees
        .filter(e => e.status === 'Active')
        .map(e => {
            // Use real available hours (after other deals) when provided, else fall back to static capacity.
            const availableMonthly = input.employeeAvailability?.[e.id] ?? e.workableHours
            const ctx = ctxById.get(e.id)
            return {
                id: e.id,
                name: e.name,
                capacityRole: e.capacityRole ?? 'unknown',
                roleTitle: e.roleName ?? null,
                departmentName: e.departmentName ?? null,
                // Rank pulled from context endpoint (null when unranked or
                // context unavailable; prompt falls back to roleTitle keywords).
                rank: ctx?.rank ?? null,
                costPerHour: e.costPerHour,
                monthlySalary: e.monthlySalary,
                monthlyCapacityHours: availableMonthly,
                maxProjectHours: availableMonthly * input.timelineMonths,
                skills: (e.skills ?? []).map((s: { name?: string; skillId?: string; proficiency?: string }) => ({
                    name: s.name ?? s.skillId ?? 'unknown',
                    proficiency: s.proficiency ?? 'intermediate',
                })),
                // Past projects — empty array when employee has no relevant
                // history or no skill overlap with this deal (backend skipped them).
                pastProjects: ctx?.pastProjects ?? [],
            }
        })
        // Exclude employees with no available capacity — they can't contribute and waste Claude's context.
        .filter(e => e.maxProjectHours > 0)

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

    // Deal identity goes ABOVE the financials so Claude reads "what is this
    // project" before "what's the budget" — improves contextual reasoning,
    // especially for short workload descriptions where the deal title carries
    // most of the signal.
    const dealHeader = (input.dealName || input.dealClient)
        ? `Deal: ${input.dealName ?? '(untitled)'}${input.dealClient ? `  ·  Client: ${input.dealClient}` : ''}\n`
        : ''

    // Default ON when undefined for back-compat — older callers didn't ship
    // this field. Maps to the leadership rule in the system prompt.
    const needLeadership = input.requireLeadership !== false

    return `## Client Project Brief

${dealHeader}Currency: USD (all values normalized to US Dollars)
Budget: $${input.clientBudget.toLocaleString()}
Timeline: ${input.timelineMonths} months
Total Workload: ${input.workloadHours} hours
Need Management: ${needLeadership ? 'yes — team MUST include a leadership-level employee (rank.level ≥ 30 OR roleTitle implies leadership)' : 'no — leadership is not required; do NOT add a senior solely for management'}

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
## Pricing Model

Loaded cost markup: 15% (raw hourly × 1.15 = cost basis per hour)
Sell markup: ×3 on loaded cost (loaded cost × 3 = quoted hourly rate)
Yearly Fixed Cost: $${input.companySettings.yearlyFixedCost.toLocaleString()} (USD)

## Monthly Overhead Items (USD)

${JSON.stringify(
                input.globalOverheads.map(o => ({ category: o.category, monthlyCost: o.monthlyCost })),
                null, 2
            )}

---

## Final compliance checklist (verify BEFORE returning)

  - **IT-only check.** For every team member, is their roleTitle AND departmentName technical? Drop any non-technical pick (HR, Finance, Sales (not Sales Eng), Marketing, Legal, Admin, Operations, Customer Success) before returning, even if it leaves a skill uncovered — list those uncovered skills in gapSkills instead.
  - For each entry in "Required Skills": is some pool employee a carrier? If yes and budget allows, include them. If yes but inclusion would violate budget feasibility, list the skill in gapSkills with a hire/contract recommendation.
  - Does the team have at least one leadership-level employee (roleTitle marks them Lead/Senior/Head/Master/Principal/Manager) when any exist in the pool? If not, fix it before returning.
  - Are allocations realistic? A specialist's allocatedHours should reflect their actual contribution scope, not full project capacity. A leader is typically 30-60% of their maxProjectHours.
  - Does the suggestedQuote (baseLaborCost × 3) ≤ clientBudget? If not, drop the lowest-impact additions until it does, and explain the trade-offs in warnings.

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
// the suggested QUOTE (baseLaborCost × 3) ≤ clientBudget. If the addition
// would violate the budget, the skill stays in gapSkills.

const PROFICIENCY_RANK: Record<string, number> = {
    expert: 3,
    intermediate: 2,
    beginner: 1,
}

/**
 * Cheap keyword-overlap heuristic for "does this employee have relevant past
 * projects for this deal." Used by the server-side carrier finder so its
 * tiebreaker matches the rule documented in the AI prompt: experience beats
 * raw cost efficiency. Intentionally less smart than Claude's free-text
 * judgement — this only fires when Claude missed a required skill and we're
 * picking a fallback carrier.
 */
function hasRelevantPastProject(
    pastProjects: Array<{ dealDescription?: string | null; name?: string; client?: string | null }> | undefined,
    dealKeywords: string[],
): boolean {
    if (!pastProjects || pastProjects.length === 0 || dealKeywords.length === 0) {
        return false
    }
    for (const p of pastProjects) {
        const haystack = `${p.dealDescription ?? ''} ${p.name ?? ''} ${p.client ?? ''}`.toLowerCase()
        for (const kw of dealKeywords) {
            if (kw.length >= 3 && haystack.includes(kw)) return true
        }
    }
    return false
}

function extractDealKeywords(input: AITeamBuilderInput): string[] {
    const text = `${input.workloadDescription ?? ''} ${(input.requiredSkills ?? []).join(' ')}`.toLowerCase()
    const tokens = text.split(/[^a-z0-9+#.]+/i).filter(t => t.length >= 4)
    // Drop common stop-words that would otherwise match every project trivially.
    const stop = new Set(['this', 'that', 'with', 'will', 'have', 'their', 'from', 'project', 'system'])
    return Array.from(new Set(tokens.filter(t => !stop.has(t))))
}

function findCarrier(
    skill: string,
    input: AITeamBuilderInput,
    excludedIds: Set<string>,
): { employee: AITeamBuilderInput['employees'][number]; proficiency: string } | null {
    const needle = skill.toLowerCase()
    const dealKeywords = extractDealKeywords(input)
    const ctxById = new Map<string, AITeamBuilderEmployeeContext>()
    for (const c of input.employeeContext ?? []) {
        ctxById.set(c.id, c)
    }

    const candidates = input.employees
        .filter(e => e.status === 'Active' && !excludedIds.has(e.id))
        .map(e => {
            const match = (e.skills ?? []).find(
                s => (s.name ?? '').toLowerCase() === needle,
            )
            if (!match) return null
            const ctx = ctxById.get(e.id)
            const past = ctx?.past_projects ?? []
            return {
                employee: e,
                proficiency: match.proficiency ?? 'intermediate',
                hasRelevantPast: hasRelevantPastProject(
                    past.map(p => ({ dealDescription: p.deal_description, name: p.name, client: p.client })),
                    dealKeywords,
                ),
            }
        })
        .filter((x): x is NonNullable<typeof x> => x !== null)
        .sort((a, b) => {
            // 1. Higher proficiency wins (expert > intermediate > beginner).
            const aRank = PROFICIENCY_RANK[a.proficiency] ?? 2
            const bRank = PROFICIENCY_RANK[b.proficiency] ?? 2
            if (aRank !== bRank) return bRank - aRank
            // 2. Past-project relevance beats raw cost — matches the prompt rule.
            if (a.hasRelevantPast !== b.hasRelevantPast) return a.hasRelevantPast ? -1 : 1
            // 3. Among otherwise-equal candidates, prefer the cheaper one.
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

    // Track running labor cost basis (sum of loaded costs) so we can
    // budget-check each candidate addition without recomputing the whole
    // team's costs every iteration. Team-member totalCost values arrive from
    // Gemini already at loaded cost (raw × 1.15) per the new prompt rules.
    let runningBaseLabor = result.team.reduce((sum, m) => sum + (m.totalCost ?? 0), 0)

    // Feasibility check compares the QUOTE (cost basis × BILLING_MARKUP_MULTIPLIER)
    // to the budget, matching the new pricing model.
    const projectQuotedPrice = (baseLabor: number) => applyBillingMarkup(baseLabor)

    for (const skill of required) {
        if (teamCovers.has(skill.toLowerCase())) continue

        const carrier = findCarrier(skill, input, selectedIds)
        if (!carrier) continue // genuinely uncovered — leave in gapSkills

        const emp = carrier.employee
        const maxProjectHours = (emp.workableHours ?? 0) * (input.timelineMonths ?? 1)
        // Conservative specialist-tier allocation: 8-40h. Big enough to be a
        // meaningful contribution, small enough that adding the carrier
        // rarely blows the budget. User can edit allocations after.
        const allocatedHours = Math.max(8, Math.min(40, Math.round(maxProjectHours * 0.25)))
        // Loaded cost = raw × 1.15 (matches the new pricing model).
        const loadedCostPerHour = applySellMarkup(emp.costPerHour ?? 0)
        const totalCost = allocatedHours * loadedCostPerHour

        // Budget-aware skip: if including this carrier (even at the small
        // specialist allocation) would push the QUOTE over clientBudget,
        // leave the skill in gapSkills with whatever recommendation Claude
        // already produced. Holds the "budget is a hard constraint" rule.
        const projectedQuote = projectQuotedPrice(runningBaseLabor + totalCost)
        if (input.clientBudget > 0 && projectedQuote > input.clientBudget) {
            skippedForBudget.push(`${emp.name} (${skill})`)
            continue
        }

        additions.push({
            employeeId:      emp.id,
            name:            emp.name,
            role:            emp.capacityRole ?? 'specialist',
            allocatedHours,
            monthlySalary:   emp.monthlySalary ?? 0,
            costPerHour:     loadedCostPerHour,
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

    // Recompute financials with the added members using the new pricing
    // model: cost basis = loaded labor; quoted price = cost basis × 3.
    const updatedTeam = [...result.team, ...additions]
    const baseLaborCost        = runningBaseLabor
    const totalEstimatedCost   = baseLaborCost  // cost basis
    const suggestedQuote       = projectQuotedPrice(baseLaborCost)
    const estimatedGrossProfit = suggestedQuote - totalEstimatedCost
    const profitMarginPercent  = suggestedQuote > 0
        ? (estimatedGrossProfit / suggestedQuote) * 100
        : 0
    const isFeasible = input.clientBudget > 0 ? suggestedQuote <= input.clientBudget : true

    // Update gap analysis to reflect the new coverage.
    const newCovered = new Set(result.skillGapAnalysis?.coveredSkills ?? [])
    additions.forEach(a => (a.matchedSkills ?? []).forEach(s => newCovered.add(s)))
    const newGaps = (result.skillGapAnalysis?.gapSkills ?? []).filter(g => !newCovered.has(g))

    return {
        result: {
            ...result,
            team:                  updatedTeam,
            baseLaborCost:         Math.round(baseLaborCost),
            overheadCost:          0,
            bufferCost:            0,
            totalEstimatedCost:    Math.round(totalEstimatedCost),
            estimatedGrossProfit:  Math.round(estimatedGrossProfit),
            profitMarginPercent:   Math.round(profitMarginPercent * 100) / 100,
            isFeasible,
            feasibilityNote:       isFeasible
                ? `Quote ($${Math.round(suggestedQuote).toLocaleString()}) fits client budget`
                : `Quote ($${Math.round(suggestedQuote).toLocaleString()}) exceeds budget by ${Math.round(suggestedQuote - input.clientBudget).toLocaleString()}`,
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
