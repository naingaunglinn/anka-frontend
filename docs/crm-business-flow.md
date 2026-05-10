# CRM & Pipeline — Business Flow, Formulas & Calculations

## 1. Deal Lifecycle

### Pipeline Stages

```
lead → qualified → proposal → negotiation → won → lost
```

| Stage | Meaning |
|---|---|
| `lead` | First contact, not yet qualified |
| `qualified` | Confirmed budget & timeline exist |
| `proposal` | Proposal sent to client |
| `negotiation` | Terms being discussed |
| `won` | Deal closed — triggers contract creation |
| `lost` | Deal closed lost |

Deals move between stages via Kanban drag-and-drop (`KanbanBoard.tsx`). The "Won" and "Lost" columns are special — dropping a deal there opens a win/loss reason modal.

### Wizard Steps (Deal Edit Flow)

The `wizardStep` field tracks where the user is in the 3-tab edit form:

```
context → estimation → staffing
```

On the edit form, the active tab is determined by: URL `?tab=` param → saved `wizardStep` → default `context`.

---

## 2. Deal Data Model

### Core Fields

| Field | Type | Description |
|---|---|---|
| `name` | string | Deal / project name |
| `client` | string | Client company name |
| `clientBudget` | number | Client's stated budget (tenant currency) |
| `timelineMonths` | number | Project duration in months |
| `workloadHours` | number | Auto-computed total hours from ghost roles |
| `winProbability` | number | 0–100 % likelihood of winning |
| `status` | enum | Pipeline stage |
| `leadSource` | enum | How the deal was sourced |

### Ghost Roles

Ghost roles represent the **planned team shape** before real employees are assigned. They feed the Cost Estimate sidebar and the Auto-Staff function.

| Field | Type | Description |
|---|---|---|
| `roleType` | enum | `frontend` / `backend` / `pm` / `qa` / `design` |
| `quantity` | number | Number of people needed in this role |
| `months` | number | **Allocation percentage (1–100)** — named `months` for legacy reasons; represents what fraction of each person's monthly capacity is needed |
| `minMonthlySalary` | number | Salary range lower bound |
| `maxMonthlySalary` | number | Salary range upper bound |

> **⚠️ Naming note:** The `months` field stores an allocation **percentage** (e.g. `100` = full-time, `50` = half-time), not a month count. This name is misleading and affects all workload/cost formulas below.

### Hard Assignments

Hard assignments are **confirmed employee bookings** on a deal.

| Field | Type | Description |
|---|---|---|
| `employeeId` | string | Reference to an org employee |
| `allocatedHours` | number | Total hours this employee contributes to the deal |

---

## 3. Cost Estimate — Ghost Role Model

Used in: `/crm/new` (Sales Context stage) and `/crm/edit/[id]` (Cost Estimate tab).

This is a **quick, pre-win estimate** based on planned team shape × salary ranges.

### Workload Hours (auto-computed)

```
workloadHours = Σ (quantity × 160 × timelineMonths × (allocationPct / 100))
```

Where `allocationPct` = `ghostRole.months` (the allocation percentage field).

**Example:** 2 frontend devs at 100% for 3 months = `2 × 160 × 3 × 1.0 = 960 hours`

### Base Labor Cost

```
avgSalary     = (minMonthlySalary + maxMonthlySalary) / 2
baseLaborCost = Σ (quantity × (allocationPct / 100) × avgSalary × timelineMonths)
```

Wait — the current form computes it **per timeline month** using average salary:

```
baseLaborCost = Σ (quantity × (months/100) × avgSalary)
```

Note: This does NOT multiply by `timelineMonths` — it gives the monthly labor cost. The final cost saves the total including overhead/buffer.

### Overhead Cost

```
overheadCost = baseLaborCost × (overheadPercentage / 100)
```

`overheadPercentage` comes from company settings.

### Risk Buffer

```
bufferCost = (baseLaborCost + overheadCost) × (bufferPercentage / 100)
```

`bufferPercentage` comes from company settings. Buffer applies to **labor + overhead** combined.

### Total Estimated Cost

```
totalEstimatedCost = baseLaborCost + overheadCost + bufferCost
```

### Gross Profit & Margin

