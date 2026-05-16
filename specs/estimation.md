# anka-frontend — Estimation Module Spec

## Pages

| Page | File | Purpose |
|---|---|---|
| Estimation Engine | `app/(dashboard)/estimation/page.tsx` | Deal cost/margin simulator |

---

## Architecture Note

⚠️ The Estimation module has **no separate backend entity**. It is a calculator/view of Deal data stored in `estimation_resources`, `deal_ghost_roles`, and `deal_overheads` tables. All saves go back to the Deal record via `PUT /api/deals/{id}`.

---

## Estimation Page (`/estimation`)

**File:** `app/(dashboard)/estimation/page.tsx`
**Component:** `components/estimation/EstimationSimulator.tsx`

### URL Param Support
- `?dealId=<uuid>` → pre-selects and loads that deal into the simulator
- The Deal detail page uses this to link directly: `/estimation?dealId=<id>`

### Data fetched
- Reads deals from `businessStore.deals` (no direct API call — Zustand data)
- Reads roles from `businessStore.roles` (for role dropdown)
- Saves back via `businessStore.updateDeal()` → `PUT /api/deals/{id}`

### Deal Selector
- Dropdown of all deals from Zustand store
- On select: loads `estimationResources`, `projectOverheads`, `targetMargin` from selected deal
- "View Deal" link → `/crm/[selectedDealId]`

### Sections

#### Scope & Labor table
| Column | Notes |
|---|---|
| Feature | text input |
| Role | select from roles list |
| Rate/hr (Cost) | calculated: `role.rate × 0.5` |
| Hours | number input |
| Cost | calculated: `rate × hours` |
| Remove | trash icon per row |

**Add row inputs:** Feature name, Role select, Hours number → "Add Resource" button

#### Overhead table
| Column | Notes |
|---|---|
| Name | text |
| Cost ($) | number |
| Remove | trash icon per row |

**Add row inputs:** Name, Cost → "Add Overhead" button

#### Summary cards (live calculation)
| Card | Formula |
|---|---|
| Total Labor Cost | sum of (role.rate × 0.5 × hours) per resource |
| Total Overhead | sum of overhead costs |
| Total Cost | Labor + Overhead |
| Target Margin | slider 0–100% |
| Suggested Price | Total Cost / (1 - margin%) |
| Expected Profit | Suggested Price - Total Cost |

### Form Fields Summary
| Field | Type | Notes |
|---|---|---|
| Target Deal | select | Loads deal into simulator |
| Version | select | v1.0 Draft, v1.1 Revised, v2.0 Final (UI only, not persisted) |
| Feature Name | text | Per resource row |
| Role | select | From businessStore.roles |
| Hours | number | Per resource row |
| Overhead Name | text | Per overhead row |
| Overhead Cost | number | Per overhead row |
| Target Margin | slider | 0–100% |

### Action Buttons
| Button | Action |
|---|---|
| Add Resource | Appends resource to local state |
| Remove Resource | Removes from local state |
| Add Overhead | Appends overhead to local state |
| Remove Overhead | Removes from local state |
| Save | `businessStore.updateDeal()` with full resource + overhead arrays |
| View Deal | `router.push('/crm/' + selectedDealId)` |

---

## API Calls

| Action | HTTP | Endpoint |
|---|---|---|
| Save estimation | PUT | `/api/deals/{id}` with `estimation_resources` and `deal_overheads` arrays |

No dedicated estimation endpoints exist.

---

## Pre-fill from Deal

| Data | Status | How |
|---|---|---|
| Estimation resources | ✅ EXISTS | Loaded from `deal.estimationResources` on deal select |
| Project overheads | ✅ EXISTS | Loaded from `deal.projectOverheads` on deal select |
| Target margin | ✅ EXISTS | Loaded from `deal.targetMargin` on deal select |
| Client name / budget | ⚠️ DISPLAY ONLY | Deal selector shows deal name; client not shown in calculator |
| Contact info | ⚠️ NOT DISPLAYED | Not surfaced in estimation view |

---

## Estimation → Create Contract Flow

| Check | Status |
|---|---|
| Save estimation to deal | ✅ EXISTS |
| Estimation status (approved/rejected) | ⚠️ NOT IMPLEMENTED |
| "Create Contract" button from estimation | ⚠️ NOT IMPLEMENTED |
| Separate estimation approval workflow | ⚠️ NOT IMPLEMENTED |

