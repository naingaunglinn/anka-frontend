import { NextRequest, NextResponse } from 'next/server'
import { SYSTEM_PROMPT, buildUserPrompt } from '@/lib/aiTeamBuilder'
import type { AITeamBuilderInput, AITeamBuilderResult } from '@/types/aiTeamBuilder'

const GEMINI_MODEL = 'gemini-2.0-flash-lite'
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`

export async function POST(req: NextRequest) {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
        return NextResponse.json(
            { error: 'GEMINI_API_KEY is not configured in .env.local' },
            { status: 500 }
        )
    }

    let input: AITeamBuilderInput
    try {
        input = await req.json()
    } catch {
        return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const payload = {
        system_instruction: {
            parts: [{ text: SYSTEM_PROMPT }],
        },
        contents: [
            {
                role: 'user',
                parts: [{ text: buildUserPrompt(input) }],
            },
        ],
        generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 2048,
            responseMimeType: 'application/json',
        },
    }

    try {
        const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        })

        if (!response.ok) {
            const errorBody = await response.text()
            console.error('Gemini API error:', errorBody)
            return NextResponse.json(
                { error: 'Gemini API request failed', details: errorBody },
                { status: response.status }
            )
        }

        const data = await response.json()

        const rawText: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''

        if (!rawText) {
            return NextResponse.json(
                { error: 'Gemini returned an empty response' },
                { status: 500 }
            )
        }

        // Strip accidental markdown fences defensively
        const clean = rawText
            .replace(/^```json\s*/i, '')
            .replace(/```\s*$/i, '')
            .trim()

        const result: AITeamBuilderResult = JSON.parse(clean)

        return NextResponse.json(result)
    } catch (err) {
        console.error('AI Team Builder error:', err)
        return NextResponse.json(
            { error: 'Failed to parse AI response. Try regenerating.' },
            { status: 500 }
        )
    }
}
