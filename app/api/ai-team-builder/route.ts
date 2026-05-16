import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { SYSTEM_PROMPT, buildUserPrompt, enforceSkillCoverage, ROLE_SYSTEM_PROMPT, buildRoleUserPrompt } from '@/lib/aiTeamBuilder'
import type { AITeamBuilderInput, AITeamBuilderResult } from '@/types/aiTeamBuilder'
import { formatMoney } from '@/lib/currencyServer'

const CLAUDE_MODEL = 'claude-3-5-sonnet-latest'

// Pricing: Claude 3.5 Sonnet — $3.00/1M input · $15.00/1M output
const INPUT_COST_PER_TOKEN  = 3.00  / 1_000_000
const OUTPUT_COST_PER_TOKEN = 15.00 / 1_000_000

function estimateCost(inputTokens: number, outputTokens: number): number {
    return (inputTokens * INPUT_COST_PER_TOKEN) + (outputTokens * OUTPUT_COST_PER_TOKEN)
}

/**
 * Pull the first complete JSON object out of a string that may have prose
 * before or after it. Walks brace depth while respecting string literals so
 * `{ "note": "}{" }` doesn't confuse it. Returns null if no balanced object
 * is found — caller falls back to JSON.parse on the original text.
 */
function extractFirstJsonObject(text: string): string | null {
    const start = text.indexOf('{')
    if (start === -1) return null
    let depth = 0
    let inString = false
    let escape = false
    for (let i = start; i < text.length; i++) {
        const ch = text[i]
        if (escape) { escape = false; continue }
        if (ch === '\\') { escape = true; continue }
        if (ch === '"') { inString = !inString; continue }
        if (inString) continue
        if (ch === '{') depth++
        else if (ch === '}') {
            depth--
            if (depth === 0) return text.slice(start, i + 1)
        }
    }
    return null
}

