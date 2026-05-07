# anka-frontend — AI Module Spec

## Overview

ANKA has one AI feature: the **AI Team Builder**. It uses the Anthropic API (Claude Haiku 4.5) to suggest an optimal team composition for a deal, given the employee pool, project brief, and company financials.

There is no Gemini integration — the CLAUDE.md references were outdated. The production route uses `@anthropic-ai/sdk`.

---

## Architecture

```
User (DealForm) → AITeamBuilder component
    → POST /api/ai-team-builder  (Next.js route handler)
        → Anthropic API (Claude Haiku 4.5)
            → Parse JSON response
            → Fire-and-forget POST /api/ai-usage  (backend logging)
        → Return AITeamBuilderResult to client
```

---

## Model & Pricing

| Setting | Value |
|---|---|
| Model | `claude-haiku-4.5` |
| Max tokens | 2048 |
| Temperature | 0.1 |
| Input cost | $0.80 / 1M tokens |
| Output cost | $4.00 / 1M tokens |
| `ANTHROPIC_API_KEY` | server-side env var only |
| `ANTHROPIC_BASE_URL` | optional override |

---

## Next.js Route Handler

**File:** `app/api/ai-team-builder/route.ts`

`POST /api/ai-team-builder` — server-side only (API key never reaches the browser).

**Request body:** `AITeamBuilderInput`
```typescript
interface AITeamBuilderInput {
    clientBudget: number;
    timelineMonths: number;
    workloadHours: number;
    workloadDescription?: string;
    workloadDocumentText?: string;
    employees: Employee[];
    companySettings: CompanySettings;
    globalOverheads: GlobalOverhead[];
}
```

**Response:** `AITeamBuilderResult`
```typescript
interface AITeamBuilderResult {
    team: Array<{
        employeeId: string;
        name: string;
        role: string;
        allocatedHours: number;
        monthlySalary: number;
        costPerHour: number;
        totalCost: number;
        reasoning: string;
    }>;
    baseLaborCost: number;
    overheadCost: number;
    bufferCost: number;
    totalEstimatedCost: number;
    estimatedGrossProfit: number;
    profitMarginPercent: number;
    isFeasible: boolean;
    feasibilityNote: string;
    aiReasoning: string;
    warnings: string[];
}
```

### Route Logic

1. Validates `ANTHROPIC_API_KEY` exists (returns 500 if missing).
2. Parses request body as `AITeamBuilderInput`.
3. Calls `buildUserPrompt(input)` from `lib/aiTeamBuilder.ts` to construct the prompt.
4. Sends to Claude with `SYSTEM_PROMPT` prepended.
5. Defensively strips markdown fences from the response.
6. Extracts JSON object if response contains surrounding text (finds first `{` to last `}`).
7. Parses JSON → `AITeamBuilderResult`.
8. **Fire-and-forget usage log:** POSTs to `/api/ai-usage` using `__session` cookie + `x-tenant-id` header from the incoming request. Never awaited — errors are silently caught.

---

## Prompt System

**File:** `lib/aiTeamBuilder.ts`

### `SYSTEM_PROMPT`

Instructs Claude to:
- Act as a senior software project staffing consultant.
- Return ONLY valid JSON (no markdown, no prose).
- Assign only employees from the provided pool (by exact ID).
- Include exactly 1 Manager and 1 Tech Lead if available.
- Calculate costs using these formulas:
  - `baseLaborCost = sum(allocatedHours × costPerHour)`
  - `overheadCost = baseLaborCost × overheadPercentage`
  - `bufferCost = (baseLaborCost + overheadCost) × bufferPercentage`
  - `totalEstimatedCost = baseLaborCost + overheadCost + bufferCost`
  - `estimatedGrossProfit = clientBudget − totalEstimatedCost`
  - `isFeasible = totalEstimatedCost <= clientBudget`

### `buildUserPrompt(input: AITeamBuilderInput)`

Constructs the user prompt with:
- Client project brief (budget, timeline, workload, description)
- Optional document text (truncated to 3000 chars)
- Active employees only (filtered to `status === 'Active'`), with their `maxProjectHours = workableHours × timelineMonths`
- Company financial settings (overhead %, buffer %, yearly fixed cost)
- Monthly overhead items

---

## Frontend Components

### `AITeamBuilder`

**File:** `components/crm/AITeamBuilder.tsx`

Entry point — shown in the New Deal and Edit Deal forms.

Features:
- "Upload workload doc" → reads file text → sends to Gemini → ⚠️ (spec says Gemini but actual route uses Anthropic/Claude)
- Collects: `clientBudget`, `timelineMonths`, `workloadHours`, `workloadDescription`, optional `workloadDocumentText`
- Sends `AITeamBuilderInput` payload to `POST /api/ai-team-builder`
- On success: passes `AITeamBuilderResult` to `AITeamBuilderResult` component

### `AITeamBuilderResult`

**File:** `components/crm/AITeamBuilderResult.tsx`

Displays the AI recommendation:
- Team member list with allocation, cost, individual reasoning
- Financial summary: base labor, overhead, buffer, total cost, profit, margin, feasibility
- `aiReasoning` paragraph
- `warnings[]` list (if any)
- **Accept** button: replaces current ghost roles with AI suggestions
- **Reject** button: discards the result

### AI Staffing Page

**File:** `app/(dashboard)/crm/[id]/staffing/page.tsx`

A separate **manual** staffing tool (not AI-powered). Shows the full engineer pool with their capacity, current bookings across other won deals, and an hours input per engineer. Saves hard assignments to the deal via `updateDeal.mutateAsync()`.

This page is separate from `AITeamBuilder` — it is for finalizing hard bookings, not AI suggestions.

---

## Usage Logging (Backend)

### `POST /api/ai-usage` (tenant-scoped)

Logs each AI call per tenant. Called fire-and-forget from the Next.js route handler.

**Body:**
```json
{
    "feature": "ai_team_builder",
    "model": "claude-haiku-4.5-...",
    "input_tokens": 1500,
    "output_tokens": 800,
    "estimated_cost_usd": 0.0044
}
```

**Table:** `ai_usage_logs`

| Field | Notes |
|---|---|
| `id` | UUID |
| `tenant_id` | from `X-Tenant-ID` header |
| `user_id` | from authenticated user |
| `feature` | `ai_team_builder` |
| `model` | exact model string returned by Anthropic |
| `input_tokens` | |
| `output_tokens` | |
| `estimated_cost_usd` | computed by route handler |

### `GET /api/admin/ai-usage` (super admin)

Returns aggregate usage grouped by tenant. Displayed in `AdminAIUsagePanel` on the `/tenant` page.

---

## Environment Variables

| Variable | Scope | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | Server-side only | Anthropic API authentication |
| `ANTHROPIC_BASE_URL` | Server-side, optional | Override Anthropic base URL (e.g., for proxy) |

⚠️ `ANTHROPIC_API_KEY` must NEVER be exposed to the browser. The Next.js route handler acts as a proxy.

---

## Known Gaps

- `workloadDocumentText` is truncated at 3000 characters before sending to the model.
- Accepted AI suggestions replace ghost roles but do NOT trigger a save to the API — the user must still click "Save" on the Deal form.
- The "Upload workload doc" feature extracts raw text from the file client-side — no server-side file processing.
- Errors from the AI call (`status 500`) display a generic retry message — no detail on what went wrong.
