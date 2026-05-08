import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { KNOWLEDGE_BASE, type KnowledgeChunk } from '@/lib/knowledgeBase'

const CLAUDE_MODEL = 'claude-3-5-sonnet-latest'

interface ChatMessage {
    role: 'user' | 'assistant'
    content: string
}

interface ChatRequest {
    question: string
    history?: ChatMessage[]
}

function findRelevantChunks(query: string, topK = 5): KnowledgeChunk[] {
    const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2)
    const scores: { chunk: KnowledgeChunk; score: number }[] = []

    for (const chunk of KNOWLEDGE_BASE) {
        let score = 0
        const contentLower = chunk.content.toLowerCase()

        for (const word of queryWords) {
            if (contentLower.includes(word)) {
                score += 1
            }
        }

        for (const word of queryWords) {
            if (chunk.source.toLowerCase().includes(word) || chunk.category.toLowerCase().includes(word)) {
                score += 2
            }
        }

        if (score > 0) {
            scores.push({ chunk, score })
        }
    }

    return scores
        .sort((a, b) => b.score - a.score)
        .slice(0, topK)
        .map(s => s.chunk)
}

function buildContextPrompt(question: string): string {
    const relevantChunks = findRelevantChunks(question, 5)

    if (relevantChunks.length === 0) {
        return `You are an AI assistant for ANKA, an agency management SaaS platform.
Answer the following question based on your general knowledge of the system.

Question: ${question}`
    }

    const contextSection = relevantChunks
        .map(c => `## ${c.source} (${c.category})\n${c.content}`)
        .join('\n\n')

    return `You are an AI assistant for ANKA, an agency management SaaS platform.
Use the following context to answer the user's question. If you don't know something, say so — do not make up information.

## Context

${contextSection}

---

Question: ${question}`
}

export async function POST(req: NextRequest) {
    const apiKey = process.env.ANTHROPIC_API_KEY

    if (!apiKey) {
        return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 })
    }

    let body: ChatRequest
    try {
        body = await req.json()
    } catch {
        return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    if (!body.question?.trim()) {
        return NextResponse.json({ error: 'Question is required' }, { status: 400 })
    }

    const client = new Anthropic({ apiKey })
    const contextPrompt = buildContextPrompt(body.question)

    try {
        const historyMessages = (body.history ?? []).slice(-6).map(m => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
        }))

        const message = await client.messages.create({
            model: CLAUDE_MODEL,
            max_tokens: 1024,
            temperature: 0.3,
            system: 'You are a helpful AI assistant for ANKA, an agency management SaaS platform. Answer questions about the system clearly and accurately. If you don\'t know something, say so.',
            messages: [
                ...historyMessages,
                { role: 'user', content: contextPrompt },
            ],
        })

        const rawText = message.content[0]?.type === 'text' ? message.content[0].text : ''

        if (!rawText) {
            return NextResponse.json({ error: 'AI returned empty response' }, { status: 500 })
        }

        const relevantChunks = findRelevantChunks(body.question, 3)

        const response = {
            answer: rawText.trim(),
            sources: relevantChunks.map(c => ({ title: c.source, category: c.category })),
            model: message.model,
        }

        return NextResponse.json(response)
    } catch (err) {
        console.error('AI Chatbot error:', err)
        return NextResponse.json({ error: 'Failed to generate response' }, { status: 500 })
    }
}