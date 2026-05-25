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

// ── Input shapes ────────────────────────────────────────────────────────────

export interface ForecastProjectInput {
    name: string;
    client: string;
    status: string;                 // 'On Track' | 'At Risk' | 'Over Budget' | 'Completed'
    budget: number;                 // contract total value
    budgetHours: number;
    consumedHours: number;
    otHoursLogged: number;
    labourCostToDate: number;       // approved time entries × cost/hr × 1.15
    revenueRecognized: number;      // from contract.revenue_recognized
    cashCollected: number;          // from contract.cash_collected
    marginLifetimePercent: number;  // (budget − extrapolatedLifetimeCost) / budget × 100
    teamSize: number;
    ownerName: string;              // PM / lead
}

export interface ForecastPipelineDealInput {
    name: string;
    client: string;
    rank: 'C' | 'B' | 'A';
    stage: 'lead' | 'qualified' | 'negotiation';
    value: number;
    winProbability: number;
    daysInStage: number;
    daysPastExpectedClose: number;  // 0 if not slipping
    ownerName: string;
}

export interface ForecastCapacityHotspotInput {
    role: string;                     // capacity_role label, e.g. 'qa', 'frontend'
    utilizationPercent: number;       // 0–100+
    workableHoursThisMonth: number;
    bookedHoursThisMonth: number;
    otHoursLast90Days: number;
    soleEmployeeName?: string | null; // if there's only one person in this role
    bench: string[];                  // names of people on this role with spare capacity
}

export interface AIForecastInput {
    outputLocale?: 'en' | 'ja' | 'vi';
    currency: string;
    currentMonth: string;
    forecastWindowLabel: string;
    forecastMonthCount: number;
    rankScopeLabel: string;
    regenerateCount?: number;
    headcount: number;
    avgMonthlySalary: number;
    trailingMonthlyRevenue: number;
    trailingMonthlyProfit: number;
    forecastProfit: number;
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
    sourceCounts: { s: number; a: number; b: number };
    utilization: { actualPercent: number; targetPercent: number };
    pipeline: {
        totalWeightedValue: number;
        slippingValue: number;
        slippingCount: number;
        totalCount: number;
    };
    invoices: { overdueValue: number; overdueCount: number; meanLateDays: number };
    /** Per-project signals so Claude can name the bleeding project, not preach. */
    projects: ForecastProjectInput[];
    /** Pipeline deals (non-won) so Claude can flag stalled deals by name. */
    pipelineDeals: ForecastPipelineDealInput[];
    /** Capacity hotspots by role — singleton/overload/bench signals. */
    capacityHotspots: ForecastCapacityHotspotInput[];
    previousSummary?: {
        summaryTitle?: string;
        headline?: string;
        priorAlertTargets?: string[];   // names already called out, to encourage variety
    } | null;
}

// ── Output shapes ───────────────────────────────────────────────────────────

export type AlertSeverity = 'critical' | 'warning' | 'info';

export interface ForecastProjectAlert {
    projectName: string;
    severity: AlertSeverity;
    type: 'margin' | 'overtime' | 'timeline' | 'scope' | 'budget';
    diagnosis: string;          // 1–2 sentences with concrete numbers
    suggestedAction: string;    // 1 sentence with named owner if possible
    ownerName?: string;
}

export interface ForecastPeopleAlert {
    target: string;             // employee name or role label
    severity: AlertSeverity;
    type: 'overloaded' | 'idle' | 'singleton' | 'skill-gap' | 'overtime-trend';
    diagnosis: string;
    suggestedAction: string;
}

export interface ForecastPipelineAlert {
    dealName: string;
    severity: AlertSeverity;
    type: 'slipping' | 'cliff' | 'value-mismatch' | 'stalled' | 'opportunity';
    diagnosis: string;
    suggestedAction: string;
}

export interface AIForecastResult {
    summaryTitle: string;        // short headline, max 10 words
    headline: string;            // 1–2 sentence TL;DR — names projects/deals/people
    projectAlerts: ForecastProjectAlert[];
    peopleAlerts: ForecastPeopleAlert[];
    pipelineAlerts: ForecastPipelineAlert[];
    utilizationDrop: number;     // 0–50
    delayedDeals: number;        // currency, rounded to 25000
    newHires: number;            // 0–10
}