The path from estimation to contract is: **Win the Deal** (from the Deal detail page) which triggers `win_deal()` and auto-creates the Contract. There is no separate estimation approval step.

---

## Version History

⚠️ The "Version" dropdown (v1.0 Draft, v1.1 Revised, v2.0 Final) is **UI-only** — it does not persist or load different versions of an estimation. Selecting a version has no effect on saved data.

---

## AI Generation (chg-010)

A single **"Generate with AI"** button on the Estimation Simulator calls the backend Claude endpoint (anka-api chg-007) and drops a structured per-sheet draft into the simulator's existing editable state. The user reviews/edits and clicks **Save** to persist as a new `EstimationVersion` (which then triggers chg-006 XLSX generation).

### Button
- **Location:** header row of `components/estimation/EstimationSimulator.tsx`, beside the Save button.
- **Icon:** lucide `Sparkles`.
- **Visibility:** rendered only when a deal is selected.
- **Disabled when:**
  - `isGenerating === true` (request in flight), OR
  - the selected deal has neither `workloadDescription` nor any uploaded `dealContractDocuments` rows.
- **Permission gate:** wrapped in `<PermissionGuard permission="manage_crm">` (disabled+tooltip pattern, matching project convention).

### Hook
**`lib/queries/estimationVersions.ts → useGenerateAIEstimationDraft()`**

Returns `{ generate, isGenerating, lastDraft, error }`:
- `generate(dealId)` → POST `/api/deals/{dealId}/estimation-versions/ai-draft`
- Response is mapped via `lib/dealsMapper.ts::toAIEstimationDraft` (snake_case → camelCase).
- Success: stores `lastDraft`. **Does not invalidate any TanStack Query** — nothing was persisted server-side.
- 422 → toast: "Deal needs a workload description or attached contract document before AI can generate an estimation."
- 503 → toast: "AI service unavailable, please try again later."
- 45s `AbortController` timeout → toast: "Timed out — please try again."

### AIEstimationDraft type (in `types/business.ts`)
Mirrors the backend output JSON: `sheet1Summary`, `sheet2Features[]`, `sheet3Manhours[]`, `sheet4Milestone`, `sheet5TeamStack[]`, `reasoning`, `confidence`.

### Preview flow
On AI response:
1. Map `sheet2Features` ⨝ `sheet3Manhours` (join by `functionId`) → `estimationResources[]` in local state. Each becomes an editable row in the Scope & Labor table.
2. `sheet1Summary` informs the labor cost summary cards; user can adjust via the existing margin slider.
3. `sheet5TeamStack` → `ghostRoles[]` in local state (uses tenant role names; mismatched names fall through as-is and are fuzzy-matched at XLSX-gen time per chg-007 risk note).
4. `<AIDraftReviewPanel>` (new component) renders above the scope table with a confidence chip and the AI's reasoning. Includes a **"Discard AI draft"** button that resets local state to whatever was loaded from the deal originally.
5. Save (existing button) still calls the normal version-create mutation — no AI-specific save path.

### Existing AI features remain
- `/crm/[id]/staffing` (Gemini AI Team Builder) is **untouched** by this change. It remains a separate, finer-grained team-staffing flow.

### Latency UX
- Animated `Sparkles` icon while pending.
- At 10s: toast "AI is thinking… estimations with rich context can take up to 30 seconds."
- At 45s: abort + retry toast.

### Pre-fill from Deal — updated table

| Data | Status | How |
|---|---|---|
| Estimation resources | ✅ EXISTS | Loaded from `deal.estimationResources` on deal select |
| Project overheads | ✅ EXISTS | Loaded from `deal.projectOverheads` on deal select |
| Target margin | ✅ EXISTS | Loaded from `deal.targetMargin` on deal select |
| Client name / budget | ⚠️ DISPLAY ONLY | Deal selector shows deal name; client not shown in calculator |
| Contact info | ⚠️ NOT DISPLAYED | Not surfaced in estimation view |
| **AI-generated draft** | ✅ chg-010 | Loaded into editable state on Generate-with-AI click; not persisted until Save |
