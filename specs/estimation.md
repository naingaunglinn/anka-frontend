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
