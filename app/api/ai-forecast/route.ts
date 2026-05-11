import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const CLAUDE_MODEL = 'claude-haiku-4-5-20251001';

// Pricing: Claude Haiku 4.5 — $1.00/1M input · $5.00/1M output
const INPUT_COST_PER_TOKEN  = 1.00 / 1_000_000;
const OUTPUT_COST_PER_TOKEN = 5.00 / 1_000_000;

function estimateCost(inputTokens: number, outputTokens: number): number {
    return (inputTokens * INPUT_COST_PER_TOKEN) + (outputTokens * OUTPUT_COST_PER_TOKEN);
}

// Same brace-walking parser as the team builder — Claude often wraps the
// JSON in prose or ```json fences. Returns null if no balanced object found.
function extractFirstJsonObject(text: string): string | null {
    const start = text.indexOf('{');
    if (start === -1) return null;
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = start; i < text.length; i++) {
        const ch = text[i];
        if (escape) { escape = false; continue; }
        if (ch === '\\') { escape = true; continue; }
        if (ch === '"') { inString = !inString; continue; }
        if (inString) continue;
        if (ch === '{') depth++;
        else if (ch === '}') {
            depth--;
            if (depth === 0) return text.slice(start, i + 1);
        }
    }
    return null;
}

export interface AIForecastInput {
    currency: string;
    currentMonth: string;            // e.g. "May 2026"
    headcount: number;               // active employees count
    avgMonthlySalary: number;        // mean across active employees
    trailingMonthlyRevenue: number;  // avg of last 3 paid months
    trailingMonthlyProfit: number;   // avg operating profit of last 3 months
    utilization: {
        actualPercent: number;       // approved hours / workable hours (last 1-3 mo)
        targetPercent: number;       // typically 80-90
    };
    pipeline: {
        totalWeightedValue: number;  // Σ value × probability for open deals
        slippingValue: number;       // open deals past expectedCloseDate
        slippingCount: number;
        totalCount: number;
    };
    invoices: {
        overdueValue: number;        // unpaid invoices past dueDate
        overdueCount: number;
        meanLateDays: number;        // historical mean(paidAt - dueDate)
    };
}

export interface AIForecastResult {
    utilizationDrop: number;   // 0-50
    delayedDeals: number;      // currency amount, rounded to 25000
    newHires: number;          // 0-10
    reasoning: string;
    signals: {
        utilizationInsight: string;
        pipelineInsight: string;
        capacityInsight: string;
    };
}

const SYSTEM_PROMPT = `You are a financial forecasting assistant for a software agency SaaS.

Given a snapshot of the agency's current business state, predict three forward-looking risk values for the next 6 months:

1. utilizationDrop (0-50, integer, percent) — how much delivery revenue is at risk from idle staff / bench time. Anchor on the gap between actual and target utilization. If actual ≥ target, suggest 0-5. If actual is 60-70% of target, suggest 20-30. Cap at 50.

2. delayedDeals (currency amount, rounded to nearest 25000) — how much pipeline cash will slip from months 1-3 into months 4-6. Anchor on slippingValue. Never exceed pipeline.totalWeightedValue. If no deals are slipping, suggest 0.

3. newHires (0-10, integer) — how many new staff the agency should add to absorb projected workload. Anchor on whether trailing revenue and pipeline justify more headcount. If trailing revenue per employee is high and pipeline is growing, suggest 1-3 hires. If profit margin is thin or pipeline is shrinking, suggest 0.

Respond with strict JSON only. No prose outside the JSON. Schema:

{
  "utilizationDrop": <integer 0-50>,
  "delayedDeals": <integer, multiple of 25000>,
  "newHires": <integer 0-10>,
  "reasoning": "<2-3 sentences explaining the overall forecast posture>",
  "signals": {
    "utilizationInsight": "<one sentence on utilization signal>",
    "pipelineInsight": "<one sentence on pipeline signal>",
    "capacityInsight": "<one sentence on capacity / hiring signal>"
  }
}`;

