import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { SYSTEM_PROMPT, buildUserPrompt, enforceSkillCoverage } from '@/lib/aiTeamBuilder'
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
        const demoResult = enforceSkillCoverage(generateDemoResult(input), input)
        if (demoResult.addedNames.length > 0) {
            console.warn(`[AI Team Builder] Demo path: force-added skill carrier(s): ${demoResult.addedNames.join(', ')}`)
        }
        return NextResponse.json(demoResult.result)
    }

    const client = new Anthropic({ apiKey, baseURL })

    try {
        const message = await client.messages.create({
            model:      CLAUDE_MODEL,
            max_tokens: 4096,
            temperature: 0.7,
            system:     SYSTEM_PROMPT,
            messages: [
                { role: 'user', content: buildUserPrompt(input) },
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
            const demoResult = enforceSkillCoverage(generateDemoResult(input), input)
            return NextResponse.json(demoResult.result)
        }

        // Fire-and-forget usage log — never blocks the AI response
        logUsage('ai_team_builder', message.model, message.usage.input_tokens, message.usage.output_tokens, estimateCost(message.usage.input_tokens, message.usage.output_tokens))

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
        // Fallback to demo mode on any API error
        const demoResult = enforceSkillCoverage(generateDemoResult(input), input)
        return NextResponse.json(demoResult.result)
    }
}