```
estimatedGrossProfit = clientBudget - totalEstimatedCost
profitMarginPct      = (estimatedGrossProfit / clientBudget) × 100
```

### Margin colour thresholds

| Range | Colour |
|---|---|
| < 0 % | Red |
| 0 – 10 % | Yellow |
| ≥ 10 % | Green |

---

## 4. Cost Estimate — EstimationSimulator (Post-Win)

Used in: `/estimation?dealId=...` (standalone page, accessible from deal detail).

This is a **detailed, post-win estimate** based on explicit feature line items × role cost rates.

```
lineItemCost  = hours × costPerHour    (costPerHour = employee role rate from org settings)
baseLaborCost = Σ lineItemCost
overheadCost  = baseLaborCost × (overheadPercentage / 100)
bufferCost    = (baseLaborCost + overheadCost) × (bufferPercentage / 100)
totalCost     = baseLaborCost + overheadCost + bufferCost
```

EstimationSimulator supports versioning (save, compare, restore snapshots).

### Key difference from ghost role model

| Dimension | Ghost Role Estimate | EstimationSimulator |
|---|---|---|
| Stage | Pre-win (Sales) | Post-win (Delivery) |
| Input | Role type + quantity + salary range | Feature + role + hours + rate |
| Precision | ±30 % range (salary midpoint) | Exact (real role rates) |
| Versions | No | Yes |
| Writes cost fields | Yes (on save) | Yes (on save) |

---

## 5. Salary Range Suggestions

When adding ghost roles, the system suggests salary ranges from actual org employee data.

```
actual_min  = min(monthlySalary) of active employees with matching capacityRole
actual_max  = max(monthlySalary) of active employees with matching capacityRole
midpoint    = (actual_min + actual_max) / 2
spread      = midpoint × 0.30        ← ±30 % of midpoint

suggested_min = max(0, round(midpoint - spread))
suggested_max = round(midpoint + spread)
```

If no active employees match the role, returns `{ min: 0, max: 0 }`.

---

## 6. Soft-Booked Hours (Capacity Planning)

Used in the capacity pool to show how many hours are at risk on open deals.

```
softBookedHours = workloadHours × (winProbability / 100)
```

Only applies to deals in `lead`, `qualified`, `proposal`, `negotiation` stages (open pipeline).

---

## 7. Staffing Flow

### Step 1: Ghost Roles (Cost Estimate tab)

User defines the intended team shape. Manual entry or AI Team Builder.

### Step 2: Auto-Staff (Staffing tab — edit form)

Automatically assigns real employees to ghost roles.

**Sorting priority:**
1. Skill match score — employees covering more required skills ranked first
2. Available monthly capacity — after subtracting load from other open deals
3. Seniority — senior-titled employees (Lead / Senior / Head / Principal / Manager) ranked first
4. Salary proximity — closest to ghost role salary midpoint

**Hours calculation:**
```
requestedMonthlyHours = employee.workableHours × (ghostRole.months / 100)
otherDealMonthlyLoad  = Σ (otherDeal.hardAssignments.allocatedHours / otherDeal.timelineMonths)
availableMonthly      = workableHours - otherDealMonthlyLoad
allocatedMonthly      = min(requestedMonthlyHours, availableMonthly)
allocatedHours        = round(allocatedMonthly × timelineMonths)
```

If `allocatedMonthly < requestedMonthlyHours`, a warning is shown (employee is partially booked elsewhere).

### Step 3: Hard Booking (`/crm/[id]/staffing` page)

Full-featured staffing tool. Checks cross-deal capacity in real time.

**Capacity conflict detection:**
```
otherMonthly     = Σ (otherDeal.allocatedHours / otherDeal.timelineMonths)   for all open deals
thisDealMonthly  = allocatedHours / timelineMonths
totalMonthly     = otherMonthly + thisDealMonthly

isOverallocated  = totalMonthly > employee.workableHours
```

Save is blocked if any employee is over-allocated.

---

## 8. AI Team Builder

### Input sent to Claude

