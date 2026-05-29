import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { KNOWLEDGE_BASE, type KnowledgeChunk } from '@/lib/knowledgeBase'

const CLAUDE_MODEL = process.env.ANTHROPIC_MODEL ?? 'deepseek-v4-pro'

// OpenCode Zen Go's proxy translates Anthropic Messages → underlying provider
// (DeepSeek, etc.) and rejects the plain-string `content` shorthand even
// though the real Anthropic API accepts it. Always send the canonical
// multipart form.
const asText = (text: string) => [{ type: 'text' as const, text }]

const SYSTEM_PROMPT = `You are the ANKA Assistant — an intelligent AI advisor built into ANKA, a B2B SaaS platform for IT agency management.

ANKA covers the full agency lifecycle: CRM/Pipeline → Estimation → Contracts → Projects → Time Tracking → Financials → Forecasting.

## Who uses ANKA
- **Executive / Admin**: Revenue, margins, utilization, P&L, forecasting, headcount decisions
- **Sales**: Deal pipeline, client budgets, proposals, AI-assisted estimation and team building
- **Delivery / PM**: Project tracking, team assignments, time entry approvals, budget vs actual
- **HR**: Employee profiles, capacity planning, skills management, overhead configuration

## Core concepts
- **Deal flow**: Lead → Opportunity → Proposal → Contract → Won/Lost. Winning triggers win_deal() which atomically creates a Contract + Project.
- **Estimation**: Embedded in deals. Ghost roles define estimated team composition. Costs = base labor + overhead% + buffer%.
- **AI Team Builder**: Matches real employees to deal requirements by skills, capacity, and budget. Results saved as deal hard_assignments.
- **AI Auto-Assign**: When a project is created (deal won), distributes project hours to assigned employees intelligently.
- **AI Forecast**: Executive-level alerts — utilization drop %, delayed pipeline cash, project bleeding, people risks, headcount needs.
- **Utilization**: % of employee capacity used. Healthy = 70–85%. Under 70% = idle payroll cost. Over 90% = burnout risk.
- **P&L**: Revenue (paid invoices) − Direct Labor (approved hours × hourly rate) − Overhead% − Buffer% = Net Profit.
- **Time Entries**: Draft → Pending → Approved. Approved entries increment project consumed_hours and feed into P&L.
- **Contracts**: Created ONLY by win_deal(). No manual contract creation. Invoices belong to contracts, not projects.
- **Invoices**: Revenue Recognized = sum of paid invoices. Milestones group invoices for structured billing.
- **Roles**: Admin (full), Executive (read all + financials), Sales (CRM/deals), Delivery (projects/time), HR (org/people).
- **Multi-tenancy**: All data is tenant-scoped via X-Tenant-ID header. Super Admins manage tenants separately and cannot view org data.

## Response style
- Be concise and direct. Executives want bullet points, not essays.
- Use numbered steps for how-to procedural questions.
- **Bold** key ANKA feature names and important terms.
- If the provided context does not contain enough information, say so clearly — never fabricate specifics.
- Suggest a natural follow-up question only when it would genuinely help the user go deeper.
- Answer in the same language the user writes in.`

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

