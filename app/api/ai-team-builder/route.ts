import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { SYSTEM_PROMPT, buildUserPrompt } from '@/lib/aiTeamBuilder'
import type { AITeamBuilderInput, AITeamBuilderResult } from '@/types/aiTeamBuilder'

const CLAUDE_MODEL = 'claude-haiku-4.5'

// Pricing: Claude Haiku 4.5 — $0.80/1M input · $4.00/1M output
const INPUT_COST_PER_TOKEN  = 0.80  / 1_000_000
const OUTPUT_COST_PER_TOKEN = 4.00  / 1_000_000

function estimateCost(inputTokens: number, outputTokens: number): number {
    return (inputTokens * INPUT_COST_PER_TOKEN) + (outputTokens * OUTPUT_COST_PER_TOKEN)
}

export async function POST(req: NextRequest) {
    const apiKey  = process.env.ANTHROPIC_API_KEY
    const baseURL = process.env.ANTHROPIC_BASE_URL
    if (!apiKey) {
        return NextResponse.json(
            { error: 'ANTHROPIC_API_KEY is not configured in .env.local' },
            { status: 500 }
        )
    }

    let input: AITeamBuilderInput
    try {
        input = await req.json()
    } catch {
        return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const client = new Anthropic({ apiKey, baseURL })

    try {
        const message = await client.messages.create({
            model:      CLAUDE_MODEL,
            max_tokens: 2048,
            temperature: 0.1,
            messages: [
                { role: 'user', content: SYSTEM_PROMPT + '\n\n---\n\n' + buildUserPrompt(input) },
            ],
        })

        const rawText = message.content[0]?.type === 'text' ? message.content[0].text : ''

        if (!rawText) {
            return NextResponse.json(
                { error: 'Claude returned an empty response' },
                { status: 500 }
            )
        }

        // Strip accidental markdown fences defensively
        let clean = rawText
            .replace(/^```json\s*/i, '')
            .replace(/```\s*$/i, '')
            .trim()

        // If the response isn't pure JSON, try to extract the JSON object
        if (!clean.startsWith('{')) {
            const firstBrace = clean.indexOf('{')
            const lastBrace  = clean.lastIndexOf('}')
            if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
                clean = clean.slice(firstBrace, lastBrace + 1)
            }
        }

        console.log(clean);

        const result: AITeamBuilderResult = JSON.parse(clean)

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
        return NextResponse.json(
            { error: 'Failed to generate AI team recommendation. Try regenerating.' },
            { status: 500 }
        )
    }
}
