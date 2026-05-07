# anka-frontend — CRM Module Spec

## Pages

| Page | File | Purpose |
|---|---|---|
| Pipeline (Kanban) | `app/(dashboard)/crm/page.tsx` | Drag-drop deal board |
| Deal Detail | `app/(dashboard)/crm/[id]/page.tsx` | Read-only detail view |
| New Deal | `app/(dashboard)/crm/new/page.tsx` | Create deal form |
| Edit Deal | `app/(dashboard)/crm/edit/[id]/page.tsx` | Full edit form with staffing |
| AI Staffing | `app/(dashboard)/crm/[id]/staffing/page.tsx` | AI-powered team composition |

---

## CRM Pipeline (`/crm`)

**Component:** `components/crm/KanbanBoard.tsx`

- Columns by status: `lead`, `inquiry`, `opportunity`, `proposal`, `contract`, `won`, `lost`
- Drag-drop via `@hello-pangea/dnd` → calls `updateDealStage()` on drop
- Summary metrics per column (count, total estimated value)
- Click on card → `/crm/[id]`
- "New Deal" button → `/crm/new`

---

## Deal Detail (`/crm/[id]`)

**File:** `app/(dashboard)/crm/[id]/page.tsx`

### Data fetched
- `useDealDetail(dealId)` → deal with all relations
- `useContractList()` → all contracts (for linked record lookup)
- `useProjectList()` → all projects (for linked record lookup)

### Linked record matching
- Contract: `contracts.find(c => c.dealId === deal.id)` ✅ FK-based
- Project: `projects.find(p => p.contractId === linkedContract.id)` ✅ FK-based

### Sections displayed
| Section | Fields |
|---|---|
| Header | Name, client, status badge |
| Workflow bar | Deal status → Contract (number + status) → Project (number + status) |
| KPI cards | Client Budget, Est. Total Cost, Gross Profit (with margin %), Win Probability |
| Deal Overview | Name, client, contact (name + email), timeline, workload |
| Ghost Roles & Staffing | Role type, quantity, months, salary range, subtotal; Total Labor Cost |
| Linked Records | Clickable cards → /contracts and /projects |
| Financial Summary (sidebar) | Budget, Labor Cost, Overhead, Risk Buffer, Total Cost, Gross Profit |

### Action buttons
| Button | Visible When | Action |
|---|---|---|
| Win Deal | status ≠ won AND ≠ lost | Opens dialog → `winDeal.mutateAsync()` |
| Estimation | Always | `router.push('/estimation?dealId=' + id)` |
| Edit Deal | Always | `router.push('/crm/edit/' + id)` |
| AI Staffing | Always | `router.push('/crm/' + id + '/staffing')` |
| Delete | Always | Confirmation dialog → `deleteDeal.mutateAsync()` |

### Win Deal Dialog
- Optional `win_reason` text input (max 500)
- Confirm → calls `winDeal.mutateAsync({ dealId, winReason })`
- Cannot be undone — calls `win_deal()` SP → creates Contract + Project

---

## New Deal Form (`/crm/new`)

**File:** `app/(dashboard)/crm/new/page.tsx`

### Form library
React Hook Form + Zod (`dealSchema` from `lib/schemas/deal.schema.ts`)

### Form tabs
1. **Deal Info** — basic fields
2. **Team & Estimation** — ghost roles + hard assignments

### Fields — Deal Info tab
| Field | Type | Required | Notes |
|---|---|---|---|
| Deal Name | text | ✅ | max 255 |
| Client / Company | text | ✅ | max 255 |
| Contact Name | text | ✅ | max 255 |
| Contact Email | email | ✅ | |
| Contact Phone | text | ✅ | max 50 |
| Expected Close Date | date | No | |
| Lead Source | select | No | inbound, referral, cold_outreach, social, event, partner, other |
| Client Budget | number | ✅ (min 0) | |
| Timeline (months) | number | ✅ (min 1) | |
| Workload (hours) | number | No | |
| Win Probability | number | No | 0–100 |
| Scope Description | textarea | No | max 5000 |

### Fields — Ghost Roles tab
| Field | Type | Notes |
|---|---|---|
| Role Type | select | frontend, backend, pm, qa, design |
| Quantity | number | min 1 |
| Months | number | min 1 |
| Min Monthly Salary | number | min 0 |
| Max Monthly Salary | number | min 0, must be ≥ min |
| + Add Role | button | appends to `ghost_roles` array |
| Trash icon | per row | removes ghost role |

### Hard Assignments (per ghost role)
| Field | Type | Notes |
|---|---|---|
| Employee | select | from businessStore.employees |
| Allocated Hours | number | |
| + Add | button | appends to hard_assignments |

### AI Team Builder
- "Upload workload doc" → extracts text → sent to Gemini → returns ghost role suggestions
- User can Accept or Reject suggestions
- Accepted suggestions replace current ghost roles

### Calculated fields (live preview)
- Base Labor Cost, Overhead Cost, Risk Buffer, Total Est. Cost, Est. Gross Profit
- Calculated using `lib/calculations.ts` functions + `companySettings` percentages

### API call on submit
`createDeal.mutateAsync(dealPayload)` → `POST /api/deals`
On success → `router.push('/crm')`

---

## Edit Deal Form (`/crm/edit/[id]`)

**File:** `app/(dashboard)/crm/edit/[id]/page.tsx`

Same structure as New Deal form but:
- Loads existing deal via `useDealDetail(dealId)`
- Pre-populates all form fields
- Submits via `updateDeal.mutateAsync()` → `PUT /api/deals/{id}`
- Hard assignments loaded from deal and managed via local state
- AI Team Builder available

---

## API Calls (CRM module)

All hooks in `lib/queries/deals.ts`:

| Hook / Action | HTTP | Endpoint |
|---|---|---|
| `useDealList(params)` | GET | `/api/deals` |
| `useDealDetail(id)` | GET | `/api/deals/{id}` |
| `createDeal.mutate()` | POST | `/api/deals` |
| `updateDeal.mutate()` | PUT | `/api/deals/{id}` |
| `deleteDeal.mutate()` | DELETE | `/api/deals/{id}` |
| `updateDealStage.mutate()` | PATCH | `/api/deals/{id}/stage` |
| `winDeal.mutate()` | POST | `/api/deals/{id}/win` |
| `loseDeal.mutate()` | POST | `/api/deals/{id}/lose` |

---

## Deal Won → Create Estimation Flow

| Check | Status |
|---|---|
| "Win Deal" button on deal detail page | ✅ EXISTS — visible when status ≠ won/lost |
| Win reason input | ✅ EXISTS — optional in dialog |
| win_deal() creates Contract + Project | ✅ EXISTS — handled by SP |
| Contract linked via dealId | ✅ EXISTS — FK-based lookup |
| Project linked via contractId | ✅ EXISTS — chained FK lookup |
| "Estimation" button → pre-seeds estimation page | ✅ EXISTS — links to `/estimation?dealId=id` |
| Separate Estimation approval step | ⚠️ NOT IMPLEMENTED |
| "Create Estimation" button (separate entity) | ⚠️ NOT IMPLEMENTED |

---

## Role-Based UI

RBAC via `PermissionGuard` and `usePermission`. No specific CRM visibility guards identified in the component code — all CRM pages are accessible to any authenticated member. Role checks noted in `lib/rbac.ts`:

- `Sales`: has `manage_crm`, `manage_estimation`
- `Executive`: has `view_crm`
- `Admin`: all
- `Delivery`, `HR`: no CRM permissions defined