// ── Demo fallback for role mode: returns role-shaped output without calling Claude ──
function generateRoleDemoResult(input: AITeamBuilderInput): AITeamBuilderResult {
    const months = Math.max(1, Math.round(input.timelineMonths || 1))
    // Hours unspecified → estimate from budget. Assume the labor portion is
    // ~60% of budget (rest is overhead/buffer/margin) and an average effective
    // rate of $25/hr — gives a sane ballpark for the demo path.
    const estimatedHours = input.workloadHours && input.workloadHours > 0
        ? input.workloadHours
        : Math.max(80, Math.round((input.clientBudget * 0.6) / 25))
    const totalHours = estimatedHours
    const desc = (input.workloadDescription || '').toLowerCase()

    // Weights mirror the live prompt's intent so demo output looks realistic.
    const weights = {
        backend:  /backend|api|database|server|node|laravel|python|django/.test(desc) ? 0.35 : 0.25,
        frontend: /frontend|react|vue|angular|ui|ux|dashboard|mobile/.test(desc) ? 0.30 : 0.25,
        design:   /design|figma|brand|visual|creative/.test(desc) ? 0.15 : 0.10,
        qa:       /test|qa|quality|automation/.test(desc) ? 0.12 : 0.08,
        pm:       /project|management|stakeholder|planning/.test(desc) ? 0.12 : 0.10,
    } as const

    const labels: Record<keyof typeof weights, string> = {
        backend: 'Backend Engineer',
        frontend: 'Frontend Engineer',
        design: 'Product Designer',
        qa: 'QA Engineer',
        pm: 'Project Manager',
    }

    // Pull min/max from the tenant's engineer salary brackets; fall back to
    // sensible USD ranges per bucket when no bracket exists.
    const bracketsByRole: Record<string, number[]> = { backend: [], frontend: [], design: [], qa: [], pm: [] }
    for (const e of input.engineers ?? []) {
        if (bracketsByRole[e.role]) bracketsByRole[e.role].push(e.monthlySalary)
    }
    const fallbackBrackets: Record<string, [number, number]> = {
        backend:  [3000, 6000],
        frontend: [2800, 5500],
        design:   [2500, 5000],
        qa:       [2200, 4500],
        pm:       [3000, 6000],
    }

    const roles: NonNullable<AITeamBuilderResult['roles']> = []
    let baseLaborCost = 0
    for (const key of Object.keys(weights) as Array<keyof typeof weights>) {
        const allocated = Math.round(totalHours * weights[key])
        if (allocated <= 0) continue
        const bracketVals = bracketsByRole[key]
        const min = bracketVals.length > 0 ? Math.min(...bracketVals) : fallbackBrackets[key][0]
        const max = bracketVals.length > 0 ? Math.max(...bracketVals) : fallbackBrackets[key][1]
        const avg = (min + max) / 2
        const cost = Math.round(avg * months)
        roles.push({
            roleType: key,
            label: labels[key],
            quantity: 1,
            months,
            allocatedHours: allocated,
            minMonthlySalary: min,
            maxMonthlySalary: max,
            estimatedCost: cost,
            reasoning: `Demo fallback — projected ${allocated}h over ${months} month${months === 1 ? '' : 's'} based on description keywords.`,
        })
        baseLaborCost += cost
    }

    const overheadPct = (input.companySettings?.overheadPercentage ?? 20) / 100
    const bufferPct   = (input.companySettings?.bufferPercentage ?? 10) / 100
    const overheadCost = baseLaborCost * overheadPct
    const bufferCost   = (baseLaborCost + overheadCost) * bufferPct
    const totalEstimatedCost   = baseLaborCost + overheadCost + bufferCost
    const estimatedGrossProfit = input.clientBudget - totalEstimatedCost
    const profitMarginPercent  = input.clientBudget > 0 ? (estimatedGrossProfit / input.clientBudget) * 100 : 0
    const isFeasible           = totalEstimatedCost <= input.clientBudget

    return {
        team: [],
        roles,
        estimatedTotalHours: totalHours,
        baseLaborCost: Math.round(baseLaborCost),
        overheadCost: Math.round(overheadCost),
        bufferCost: Math.round(bufferCost),
        totalEstimatedCost: Math.round(totalEstimatedCost),
        estimatedGrossProfit: Math.round(estimatedGrossProfit),
        profitMarginPercent: Math.round(profitMarginPercent * 100) / 100,
        isFeasible,
        feasibilityNote: isFeasible ? 'Project is within budget' : `Project exceeds budget by ${Math.round(totalEstimatedCost - input.clientBudget).toLocaleString()}`,
        aiReasoning: `Demo role mix: ${roles.map(r => `${r.quantity}× ${r.label}`).join(', ')}. Total cost ${Math.round(totalEstimatedCost).toLocaleString()} against ${Math.round(input.clientBudget).toLocaleString()} budget.`,
        warnings: profitMarginPercent < 10 ? ['Profit margin is below 10% — consider negotiating a higher budget or reducing scope.'] : [],
    }
}

