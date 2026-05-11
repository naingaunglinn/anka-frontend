# Estimation Engine — Business Flow, Formulas & Calculations

> Standalone estimation tool at `/estimation`. Distinct from the **Cost Estimate** tab on the deal form
> (`/crm/new`, `/crm/edit/[id]`) which uses the ghost-role × salary-range model. The Estimation Engine
> is the **post-win, detail-line-item model** — feature × role × hours × cost rate.

---

## 1. Purpose & Lifecycle Position

| Phase | Tool | Purpose |
|---|---|---|
| Pre-win (Sales) | Cost Estimate tab on deal form | Quick estimate from team shape + salary ranges |
| Post-win (Delivery) | **Estimation Engine** (`/estimation`) | Precise estimate from feature line items + real role rates |

The Estimation Engine is opened from:
- Sidebar nav: `Estimation`
- Deal detail (`/crm/[id]`): an `Estimation` action button that navigates with `?dealId=...`
- Direct URL with `?dealId=` query param

Without a `dealId`, the page loads in "select a deal" mode — content is faded/disabled until a deal is picked.

---

## 2. Data Model

### Estimation Resource (feature line item)

| Field | Type | Description |
|---|---|---|
| `id` | UUID | Stable identifier |
| `featureName` | string | What is being built (e.g. "User Profile") |
| `roleId` | UUID | FK → `roles.id` (org billing role) |
| `hours` | number | Effort estimate for this feature in this role |

### Project Overhead (project-specific absolute cost)

| Field | Type | Description |
|---|---|---|
| `id` | UUID | Stable identifier |
| `name` | string | e.g. "Security Audit", "Travel" |
| `cost` | number | Absolute amount in tenant currency |

### Estimation Version (snapshot)

| Field | Type | Description |
|---|---|---|
| `versionNumber` | integer | Auto-incremented per deal (v1, v2, …) |
| `targetMargin` | number | Margin % (10–80) snapshot at save time |
| `resources` | EstimationResource[] | Frozen line items |
| `overheads` | ProjectOverhead[] | Frozen project overheads |
| `notes` | string? | Free-form note ("trimmed scope per client call") |
| `createdAt` | timestamp | Snapshot time |

Versions are append-only. Restoring a prior version writes its content back to the deal's live
estimation fields (and — backend-dependent — may or may not create a new vN+1 audit row).

### Deal fields the Engine reads/writes

| Field on `Deal` | Read | Write |
|---|---|---|
| `estimationResources` | yes | yes (via version save) |
| `projectOverheads` | yes | yes (via version save) |
| `targetMargin` | yes | yes (via version save) |
| `clientBudget` | yes | no |
| `timelineMonths` | yes (for ghost-role fallback) | no |
| `ghostRoles` | yes (for pre-fill) | no |
| `baseLaborCost`, `overheadCost`, `bufferCost`, `totalEstimatedCost`, `estimatedGrossProfit` | no | written **server-side** when a version is saved — the frontend now invalidates `['deals']` after save so CRM cards refresh. |

---

## 3. Cost Rate Resolution

For each line item, the per-hour cost is resolved by this fallback chain:

```
1. employees where jobRoleId = res.roleId AND status = 'Active'
     → take median(costPerHour) of valid (>0, finite) values
2. role exists (roles table)
     → role.rate × companySettings.costToBillRatio
3. neither
     → companySettings.fallbackHourlyCost
```

- **Median, not mean** — one outlier (very senior or very junior) doesn't skew the typical rate.
- **Median, not first-match** — deterministic regardless of employee insertion order.
- `costPerHour` is GENERATED on the backend: `monthlySalary / workableHours`.
- `costToBillRatio` is a tenant-tunable assumption (e.g. `0.40` = cost is 40 % of billable rate).
- `fallbackHourlyCost` is the absolute floor when neither employee nor role data is available.

---

## 4. Cost & Pricing Formulas

```
lineItemCost         = res.hours × costRateForRole(res.roleId)
laborCost            = Σ lineItemCost
projectOverheadTotal = Σ overhead.cost                       ← absolute amounts
companyOverheadCost  = laborCost × (overheadPercentage / 100)
bufferCost           = (laborCost + companyOverheadCost + projectOverheadTotal)
                       × (bufferPercentage / 100)
totalCost            = laborCost
                     + companyOverheadCost
                     + projectOverheadTotal
                     + bufferCost

clampedMarginPct     = clamp(margin, 0, 95)                  ← slider 10–80
targetMarginDec      = clampedMarginPct / 100
suggestedPrice       = totalCost / (1 - targetMarginDec)
expectedProfit       = suggestedPrice - totalCost
```

**Worked example**

```
Resources:   2 features × 200 h × $50/h cost              = $20,000
Project overhead:    Security audit                       = $3,000
Company overhead 15%:  20,000 × 0.15                      = $3,000
Risk buffer 10%:       (20,000 + 3,000 + 3,000) × 0.10    = $2,600
totalCost                                                  = $28,600
margin 40%  →  suggestedPrice = 28,600 / 0.60             = $47,667
expectedProfit                                             = $19,067
```