type ForecastOutputLocale = NonNullable<AIForecastInput['outputLocale']>;

const OUTPUT_LANGUAGE_BY_LOCALE: Record<ForecastOutputLocale, string> = {
    en: 'English',
    ja: 'Japanese',
    vi: 'Vietnamese',
};

const FALLBACK_COPY_BY_LOCALE: Record<ForecastOutputLocale, { summaryTitle: string; headline: string }> = {
    en: { summaryTitle: 'Forecast Summary',   headline: 'No notable signals in the current pipeline.' },
    ja: { summaryTitle: '予測サマリー',         headline: 'パイプラインに注目すべき信号はありません。' },
    vi: { summaryTitle: 'Tóm tắt dự báo',     headline: 'Không có tín hiệu đáng chú ý trong pipeline.' },
};

function normalizeOutputLocale(value: string | undefined): ForecastOutputLocale {
    return value === 'ja' || value === 'vi' ? value : 'en';
}

function buildSystemPrompt(outputLocale: ForecastOutputLocale): string {
    const outputLanguage = OUTPUT_LANGUAGE_BY_LOCALE[outputLocale];

    return `You are a forward-looking risk analyst for a software agency SaaS. Your audience is a Sales executive or HR lead, not a finance analyst. They will scan, not read. Every alert MUST name a specific project, deal, person, or role — never abstract advice.

Your job has 3 parts:

PART A — Three forward-looking risk numbers for the current-month-to-year-end window:

1. utilizationDrop (0-50, integer, percent) — revenue at risk from idle staff. If actual ≥ target, suggest 0-5. If actual is 60-70% of target, suggest 20-30. Cap at 50.
2. delayedDeals (currency, rounded to nearest 25000) — pipeline cash that will slip later in the year. Anchor on slippingValue. Never exceed pipeline.totalWeightedValue.
3. newHires (0-10, integer) — recommended new headcount. Anchor on capacity-hotspot signals (singletons, overloaded roles, projected workload growth).

PART B — A single 1-line TL;DR (the \`headline\` field) for an executive who has 5 seconds:
- Names 2 or 3 specific entities (a project, a deal, a person/role) — never generic.
- Includes at least one concrete number (a margin %, ¥ amount, days, OT hours).
- Example tone: "Rakuten bleeding ¥11M; LINE stalled 35 days; only Hayashi covers JR East QA."
- Max 25 words.

PART C — Three categorized alert arrays, each item naming a specific entity:

projectAlerts (0-3 items) — observed problems on currently-delivering projects:
- Read \`projects[]\`. Flag any with marginLifetimePercent < 5, otHoursLogged > 80, or status 'At Risk' / 'Over Budget'.
- type: "margin" | "overtime" | "timeline" | "scope" | "budget".
- diagnosis: 1-2 sentences naming the project AND the concrete signal (numbers/dates).
- suggestedAction: 1 sentence, name the owner if known, propose a concrete next step within 30 days.
- severity: "critical" if margin < -3% OR OT > 120h. "warning" if margin 0-5% OR OT 50-120h. "info" otherwise.

peopleAlerts (0-3 items) — staff or role-level risks:
- Read \`capacityHotspots[]\`. Flag singletons on long projects, overloaded roles (utilization > target × 1.1), idle bench, or roles with rising OT trend.
- target: employee full name when possible, else role label.
- type: "overloaded" | "idle" | "singleton" | "skill-gap" | "overtime-trend".
- diagnosis: 1-2 sentences naming the person/role + the concrete signal.
- suggestedAction: 1 sentence (hire, redistribute, train, escalate).

pipelineAlerts (0-3 items) — sales-pipeline risks AND opportunities:
- Read \`pipelineDeals[]\`. Flag stalled deals (daysInStage > 30 in qualified/negotiation), slipping deals (daysPastExpectedClose > 0), value-mismatched deals (low rank but high value), or post-window cliffs (no deals active in coming months).
- type: "slipping" | "cliff" | "value-mismatch" | "stalled" | "opportunity".
- For a "cliff", set dealName to "Pipeline cliff: <month>" or similar — the field doesn't have to be a single deal.
- severity: "critical" if cliff or stalled > 60 days. "warning" if stalled 30-60 days. "info" for opportunities.

GLOBAL RULES:
- Each alert MUST name an entity (project / deal / person / role) explicitly in the diagnosis. Never write "the team" or "some deals".
- Each alert MUST include at least one number (¥, %, days, hours).
- NEVER write advice like "monitor closely", "improve efficiency", "weekly reviews" without naming WHAT to monitor and WHEN.
- If a category has nothing to flag, return an empty array — do not invent issues.
- Max total alerts across all 3 categories: 6.
- If regenerateCount > 0:
  1. Do not repeat any of the previousSummary.priorAlertTargets (find different angles).
  2. Sharpen the diagnoses with more specific numbers.

OUTPUT LANGUAGE:
- Write headline, summaryTitle, all diagnosis/suggestedAction in ${outputLanguage}.
- Keep JSON property names exactly as shown.
- Keep severity enum exactly "critical" / "warning" / "info" and type enums exactly as listed (all lowercase, English) so the UI can parse.
- Project / deal / employee / client names stay as-given (don't translate).

CRITICAL OUTPUT FORMAT — read this twice:
- Your ENTIRE response must be a single JSON object matching the schema below.
- Start your response with the character "{" and end with the character "}".
- DO NOT write any prose, explanation, apology, or markdown fences. No "Here is the JSON", no "\`\`\`json", no "I hope this helps". The first character you emit must be "{".
- If the input data is insufficient for some alert category, return an empty array \`[]\` for that category. Never refuse the request.

Schema:

{
  "summaryTitle": "<short headline, max 10 words>",
  "headline": "<TL;DR sentence, max 25 words, names ≥2 entities + ≥1 number>",
  "projectAlerts": [
    { "projectName": "<name>", "severity": "critical|warning|info", "type": "margin|overtime|timeline|scope|budget", "diagnosis": "<…>", "suggestedAction": "<…>", "ownerName": "<optional>" }
  ],
  "peopleAlerts": [
    { "target": "<person or role>", "severity": "critical|warning|info", "type": "overloaded|idle|singleton|skill-gap|overtime-trend", "diagnosis": "<…>", "suggestedAction": "<…>" }
  ],
  "pipelineAlerts": [
    { "dealName": "<deal name or cliff label>", "severity": "critical|warning|info", "type": "slipping|cliff|value-mismatch|stalled|opportunity", "diagnosis": "<…>", "suggestedAction": "<…>" }
  ],
  "utilizationDrop": <integer 0-50>,
  "delayedDeals": <integer multiple of 25000>,
  "newHires": <integer 0-10>
}`;
}

