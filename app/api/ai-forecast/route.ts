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
    rankScopeLabel: string;
    regenerateCount?: number;
    headcount: number;               // active employees count
    avgMonthlySalary: number;        // mean across active employees
    trailingMonthlyRevenue: number;  // avg of last 3 paid months
    trailingMonthlyProfit: number;   // avg operating profit of last 3 months
    sixMonthForecastProfit: number;
    comparisonMonthLabel: string;
    comparisonBudgetTarget: number;
    gapToComparisonTarget: number;
    annualInitialBudget: number;
    remainingToAnnualTarget: number;
    monthsRemainingInYear: number;
    monthlyForecast: Array<{
        monthLabel: string;
        income: number;
        cost: number;
        profit: number;
    }>;
    sourceCounts: {
        s: number;
        a: number;
        b: number;
    };
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
    previousSummary?: {
        summaryTitle?: string;
        reasoning?: string;
        recommendedActionTitles?: string[];
    } | null;
}

export interface AIForecastAction {
    title: string;
    priority: 'high' | 'medium' | 'low';
    rationale: string;
    expectedImpact: string;
}

export interface AIForecastResult {
    utilizationDrop: number;   // 0-50
    delayedDeals: number;      // currency amount, rounded to 25000
    newHires: number;          // 0-10
    summaryTitle: string;
    reasoning: string;
    recommendedActions: AIForecastAction[];
    signals: {
        utilizationInsight: string;
        pipelineInsight: string;
        capacityInsight: string;
    };
}

const SYSTEM_PROMPT = `You are a financial forecasting assistant for a software agency SaaS.

Given a snapshot of the agency's current business state, predict three forward-looking risk values for the next 6 months and produce a short action summary.

1. utilizationDrop (0-50, integer, percent) — how much delivery revenue is at risk from idle staff / bench time. Anchor on the gap between actual and target utilization. If actual ≥ target, suggest 0-5. If actual is 60-70% of target, suggest 20-30. Cap at 50.

2. delayedDeals (currency amount, rounded to nearest 25000) — how much pipeline cash will slip from months 1-3 into months 4-6. Anchor on slippingValue. Never exceed pipeline.totalWeightedValue. If no deals are slipping, suggest 0.

3. newHires (0-10, integer) — how many new staff the agency should add to absorb projected workload. Anchor on whether trailing revenue and pipeline justify more headcount. If trailing revenue per employee is high and pipeline is growing, suggest 1-3 hires. If profit margin is thin or pipeline is shrinking, suggest 0.

Action-summary rule:
- If gapToComparisonTarget is negative, focus on what the agency should do to close the gap by comparisonMonthLabel.
- If gapToComparisonTarget is zero or positive, focus on what the agency should do next to protect margin and still hit the full annualInitialBudget by year end.
- recommendedActions must be concrete management actions, not generic advice.
- Every recommended action must be specific to the numbers in the input. Mention a lever such as staffing, delivery pace, deal conversion, invoicing, pricing, scope control, overtime control, or collections.
- Do not give vague advice like "improve efficiency" or "monitor closely" unless you also say exactly what to change.
- Prioritize actions that can be executed by an agency manager within the next 30-90 days.
- If regenerateCount > 0, assume the user disliked the previous answer. In that case:
  1. do not repeat the same wording,
  2. make the actions sharper and more operational,
  3. materially change at least 2 of the 3 actions,
  4. explicitly improve on the previousSummary weaknesses.

Respond with strict JSON only. No prose outside the JSON. Schema:

{
  "utilizationDrop": <integer 0-50>,
  "delayedDeals": <integer, multiple of 25000>,
  "newHires": <integer 0-10>,
  "summaryTitle": "<short headline, max 10 words>",
  "reasoning": "<2-4 sentences explaining the overall forecast posture, tied to the provided numbers>",
  "recommendedActions": [
    {
      "title": "<short action title, max 8 words>",
      "priority": "<high|medium|low>",
      "rationale": "<one sentence linking the action to the forecast numbers>",
      "expectedImpact": "<one sentence describing what this action should improve>"
    },
    {
      "title": "<action 2>",
      "priority": "<high|medium|low>",
      "rationale": "<why>",
      "expectedImpact": "<impact>"
    },
    {
      "title": "<action 3>",
      "priority": "<high|medium|low>",
      "rationale": "<why>",
      "expectedImpact": "<impact>"
    }
  ],
  "signals": {
    "utilizationInsight": "<one sentence on utilization signal>",
    "pipelineInsight": "<one sentence on pipeline signal>",
    "capacityInsight": "<one sentence on capacity / hiring signal>"
  }
}`;

function buildUserPrompt(input: AIForecastInput): string {
    return `Agency snapshot as of ${input.currentMonth} (currency: ${input.currency}):

Scope:
  Rank filter: ${input.rankScopeLabel}
  6-month forecast profit: ${input.sixMonthForecastProfit.toFixed(0)}
  ${input.comparisonMonthLabel} target profit: ${input.comparisonBudgetTarget.toFixed(0)}
  Gap to ${input.comparisonMonthLabel} target: ${input.gapToComparisonTarget.toFixed(0)}
  Annual Initial Budget target: ${input.annualInitialBudget.toFixed(0)}
  Remaining to full-year target: ${input.remainingToAnnualTarget.toFixed(0)}
  Months remaining in year after forecast window: ${input.monthsRemainingInYear}
  Regenerate attempt: ${input.regenerateCount ?? 0}
  Rank counts: S=${input.sourceCounts.s}, A=${input.sourceCounts.a}, B=${input.sourceCounts.b}

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

Monthly 6-month forecast:
${input.monthlyForecast.map((row) => `  - ${row.monthLabel}: income ${row.income.toFixed(0)}, cost ${row.cost.toFixed(0)}, profit ${row.profit.toFixed(0)}`).join('\n')}

Previous summary to improve on:
${input.previousSummary
        ? `  Title: ${input.previousSummary.summaryTitle ?? 'n/a'}
  Reasoning: ${input.previousSummary.reasoning ?? 'n/a'}
  Previous action titles: ${(input.previousSummary.recommendedActionTitles ?? []).join(', ') || 'n/a'}`
        : '  None'}

Predict utilizationDrop, delayedDeals, and newHires for the next 6 months, then produce a short summary plus 3 recommendedActions that help the agency either close the comparison target gap or finish the year at the full annual target.`;
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
        summaryTitle: result.summaryTitle || 'Forecast Summary',
        recommendedActions: Array.isArray(result.recommendedActions)
            ? result.recommendedActions
                .filter((action): action is AIForecastAction => !!action && typeof action === 'object')
                .slice(0, 3)
                .map((action) => ({
                    title: action.title || 'Action',
                    priority: action.priority === 'high' || action.priority === 'medium' || action.priority === 'low' ? action.priority : 'medium',
                    rationale: action.rationale || '',
                    expectedImpact: action.expectedImpact || '',
                }))
            : [],
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
            temperature: input.regenerateCount && input.regenerateCount > 0 ? 0.7 : 0.4,
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