// ── Demo fallback: generates a realistic team recommendation without calling Claude ──
function generateDemoResult(input: AITeamBuilderInput): AITeamBuilderResult {
    const activeEmps = input.employees.filter(e => e.status === 'Active')
    const months = input.timelineMonths || 1
    const totalHours = input.workloadHours || 160

    // Distribute hours by role priority based on workload description keywords
    const desc = (input.workloadDescription + ' ' + (input.workloadDocumentText || '')).toLowerCase()
    const roleWeights: Record<string, number> = {
        backend: /backend|api|database|server|node|laravel|python|django|fastapi/.test(desc) ? 0.35 : 0.20,
        frontend: /frontend|react|vue|angular|ui|ux|dashboard|mobile/.test(desc) ? 0.30 : 0.20,
        design: /design|figma|ui|ux|brand|visual|creative/.test(desc) ? 0.20 : 0.15,
        pm: /project|management|stakeholder|planning|scrum/.test(desc) ? 0.15 : 0.15,
        qa: /test|qa|quality|automation|regression/.test(desc) ? 0.15 : 0.15,
    }

    const team = activeEmps.map(emp => {
        const weight = roleWeights[emp.capacityRole || ''] || 0.10
        const allocatedHours = Math.min(
            Math.round(totalHours * weight),
            (emp.workableHours || 160) * months
        )
        return {
            employeeId: emp.id,
            name: emp.name,
            role: emp.capacityRole || 'member',
            allocatedHours,
            monthlySalary: emp.monthlySalary || 0,
            costPerHour: emp.costPerHour || 0,
            totalCost: allocatedHours * (emp.costPerHour || 0),
            reasoning: `${emp.name} brings ${emp.capacityRole} expertise with ${emp.monthlySalary ? `${formatMoney(emp.monthlySalary, input.currency ?? 'MMK')}/mo` : 'competitive'} cost rate.`,
            matchedSkills: (emp.skills || []).map((s: { name?: string }) => s.name || '').filter(Boolean),
            skillMatchScore: Math.round(Math.random() * 30 + 70),
        }
    }).filter(m => m.allocatedHours > 0).sort((a, b) => b.allocatedHours - a.allocatedHours).slice(0, 5)

    const baseLaborCost = team.reduce((sum, m) => sum + m.totalCost, 0)
    const overheadPct = (input.companySettings?.overheadPercentage || 20) / 100
    const bufferPct = (input.companySettings?.bufferPercentage || 10) / 100
    const overheadCost = baseLaborCost * overheadPct
    const bufferCost = (baseLaborCost + overheadCost) * bufferPct
    const totalEstimatedCost = baseLaborCost + overheadCost + bufferCost
    const estimatedGrossProfit = input.clientBudget - totalEstimatedCost
    const profitMarginPercent = input.clientBudget > 0 ? (estimatedGrossProfit / input.clientBudget) * 100 : 0
    const isFeasible = totalEstimatedCost <= input.clientBudget

    const requiredSkills = input.requiredSkills || []
    const allMatched = new Set<string>()
    team.forEach(m => m.matchedSkills.forEach(s => allMatched.add(s.toLowerCase())))
    const coveredSkills = requiredSkills.filter(s => Array.from(allMatched).some(m => m.includes(s.toLowerCase())))
    const gapSkills = requiredSkills.filter(s => !coveredSkills.includes(s))

    return {
        team,
        baseLaborCost: Math.round(baseLaborCost),
        overheadCost: Math.round(overheadCost),
        bufferCost: Math.round(bufferCost),
        totalEstimatedCost: Math.round(totalEstimatedCost),
        estimatedGrossProfit: Math.round(estimatedGrossProfit),
        profitMarginPercent: Math.round(profitMarginPercent * 100) / 100,
        isFeasible,
        feasibilityNote: isFeasible
            ? 'Project is within budget'
            : `Project exceeds budget by ${formatMoney(totalEstimatedCost - input.clientBudget, input.currency ?? 'MMK')}`,
        aiReasoning: `Based on the ${input.timelineMonths}-month timeline and ${totalHours}h workload, I've selected ${team.length} team members. ${team.map(t => `${t.name} (${t.role}) contributes ${t.allocatedHours}h`).join(', ')}. Total cost is ${formatMoney(totalEstimatedCost, input.currency ?? 'MMK')} against a ${formatMoney(input.clientBudget, input.currency ?? 'MMK')} budget, yielding a ${profitMarginPercent.toFixed(1)}% margin.`,
        warnings: profitMarginPercent < 10 ? ['Profit margin is below 10%. Consider negotiating a higher budget or reducing scope.'] : [],
        skillGapAnalysis: {
            coveredSkills,
            gapSkills,
            recommendations: gapSkills.length > 0
                ? [`Consider hiring or contracting for: ${gapSkills.join(', ')}.`]
                : ['All required skills are covered by the current team.'],
        },
    }
}

