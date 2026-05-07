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
            // Claude refused or returned non-JSON — surface the text to the user
            const excerpt = clean.slice(0, 300)
            console.error('AI Team Builder: non-JSON response —', excerpt)
            return NextResponse.json(
                { error: `AI could not generate a valid recommendation. Response: ${excerpt}` },
                { status: 500 }
            )
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
        return NextResponse.json(
            { error: 'Failed to generate AI team recommendation. Try regenerating.' },
            { status: 500 }
        )
    }
}