| Field | Source |
|---|---|
| Budget, timeline, workload hours | Deal form |
| Project description | Deal `workloadDescription` + uploaded brief |
| Required skills | Whole-word matched from description against org skills catalog |
| Complexity band + score | Deterministic formula (see below) |
| Employee pool | Active employees — id, name, role, title, skills, salary, cost/hr |
| Available monthly hours | `workableHours - load from other open deals` |
| Ghost roles (soft constraint) | Pre-defined Cost Estimate roles |
| Previous AI result | Passed on regeneration for a different suggestion |
| Overhead + buffer percentages | Company settings |

### Complexity scoring

```
burnRate       = (workloadHours / timelineMonths) / 100
skillBreadth   = requiredSkills.length × 0.5
hardKeyword    = 2  if description contains hard-tech terms (compliance, real-time, ML, payments…)
               = 0  otherwise
mediumKeyword  = 1  if description contains medium-tech terms (dashboard, API, migration…)
               = 0  otherwise
domainDepth    = (hardMatchCount - 1) × 0.5  if 2+ hard keywords co-occur (max 1.0)
               = 0  if fewer than 2 hard keywords
ghostVariety   = distinct ghost roleTypes × 0.3

rawScore = burnRate + skillBreadth + hardKeyword + mediumKeyword + domainDepth + ghostVariety
score    = clamp(round(rawScore, 1dp), 0, 10)
```

**Band → default team size:**

| Band | Score | Target size |
|---|---|---|
| easy | ≤ 2.5 | 2 people |
| medium | 2.6 – 5.5 | 3–4 people |
| hard | > 5.5 | 5–7 people |

### AI cost formula (used by Claude + fallbacks)

```
baseLaborCost      = Σ (allocatedHours × costPerHour)
overheadCost       = baseLaborCost × (overheadPercentage / 100)
bufferCost         = (baseLaborCost + overheadCost) × (bufferPercentage / 100)
totalEstimatedCost = baseLaborCost + overheadCost + bufferCost
estimatedGrossProfit = clientBudget - totalEstimatedCost
profitMarginPct    = (estimatedGrossProfit / clientBudget) × 100
```

### Skill enforcement (post-processing)

After Claude returns a result, `enforceSkillCoverage` checks every required skill. If a carrier exists in the pool but Claude omitted them, they are force-added with a small allocation (8–40 h), provided doing so keeps `totalEstimatedCost ≤ clientBudget`.

---

## 9. Confirmed Bugs (Fixed in this branch)

| # | Bug | Severity | Fix |
|---|---|---|---|
| 1 | Buffer formula split — `lib/calculations.ts` applied buffer to labor only; AI Team Builder applied it to labor + overhead. Same deal showed different costs depending on which path calculated it. | Critical | `calculateRiskBuffer` now takes `overheadCost` as a parameter: `buffer = (labor + overhead) × pct` everywhere |
| 2 | Wrong ghost role fallback in edit form: `months: 1` (1% allocation) instead of `months: 100` (100% allocation). Produced near-zero workload hours when deal had no existing ghost roles. | High | Changed to `months: 100` |
| 3 | Ghost role `id` missing from API payload in `dealToApiPayload`. On edit, backend couldn't match existing ghost roles for upsert — deleted and re-created all rows on every save. | High | `id` now included when present |
| 4 | `salaryRange.ts` JSDoc said ±20% but code used ±30%. | Low | Comment updated to ±30% |
| 5 | Auto-Staff `allocatedHours` bug: `workableHours × months` (e.g. 160 × 100 = 16,000h). Should be `workableHours × (months/100) × timelineMonths`. | Critical | Fixed in `autoStaffing.ts` overhaul |
| 6 | Auto-Staff had no cross-deal capacity awareness — assigned fully-booked employees. | High | Now computes real available hours per employee |
| 7 | Auto-Staff hardcoded `$` currency in warnings. | Low | Now uses tenant currency symbol |

---

## 10. Field Naming Gotcha

The `months` field on `GhostRole` stores an **allocation percentage (1–100)**, not a month count. This is a legacy naming issue. When reading this field, always divide by 100:

```ts
const allocationFraction = ghostRole.months / 100   // e.g. 100 → 1.0, 50 → 0.5
```

The schema enforces `min(1).max(100)` but the type definition has no such constraint, so the name will continue to cause confusion for new developers until it is renamed to `allocationPercentage`.