function buildUserPrompt(input: AIForecastInput, outputLocale: ForecastOutputLocale): string {
    const outputLanguage = OUTPUT_LANGUAGE_BY_LOCALE[outputLocale];

    const projectsBlock = input.projects.length === 0
        ? '  (no active projects)'
        : input.projects.map((p) =>
            `  - "${p.name}" (${p.client}, owner ${p.ownerName}, team ${p.teamSize})\n`
            + `      status=${p.status}, budget=${p.budget.toFixed(0)} ${input.currency}, lifetimeMargin=${p.marginLifetimePercent.toFixed(1)}%,\n`
            + `      hours: ${p.consumedHours.toFixed(0)}/${p.budgetHours.toFixed(0)} (OT ${p.otHoursLogged.toFixed(0)}), labourToDate=${p.labourCostToDate.toFixed(0)},\n`
            + `      revenueRecognized=${p.revenueRecognized.toFixed(0)}, cashCollected=${p.cashCollected.toFixed(0)}`
        ).join('\n');

    const pipelineBlock = input.pipelineDeals.length === 0
        ? '  (no open pipeline deals)'
        : input.pipelineDeals.map((d) =>
            `  - "${d.name}" (${d.client}, rank ${d.rank} ${d.stage}, owner ${d.ownerName})\n`
            + `      value=${d.value.toFixed(0)} ${input.currency}, win%=${d.winProbability}, daysInStage=${d.daysInStage}, daysPastExpectedClose=${d.daysPastExpectedClose}`
        ).join('\n');

    const capacityBlock = input.capacityHotspots.length === 0
        ? '  (no capacity hotspots detected)'
        : input.capacityHotspots.map((c) =>
            `  - ${c.role}: util=${c.utilizationPercent.toFixed(0)}% (booked ${c.bookedHoursThisMonth.toFixed(0)}h/${c.workableHoursThisMonth.toFixed(0)}h)`
            + (c.soleEmployeeName ? `, sole=${c.soleEmployeeName}` : '')
            + (c.bench.length > 0 ? `, bench=[${c.bench.join(', ')}]` : '')
            + `, ot90d=${c.otHoursLast90Days.toFixed(0)}h`
        ).join('\n');

    return `Agency snapshot as of ${input.currentMonth} (currency: ${input.currency}):

Scope:
  Output language: ${outputLanguage}
  Forecast window: ${input.forecastWindowLabel} (${input.forecastMonthCount} month(s), current → ${input.comparisonMonthLabel})
  Rank filter: ${input.rankScopeLabel}
  Forecast profit through ${input.comparisonMonthLabel}: ${input.forecastProfit.toFixed(0)}
  Gap to ${input.comparisonMonthLabel} target: ${input.gapToComparisonTarget.toFixed(0)}
  Annual target: ${input.annualInitialBudget.toFixed(0)}
  Remaining to annual: ${input.remainingToAnnualTarget.toFixed(0)}
  Months remaining: ${input.monthsRemainingInYear}
  Regenerate attempt: ${input.regenerateCount ?? 0}
  Rank counts: S=${input.sourceCounts.s}, A=${input.sourceCounts.a}, B=${input.sourceCounts.b}

Headcount: ${input.headcount} active employees
Average monthly salary: ${input.avgMonthlySalary.toFixed(0)}
Trailing 3mo revenue: ${input.trailingMonthlyRevenue.toFixed(0)}
Trailing 3mo operating profit: ${input.trailingMonthlyProfit.toFixed(0)}

Utilization (company-wide): actual ${input.utilization.actualPercent.toFixed(1)}% vs target ${input.utilization.targetPercent.toFixed(1)}%

Pipeline aggregate: total weighted ${input.pipeline.totalWeightedValue.toFixed(0)}, slipping ${input.pipeline.slippingValue.toFixed(0)} (${input.pipeline.slippingCount}/${input.pipeline.totalCount})
Invoices: overdue ${input.invoices.overdueValue.toFixed(0)} (${input.invoices.overdueCount}); historical mean lateness ${input.invoices.meanLateDays.toFixed(1)} days

Active projects (the heart of the diagnostic):
${projectsBlock}

Open pipeline deals:
${pipelineBlock}

Capacity hotspots by role (this month):
${capacityBlock}

Monthly forecast through ${input.comparisonMonthLabel}:
${input.monthlyForecast.map((row) => `  - ${row.monthLabel}: income ${row.income.toFixed(0)}, cost ${row.cost.toFixed(0)}, profit ${row.profit.toFixed(0)}`).join('\n')}

Previous summary to avoid repeating:
${input.previousSummary
    ? `  Headline: ${input.previousSummary.headline ?? input.previousSummary.summaryTitle ?? 'n/a'}
  Previously flagged: ${(input.previousSummary.priorAlertTargets ?? []).join(', ') || 'n/a'}`
    : '  None'}

Produce the 3 numbers + headline + 3 alert arrays per the schema. Name specific projects, deals, people, or roles in every alert. Cite a real number in every diagnosis. The reader is a Sales executive or HR lead — they want concrete callouts, not generic advice.`;
}