// ── Demo fallback: uses knowledge base to answer without calling Claude ──
function generateDemoAnswer(question: string): { answer: string; sources: { title: string; category: string }[] } {
    const relevant = findRelevantChunks(question, 3)

    if (relevant.length === 0) {
        return {
            answer: `I'm not sure about that specific topic. I can help with questions about ANKA's CRM, estimation, contracts, projects, time tracking, organization, and AI features. What would you like to know?`,
            sources: [{ title: 'ANKA Help', category: 'General' }],
        }
    }

    const best = relevant[0]
    const lines = best.content.split('\n').filter(l => l.trim().length > 10)
    const summary = lines.slice(0, 6).join('\n')

    const answers: Record<string, string> = {
        'win a deal': `To win a deal in ANKA:\n1. Open the deal detail page from the CRM board\n2. Click the **Win Deal** button\n3. Optionally add a win reason\n4. Confirm — this triggers the \\"win_deal()\\" stored procedure\n5. The system automatically creates a **Contract** and a **Project**\n6. Team assignments from the deal are copied to the project\n\nThe deal status changes to \\"won\\" and appears in the Won column.`,
        'time tracking': `Time tracking in ANKA works like this:\n1. Employees log hours against projects via **Time Entries**\n2. Each entry has a status: Draft → Pending → Approved/Rejected\n3. When approved, the entry's hours are added to the project's **consumed_hours**\n4. Approved entries also feed into the **P&L** as direct labor costs\n5. Managers can approve or reject entries from the Time Tracking page\n\nThe AI Auto-Assign feature can pre-populate assignments when a deal is won.`,
        'auto-assign': `AI Auto-Assign distributes project hours to team members automatically:\n1. When a contract is won, go to the Project detail page\n2. Click **Auto-Assign Team**\n3. The AI reads the deal's scope and matches employees by skills + capacity role\n4. It creates project_team_assignments with realistic allocated hours\n5. You can manually adjust assignments afterward\n\nThis saves PMs from manually calculating capacity for every new project.`,
        'estimation': `Estimation in ANKA is embedded in Deals, not a separate entity:\n1. Each deal has ghost_roles (estimated team composition)\n2. Set client budget, timeline, and workload hours\n3. Base labor cost = sum of (quantity × months × avg salary)\n4. Overhead and buffer costs are calculated from company settings\n5. The AI Team Builder suggests optimal staffing based on scope\n\nAll estimation data travels with the deal when it's won.`,
        'contract': `Contracts in ANKA are created exclusively by the **win_deal()** stored procedure.\n\nKey points:\n- No manual contract creation endpoint exists\n- Contract gets client name and total_value from the deal\n- Status flow: Draft → Active → Completed/Cancelled\n- Invoices belong to contracts (not projects)\n- Revenue recognized = sum of paid invoices\n\nMilestones can group related invoices for easier billing.`,
    }

    const lowerQ = question.toLowerCase()
    let answer = summary
    for (const [key, value] of Object.entries(answers)) {
        if (lowerQ.includes(key)) {
            answer = value
            break
        }
    }

    return {
        answer,
        sources: relevant.map(c => ({ title: c.source, category: c.category })),
    }
}

export async function POST(req: NextRequest) {
    const apiKey  = process.env.ANTHROPIC_API_KEY
    const baseURL = process.env.ANTHROPIC_BASE_URL

    let body: ChatRequest
    try {
        body = await req.json()
    } catch {
        return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    if (!body.question?.trim()) {
        return NextResponse.json({ error: 'Question is required' }, { status: 400 })
    }

    // Helper to log usage
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

    // Demo fallback: if no API key, answer from knowledge base
    if (!apiKey) {
        console.log('[AI Chatbot] Demo fallback — no API key configured')
        logUsage('ai_chatbot', 'demo-fallback', 0, 0, 0)
        const demo = generateDemoAnswer(body.question)
        return NextResponse.json({ ...demo, model: 'demo-mode' })
    }

    const client = new Anthropic({ apiKey, baseURL })
    const contextPrompt = buildContextPrompt(body.question)

    try {
        const historyMessages = (body.history ?? []).slice(-6).map(m => ({
            role: m.role as 'user' | 'assistant',
            content: asText(m.content),
        }))

        const message = await client.messages.create({
            model: CLAUDE_MODEL,
            max_tokens: 1024,
            temperature: 0.3,
            system: [
                {
                    type: 'text',
                    text: SYSTEM_PROMPT,
                    cache_control: { type: 'ephemeral' },
                },
            ],
            messages: [
                ...historyMessages,
                { role: 'user', content: asText(contextPrompt) },
            ],
        })

        const rawText = message.content[0]?.type === 'text' ? message.content[0].text : ''

        if (!rawText) {
            logUsage('ai_chatbot', CLAUDE_MODEL, message.usage.input_tokens, message.usage.output_tokens, 0.001)
            const demo = generateDemoAnswer(body.question)
            return NextResponse.json({ ...demo, model: 'demo-fallback' })
        }

        const relevantChunks = findRelevantChunks(body.question, 3)

        const response = {
            answer: rawText.trim(),
            sources: relevantChunks.map(c => ({ title: c.source, category: c.category })),
            model: message.model,
        }

        logUsage('ai_chatbot', message.model, message.usage.input_tokens, message.usage.output_tokens, 0.001)

        return NextResponse.json(response)
    } catch (err) {
        console.error('AI Chatbot error:', err)
        // Fallback to demo mode on any API error
        const demo = generateDemoAnswer(body.question)
        return NextResponse.json({ ...demo, model: 'demo-fallback' })
    }
}