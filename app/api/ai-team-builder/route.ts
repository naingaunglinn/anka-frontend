import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { SYSTEM_PROMPT, buildUserPrompt } from '@/lib/aiTeamBuilder'
import type { AITeamBuilderInput, AITeamBuilderResult } from '@/types/aiTeamBuilder'

const CLAUDE_MODEL = 'claude-3-5-sonnet-latest'

// Pricing: Claude 3.5 Sonnet — $3.00/1M input · $15.00/1M output
const INPUT_COST_PER_TOKEN  = 3.00  / 1_000_000
const OUTPUT_COST_PER_TOKEN = 15.00 / 1_000_000

function estimateCost(inputTokens: number, outputTokens: number): number {
    return (inputTokens * INPUT_COST_PER_TOKEN) + (outputTokens * OUTPUT_COST_PER_TOKEN)
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
            reasoning: `${emp.name} brings ${emp.capacityRole} expertise with ${emp.monthlySalary ? `$${emp.monthlySalary.toLocaleString()}/mo` : 'competitive'} cost rate.`,
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
            : `Project exceeds budget by $${(totalEstimatedCost - input.clientBudget).toLocaleString()}`,
        aiReasoning: `Based on the ${input.timelineMonths}-month timeline and ${totalHours}h workload, I've selected ${team.length} team members. ${team.map(t => `${t.name} (${t.role}) contributes ${t.allocatedHours}h`).join(', ')}. Total cost is $${totalEstimatedCost.toLocaleString()} against a $${input.clientBudget.toLocaleString()} budget, yielding a ${profitMarginPercent.toFixed(1)}% margin.`,
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

    // Demo fallback: if no API key OR demo mode is implied, return a realistic mock
    if (!apiKey) {
        console.log('[AI Team Builder] Demo fallback — no API key configured')
        return NextResponse.json(generateDemoResult(input))
    }

    const client = new Anthropic({ apiKey, baseURL })

    try {
        const message = await client.messages.create({
            model:      CLAUDE_MODEL,
            max_tokens: 4096,
            temperature: 0.0,
            system:     SYSTEM_PROMPT,
            messages: [
                { role: 'user', content: buildUserPrompt(input) },
                { role: 'assistant', content: '{' },
            ],
        })

        const rawText = message.content[0]?.type === 'text' ? message.content[0].text : ''

        if (!rawText) {
            return NextResponse.json(
                { error: 'AI returned an empty response. Try again.' },
                { status: 500 }
            )
        }

        // Prefilled with '{' so Claude continues from there — prepend it back
        let clean = ('{' + rawText).trim()

        // Strip accidental markdown fences
        clean = clean
            .replace(/^```json\s*/i, '')
            .replace(/```\s*$/i, '')
            .trim()

        // If still not pure JSON, try to extract the JSON object
        if (!clean.startsWith('{')) {
            const firstBrace = clean.indexOf('{')
            const lastBrace  = clean.lastIndexOf('}')
            if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
                clean = clean.slice(firstBrace, lastBrace + 1)
            }
        }

        let result: AITeamBuilderResult
        try {
            result = JSON.parse(clean) as AITeamBuilderResult
        } catch {
            // Claude refused or returned non-JSON — fall back to demo mode
            console.error('AI Team Builder: non-JSON response, falling back to demo mode')
            return NextResponse.json(generateDemoResult(input))
        }

        // Fire-and-forget usage log — never blocks the AI response
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
                    feature:            'ai_team_builder',
                    model:              message.model,
                    input_tokens:       message.usage.input_tokens,
                    output_tokens:      message.usage.output_tokens,
                    estimated_cost_usd: estimateCost(
                        message.usage.input_tokens,
                        message.usage.output_tokens
                    ),
                }),
            }).catch(() => {}) // intentional fire-and-forget
        }

        return NextResponse.json(result)
    } catch (err) {
        console.error('AI Team Builder error:', err)
        // Fallback to demo mode on any API error
        return NextResponse.json(generateDemoResult(input))
    }
}