### Margin slider bounds

| Bound | Reason |
|---|---|
| min 10 % | Below 10 % is dangerous as a quote — surfaces a higher floor |
| max 80 % | Above 80 % approaches divide-by-zero (margin = 100 → div by 0) |

The component has a defensive `targetMarginDec < 1` guard (returns `suggestedPrice = 0` otherwise).
This is never reachable through the slider but protects against future code paths.

### Budget reality-check

```
exceedsBudget       = clientBudget > 0 AND suggestedPrice > clientBudget × 1.05
budgetOverage       = suggestedPrice - clientBudget
budgetOveragePct    = budgetOverage / clientBudget × 100
```

A **5 % tolerance** absorbs normal negotiation slack. Anything beyond triggers an inline warning
banner ("Suggested price exceeds budget"). Salesperson sees the problem next to the price they're
about to quote rather than after the client pushes back.

---

## 5. Ghost-Role Pre-Fill (when no estimation resources exist)

When the user lands on a deal that has **ghost roles but no `estimationResources`**, the simulator
generates seed line items from ghost roles:

```
hours = quantity × (months / 100) × defaultMonthlyCapacityHours × timelineMonths
```

(`months` is the legacy-named allocation **percentage** — see CRM doc §10.)

For each ghost role it tries to find a matching org role by title fuzzy-match (`pm` → "project
manager", `frontend` → any role title containing "frontend", etc.). On failure it falls back to
`roleId = gr.roleType` (a string label, not a UUID — see Bug #2).

---

## 6. Versioning Flow

```
                  ┌───────────────────────────────────┐
                  │ user edits resources / overheads /│
                  │ margin in local component state   │
                  └────────────────┬──────────────────┘
                                   │  dirty = true
                                   │  signature ≠ savedSignature
                                   ▼
                  ┌───────────────────────────────────┐
                  │ Save Estimate vN button enables   │
                  └────────────────┬──────────────────┘
                                   │ click
                                   ▼
        POST /deals/{dealId}/estimation-versions
                                   │
                                   │ returns new version row
                                   ▼
              invalidate ['estimation-versions', dealId]
                  (but NOT ['deals'] — see Bug #1)
```

### "Is this a no-op save?" detection

Both the local edit state and the latest saved version are serialised to a stable string signature
(sorted, role/feature/hours triples for resources, name/cost pairs for overheads, plus margin):

```
localSignature  = `${margin}::${sortedResources}::${sortedOverheads}`
savedSignature  = same, but from latestVersionDetail
isUnchanged     = savedSignature !== null AND local === saved
```

When `isUnchanged` is true:
- the **Save** button is disabled and labelled "No changes to save"
- the **Draft / Saved** indicator flips back to "Saved" even if `dirty` is still true (user reverted)
- a belt-and-suspenders check in `handleSave` short-circuits with a toast if the disabled-button
  guard was bypassed (e.g., button enabled while detail query was in flight)

### Compare-against-any-version

The compare picker is keyed by version `id`, not "previous". A diff banner (`CompareBanner`) fetches
the full saved version on demand and renders a **per-role hours diff**:

| Saved (vN) | Current | Δ |
|---|---|---|
| 120h | 160h | +40 |
| 80h | 80h | (no change) |
| 0h (unsaved) | 32h | +32 |
| 24h | 0h (removed) | -24 |

Diff colours: positive Δ → rose (over), negative Δ → emerald (under), zero → slate.

> Overheads and margin are **not** included in the diff banner — see Bug #12.

### Restore

```
POST /estimation-versions/{versionId}/restore
  → invalidate ['deals']
  → component re-reads selectedDeal from store and resets local state
```

The "Restore" button is only shown for non-latest rows (`idx > 0`) — restoring to the latest is a
no-op.

---

## 7. Bug Registry (all fixed in this branch)

| # | Bug | Severity | Fix |
|---|---|---|---|
| 1 | Save mutation only invalidated `['estimation-versions', dealId]` — never `['deals']`. After saving a version, the parent deal's `estimationResources`, `projectOverheads`, `targetMargin` (and any backend-recomputed cost fields) stayed stale in the Zustand store. CRM Kanban cards and deal detail showed pre-save numbers until next page nav. | Critical | `saveVersion.onSuccess` now also invalidates `['deals']`. |
| 2 | Ghost-role pre-fill assigned `roleId = gr.roleType` (e.g. `'frontend'`) when no org role title matched. Saving sent a non-UUID roleId to the backend → 422 with no easy UI recovery. | High | When no title matches, fall back to `roles[0].id` (a real UUID). If the org has zero roles, the seed is skipped entirely. |
| 3 | `handleRestore` read `store.deals.find(...)` immediately after `restoreVersion.mutateAsync`. The deals invalidation hadn't refetched yet, so the form briefly reset to **pre-restore** state. | High | `handleRestore` now `await`s `qc.refetchQueries({ queryKey: ['deals'] })` and `['estimation-versions']` before reading the store, and uses `useBusinessStore.getState()` to read the latest snapshot. |
| 4 | `restoreVersion.onSuccess` invalidated `['deals']` only. If the backend created a new vN+1 audit row on restore, the versions dropdown didn't refresh. | Medium | Also invalidates `['estimation-versions']` (prefix-match, no dealId needed). |
| 5 | `compareWithId` was not reset when the user changed deals — banner kept showing the previous deal's version. | Medium | `handleDealChange` resets `compareWithId` and `showHistory`. |
| 6 | **Cost model divergence.** The Engine's `totalCost = labor + projectOverheads` ignored `companySettings.overheadPercentage` and `bufferPercentage`. Ghost-role/AI-Builder estimates applied both. Same deal, two different totals depending on which view you opened. | Medium | Engine now applies the same `calculateOverhead` and `calculateRiskBuffer` helpers used everywhere else: `labor + companyOverhead(%) + projectOverhead(abs) + buffer(% on all three)`. The sidebar shows the breakdown line-by-line. |
| 7 | `defaultMonthlyCapacityHours` could be `undefined` before `companySettings` hydrated → ghost-role pre-fill produced `NaN` hours. | Medium | Falls back to `160` (documented default) when settings haven't loaded. |
| 8 | Redundant special-cases in the role-matching chain (e.g. `includes('frontend')` was already covered by `includes(gr.roleType)`). | Low | Collapsed to a single `includes(gr.roleType)` plus the genuine `pm` → "project manager" special-case. |
| 9 | `crypto.randomUUID()` ran inside the load `useEffect` — IDs re-minted on every dependency-change re-run. | Low | Resources now derive stable ids (`ghost-${gr.id || gr.roleType}`). A `loadedDealIdRef` also prevents the effect from clobbering local edits on background `store.deals` refetches. |
| 10 | `costRateForRole` returned `role.rate × costToBillRatio = 0` when `role.rate` was 0, instead of falling through to `fallbackHourlyCost`. | Low | Now treats `role.rate ≤ 0` as "no role-rate signal" and continues to the fallback. |
| 11 | `targetMarginDec < 1` guard returned `suggestedPrice = 0` silently when margin ≥ 100. Would surprise a future maintainer if the slider cap were lifted. | Low | Margin is explicitly clamped to `[0, 95]` before the price calculation; the silent-zero branch is gone. |
| 12 | Compare banner diffed resource hours only — overhead and margin changes were invisible. | Low | `CompareBanner` now renders three diff sections: resources (hours), overheads (currency), and target margin (percent). |
| 13 | `showHistory` was not reset on deal change — the panel stayed open across switches. | Trivial | Reset in `handleDealChange` alongside `compareWithId`. |

---

## 8. Data Flow Summary

```
                ┌──────────────────────┐
                │ /estimation page     │
                │ ?dealId=...          │
                └──────┬───────────────┘
                       │
                       ▼
   ┌────────────────────────────────────────────┐
   │ EstimationSimulator                        │
   │                                            │
   │  store.deals  ◄── useDealList() side-fx    │
   │  store.roles                               │
   │  store.employees                           │
   │  store.companySettings                     │
   │                                            │
   │  local state:                              │
   │    resources[]   overheads[]   margin      │
   │    selectedDealId  compareWithId  notes    │
   └──────┬─────────────────────────┬──────────┘
          │                         │
          │ POST version            │ POST restore
          ▼                         ▼
   /deals/{id}/estimation-versions  /estimation-versions/{vid}/restore
          │                         │
          │ returns new version     │ invalidates ['deals']
          │ invalidates versions    │ (but not versions list — bug #4)
          │ (but not deals — bug #1)│
```

---

## 9. Quick Reference

| Question | Answer |
|---|---|
| Where does the cost rate come from? | Median active-employee `costPerHour` for that role, else `role.rate × costToBillRatio` (skipped if `role.rate ≤ 0`), else `fallbackHourlyCost`. |
| What overhead components stack? | Three: **company overhead %** (on labor, from settings), **project overhead** (absolute, user-entered per row), and **risk buffer %** (on labor + both overheads, from settings). |
| How is "Suggested Price" derived? | `totalCost / (1 - clampedMargin/100)`, with margin clamped to `[0, 95]`. |
| What triggers the budget warning? | `suggestedPrice > clientBudget × 1.05`. |
| Are versions truly immutable? | Yes — append-only. Restore writes the version's content back to the live deal record (backend handles vN+1 row creation if any). |
| When is the Save button disabled? | When the local signature matches the latest saved version's signature, or while a save is in flight. |
| What's saved when I click Save? | `resources[]`, `overheads[]`, `targetMargin`, `notes` — sent to `POST /deals/{dealId}/estimation-versions`. Mutation also invalidates `['deals']` so CRM cards refresh. |