function buildUserPrompt(input: AIForecastInput): string {
    return `Agency snapshot as of ${input.currentMonth} (currency: ${input.currency}):

Headcount: ${input.headcount} active employees
Average monthly salary: ${input.avgMonthlySalary.toFixed(0)}
Trailing 3-month average revenue: ${input.trailingMonthlyRevenue.toFixed(0)}
Trailing 3-month average operating profit: ${input.trailingMonthlyProfit.toFixed(0)}

Utilization:
  Actual: ${input.utilization.actualPercent.toFixed(1)}%
  Target: ${input.utilization.targetPercent.toFixed(1)}%

Pipeline:
  Total weighted value (open deals): ${input.pipeline.totalWeightedValue.toFixed(0)}
  Slipping value (open deals past expected close date): ${input.pipeline.slippingValue.toFixed(0)}
  Slipping count: ${input.pipeline.slippingCount} of ${input.pipeline.totalCount} open deals

Invoices:
  Overdue value: ${input.invoices.overdueValue.toFixed(0)} (${input.invoices.overdueCount} invoices)
  Historical mean lateness: ${input.invoices.meanLateDays.toFixed(1)} days

Predict utilizationDrop, delayedDeals, and newHires for the next 6 months.`;
}

function clampResult(result: AIForecastResult, pipelineTotal: number): AIForecastResult {
    return {
        ...result,
        utilizationDrop: Math.max(0, Math.min(50, Math.round(result.utilizationDrop))),
        delayedDeals: Math.max(
            0,
            Math.min(
                Math.ceil(pipelineTotal / 25000) * 25000,
                Math.round(result.delayedDeals / 25000) * 25000,
            ),
        ),
        newHires: Math.max(0, Math.min(10, Math.round(result.newHires))),
    };
}

export async function POST(req: NextRequest) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    const baseURL = process.env.ANTHROPIC_BASE_URL;

    let input: AIForecastInput;
    try {
        input = await req.json();
    } catch {
        return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    function logUsage(model: string, inputTokens: number, outputTokens: number, costUsd: number) {
        const sessionToken = req.cookies.get('__session')?.value;
        const tenantId     = req.headers.get('x-tenant-id');
        if (sessionToken && tenantId) {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000/api';
            fetch(`${apiUrl}/ai-usage`, {
                method: 'POST',
                headers: {
                    'Content-Type':  'application/json',
                    'Accept':        'application/json',
                    'Authorization': `Bearer ${sessionToken}`,
                    'X-Tenant-ID':   tenantId,
                },
                body: JSON.stringify({
                    feature: 'ai_forecast',
                    model,
                    input_tokens:       inputTokens,
                    output_tokens:      outputTokens,
                    estimated_cost_usd: costUsd,
                }),
            }).catch(() => {});
        }
    }

    if (!apiKey) {
        return NextResponse.json(
            { error: 'AI forecasting is not configured. ANTHROPIC_API_KEY is missing.' },
            { status: 503 },
        );
    }

    const client = new Anthropic({ apiKey, baseURL });

    try {
        const message = await client.messages.create({
            model:       CLAUDE_MODEL,
            max_tokens:  1024,
            temperature: 0.4,
            system:      SYSTEM_PROMPT,
            messages: [
                { role: 'user', content: buildUserPrompt(input) },
                { role: 'assistant', content: '{' },
            ],
        });

        const rawText = message.content[0]?.type === 'text' ? message.content[0].text : '';
        logUsage(
            message.model,
            message.usage.input_tokens,
            message.usage.output_tokens,
            estimateCost(message.usage.input_tokens, message.usage.output_tokens),
        );

        if (!rawText) {
            return NextResponse.json({ error: 'AI returned an empty response.' }, { status: 502 });
        }

        let clean = extractFirstJsonObject(rawText);
        if (!clean) clean = extractFirstJsonObject('{' + rawText);
        clean = clean ?? rawText;

        let result: AIForecastResult;
        try {
            result = JSON.parse(clean) as AIForecastResult;
        } catch {
            const preview = rawText.length > 400 ? rawText.slice(0, 400) + '…' : rawText;
            console.error('[AI Forecast] non-JSON response from Claude:\n' + preview);
            return NextResponse.json({ error: 'AI returned malformed JSON.' }, { status: 502 });
        }

        return NextResponse.json(clampResult(result, input.pipeline.totalWeightedValue));
    } catch (err) {
        console.error('[AI Forecast] error:', err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : 'AI forecast failed.' },
            { status: 500 },
        );
    }
}