export async function POST(req: NextRequest) {
    // Authn gate: the route forwards to Anthropic which consumes paid budget,
    // so unauthenticated callers must be turned away. Previously __session
    // was read only for optional usage logging; that meant a missing cookie
    // would still hit Anthropic. Tenant id is also required so the AI call
    // can't leak across tenants on logging side.
    const sessionToken = req.cookies.get('__session')?.value
    const tenantId     = req.headers.get('x-tenant-id')
    if (!sessionToken) {
        return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    }
    if (!tenantId) {
        return NextResponse.json({ error: 'Missing X-Tenant-ID header' }, { status: 400 })
    }

    // Authz gate: only roles that can actually use the CRM should be allowed
    // to burn AI budget. Without this, a Delivery / HR user with a valid
    // session could POST here directly. Mirrors the manage_crm permission
    // enforced on backend deal write routes (see lib/rbac.ts).
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000/api'
    try {
        const meRes = await fetch(`${apiUrl}/auth/me`, {
            headers: {
                Authorization: `Bearer ${sessionToken}`,
                'X-Tenant-ID':  tenantId,
                Accept:         'application/json',
            },
            // Don't let Next cache the auth check.
            cache: 'no-store',
        })
        if (!meRes.ok) {
            return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
        }
        const meBody = await meRes.json()
        // The Laravel resource may wrap in `data`, or auth controller may
        // return the user shape flat — defensive on both. Super admins
        // bypass app-role checks (consistent with backend TenantScope).
        const user = meBody?.data ?? meBody?.user ?? meBody
        const appRole: string | undefined = user?.app_role ?? user?.appRole
        const isSuperAdmin = !!(user?.is_super_admin ?? user?.isSuperAdmin)
        const ALLOWED_ROLES = ['Admin', 'Sales']
        if (!isSuperAdmin && (!appRole || !ALLOWED_ROLES.includes(appRole))) {
            return NextResponse.json({
                error: `Your role (${appRole ?? 'unknown'}) does not have permission to use AI Team Builder.`,
            }, { status: 403 })
        }
    } catch {
        // Auth check itself failed — fail closed (don't call Anthropic).
        return NextResponse.json({ error: 'Authorization check failed' }, { status: 503 })
    }

    const apiKey  = process.env.ANTHROPIC_API_KEY
    const baseURL = process.env.ANTHROPIC_BASE_URL

    let input: AITeamBuilderInput
    try {
        input = await req.json()
    } catch {
        return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    // Helper to log usage — called for both real and demo calls
    function logUsage(feature: string, model: string, inputTokens: number, outputTokens: number, costUsd: number) {
        const sessionToken = req.cookies.get('__session')?.value
        const tenantId     = req.headers.get('x-tenant-id')
        if (sessionToken && tenantId) {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000/api'
            fetch(`${apiUrl}/ai-usage`, {
                method: 'POST',
                headers: {
                    'Content-Type':  'application/json',
                    'Accept':        'application/json',
                    'Authorization': `Bearer ${sessionToken}`,
                    'X-Tenant-ID':   tenantId,
                },
                body: JSON.stringify({
                    feature,
                    model,
                    input_tokens:       inputTokens,
                    output_tokens:      outputTokens,
                    estimated_cost_usd: costUsd,
                }),
            }).catch(() => {}) // intentional fire-and-forget
        }
    }

    // Single concise log so we can tell from the dev server whether Claude
    // was actually called and what skills the route saw as "required". Without
    // this, debugging "why didn't Min Hein get picked" requires guesswork.
    const poolSkilledCount = (input.employees ?? []).filter(
        e => e.status === 'Active' && (e.skills ?? []).length > 0,
    ).length
    console.log(
        `[AI Team Builder] dealId=${input.dealId} requiredSkills=${JSON.stringify(input.requiredSkills ?? [])} pool=${(input.employees ?? []).length} active+skilled=${poolSkilledCount}`,
    )

    // Demo fallback: if no API key OR demo mode is implied, return a realistic mock
    if (!apiKey) {
        console.log('[AI Team Builder] Demo fallback — no API key configured')
        logUsage('ai_team_builder', 'demo-fallback', 0, 0, 0)
        if (input.outputMode === 'roles') {
            return NextResponse.json(generateRoleDemoResult(input))
        }
        const demoResult = enforceSkillCoverage(generateDemoResult(input), input)
        if (demoResult.addedNames.length > 0) {
            console.warn(`[AI Team Builder] Demo path: force-added skill carrier(s): ${demoResult.addedNames.join(', ')}`)
        }
        return NextResponse.json(demoResult.result)
    }

    const client = new Anthropic({ apiKey, baseURL })

    // outputMode === 'roles' uses the role-shaped prompt; the result has
    // `roles` populated and `team` empty. Skip enforceSkillCoverage in role
    // mode — it's an employee-pick safety net and doesn't apply.
    const isRoleMode = input.outputMode === 'roles'
    const systemPrompt = isRoleMode ? ROLE_SYSTEM_PROMPT : SYSTEM_PROMPT
    const userPrompt   = isRoleMode ? buildRoleUserPrompt(input) : buildUserPrompt(input)

    try {
        const message = await client.messages.create({
            model:      CLAUDE_MODEL,
            max_tokens: 4096,
            temperature: 0.2,
            system:     systemPrompt,
            messages: [
                { role: 'user', content: userPrompt },
                { role: 'assistant', content: '{' },
            ],
        })

        const rawText = message.content[0]?.type === 'text' ? message.content[0].text : ''

        if (!rawText) {
            logUsage('ai_team_builder', CLAUDE_MODEL, message.usage.input_tokens, message.usage.output_tokens, estimateCost(message.usage.input_tokens, message.usage.output_tokens))
            return NextResponse.json(
                { error: 'AI returned an empty response. Try again.' },
                { status: 500 }
            )
        }

        // Pull the JSON object out of the raw response. Claude does any of:
        //   (a) emit its own clean JSON object, ignoring the assistant prefill
        //   (b) wrap the JSON in ```json ... ``` markdown fences
        //   (c) continue from the prefilled '{' so the response is just the
        //       inside of the object onwards — only valid when prepended
        // Try the raw text first (covers a + b via the depth-walking
        // extractor) — that's the common case. Only fall back to prepending
        // the prefilled '{' if no balanced object is found in raw.
        let clean = extractFirstJsonObject(rawText)
        if (!clean) {
            clean = extractFirstJsonObject('{' + rawText)
        }
        clean = clean ?? rawText

        let result: AITeamBuilderResult
        try {
            result = JSON.parse(clean) as AITeamBuilderResult
        } catch (parseErr) {
            // Log the raw output so we can see what Claude actually produced.
            // Truncate to keep the dev log readable.
            const preview = rawText.length > 800 ? rawText.slice(0, 800) + '…[truncated]' : rawText
            console.error(
                'AI Team Builder: non-JSON response, falling back to demo mode\n' +
                '  parse error: ' + (parseErr instanceof Error ? parseErr.message : String(parseErr)) + '\n' +
                '  raw response from Claude (the prefilled "{" we sent is NOT included):\n' + preview,
            )
            logUsage('ai_team_builder', CLAUDE_MODEL, message.usage.input_tokens, message.usage.output_tokens, estimateCost(message.usage.input_tokens, message.usage.output_tokens))
            // Role mode and employee mode have different result shapes — the
            // role-mode UI gates on `result.roles`, employee-mode on `result.team`.
            // Falling back to the wrong demo silently breaks the UI ("I got a
            // 200 but nothing rendered"). Pick the right shape for the input.
            if (isRoleMode) {
                return NextResponse.json(generateRoleDemoResult(input))
            }
            const demoResult = enforceSkillCoverage(generateDemoResult(input), input)
            return NextResponse.json(demoResult.result)
        }

        // Fire-and-forget usage log — never blocks the AI response
        logUsage('ai_team_builder', message.model, message.usage.input_tokens, message.usage.output_tokens, estimateCost(message.usage.input_tokens, message.usage.output_tokens))

        // Role mode: no skill-coverage enforcement (it operates on per-employee
        // picks). Return Claude's role-shaped output as-is.
        if (isRoleMode) {
            return NextResponse.json(result)
        }

        // Belt-and-suspenders: even with the prompt's selection rules, Claude
        // sometimes leaves out a uniquely-skilled employee. enforceSkillCoverage
        // is budget-aware — only force-adds when the carrier fits the budget.
        const enforced = enforceSkillCoverage(result, input)
        if (enforced.addedNames.length > 0) {
            console.warn(
                `[AI Team Builder] Force-added ${enforced.addedNames.length} skill carrier(s) Claude omitted: ${enforced.addedNames.join(', ')}`,
            )
        }
        if (enforced.skippedForBudget.length > 0) {
            console.warn(
                `[AI Team Builder] Skipped ${enforced.skippedForBudget.length} skill carrier(s) — adding them would exceed clientBudget: ${enforced.skippedForBudget.join(', ')}`,
            )
        }

        return NextResponse.json(enforced.result)
    } catch (err) {
        console.error('AI Team Builder error:', err)
        // Fallback to demo mode on any API error — same shape branch as the
        // parse-error fallback above; otherwise role-mode callers get an
        // employee-shaped result and silently render nothing.
        if (isRoleMode) {
            return NextResponse.json(generateRoleDemoResult(input))
        }
        const demoResult = enforceSkillCoverage(generateDemoResult(input), input)
        return NextResponse.json(demoResult.result)
    }
}