// ── Validation / fallback ───────────────────────────────────────────────────

const VALID_PROJECT_TYPES: ForecastProjectAlert['type'][] = ['margin', 'overtime', 'timeline', 'scope', 'budget'];
const VALID_PEOPLE_TYPES: ForecastPeopleAlert['type'][]   = ['overloaded', 'idle', 'singleton', 'skill-gap', 'overtime-trend'];
const VALID_PIPELINE_TYPES: ForecastPipelineAlert['type'][] = ['slipping', 'cliff', 'value-mismatch', 'stalled', 'opportunity'];
const VALID_SEVERITIES: AlertSeverity[] = ['critical', 'warning', 'info'];

function asSeverity(v: unknown): AlertSeverity {
    return VALID_SEVERITIES.includes(v as AlertSeverity) ? (v as AlertSeverity) : 'info';
}

function clampResult(raw: AIForecastResult, pipelineTotal: number, outputLocale: ForecastOutputLocale): AIForecastResult {
    const fallback = FALLBACK_COPY_BY_LOCALE[outputLocale];

    const sanitizeProjectAlert = (a: ForecastProjectAlert): ForecastProjectAlert | null => {
        if (!a?.projectName || !a?.diagnosis) return null;
        return {
            projectName: a.projectName,
            severity: asSeverity(a.severity),
            type: VALID_PROJECT_TYPES.includes(a.type) ? a.type : 'margin',
            diagnosis: a.diagnosis,
            suggestedAction: a.suggestedAction ?? '',
            ownerName: a.ownerName,
        };
    };
    const sanitizePeopleAlert = (a: ForecastPeopleAlert): ForecastPeopleAlert | null => {
        if (!a?.target || !a?.diagnosis) return null;
        return {
            target: a.target,
            severity: asSeverity(a.severity),
            type: VALID_PEOPLE_TYPES.includes(a.type) ? a.type : 'overloaded',
            diagnosis: a.diagnosis,
            suggestedAction: a.suggestedAction ?? '',
        };
    };
    const sanitizePipelineAlert = (a: ForecastPipelineAlert): ForecastPipelineAlert | null => {
        if (!a?.dealName || !a?.diagnosis) return null;
        return {
            dealName: a.dealName,
            severity: asSeverity(a.severity),
            type: VALID_PIPELINE_TYPES.includes(a.type) ? a.type : 'stalled',
            diagnosis: a.diagnosis,
            suggestedAction: a.suggestedAction ?? '',
        };
    };

    return {
        summaryTitle: raw.summaryTitle?.trim() || fallback.summaryTitle,
        headline: raw.headline?.trim() || fallback.headline,
        projectAlerts: Array.isArray(raw.projectAlerts)
            ? raw.projectAlerts.map(sanitizeProjectAlert).filter((a): a is ForecastProjectAlert => !!a).slice(0, 4)
            : [],
        peopleAlerts: Array.isArray(raw.peopleAlerts)
            ? raw.peopleAlerts.map(sanitizePeopleAlert).filter((a): a is ForecastPeopleAlert => !!a).slice(0, 4)
            : [],
        pipelineAlerts: Array.isArray(raw.pipelineAlerts)
            ? raw.pipelineAlerts.map(sanitizePipelineAlert).filter((a): a is ForecastPipelineAlert => !!a).slice(0, 4)
            : [],
        utilizationDrop: Math.max(0, Math.min(50, Math.round(raw.utilizationDrop ?? 0))),
        delayedDeals: Math.max(
            0,
            Math.min(
                Math.ceil(pipelineTotal / 25000) * 25000,
                Math.round((raw.delayedDeals ?? 0) / 25000) * 25000,
            ),
        ),
        newHires: Math.max(0, Math.min(10, Math.round(raw.newHires ?? 0))),
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
    const outputLocale = normalizeOutputLocale(input.outputLocale);

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
            max_tokens:  4096,
            temperature: input.regenerateCount && input.regenerateCount > 0 ? 0.7 : 0.4,
            system:      buildSystemPrompt(outputLocale),
            messages: [
                { role: 'user', content: buildUserPrompt(input, outputLocale) },
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

        // Strip common wrappers Claude sometimes adds even when told not to:
        // markdown fences and leading prose like "Here is the JSON: { ... }".
        let candidate = rawText;
        const fenceMatch = candidate.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
        if (fenceMatch) candidate = fenceMatch[1];
        let clean = extractFirstJsonObject(candidate);
        if (!clean) clean = extractFirstJsonObject('{' + candidate);
        clean = clean ?? candidate;

        let result: AIForecastResult;
        try {
            result = JSON.parse(clean) as AIForecastResult;
        } catch {
            const preview = rawText.length > 400 ? rawText.slice(0, 400) + '…' : rawText;
            console.error('[AI Forecast] non-JSON response from Claude:\n' + preview);
            return NextResponse.json({ error: 'AI returned malformed JSON.' }, { status: 502 });
        }

        return NextResponse.json(clampResult(result, input.pipeline.totalWeightedValue, outputLocale));
    } catch (err) {
        console.error('[AI Forecast] error:', err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : 'AI forecast failed.' },
            { status: 500 },
        );
    }
}
