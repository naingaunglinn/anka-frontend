# anka-frontend — Forecast Module Spec

## Pages

| Page | File | Purpose |
|---|---|---|
| Scenario Forecasting | `app/(dashboard)/forecast/page.tsx` | Stress-test 6-month financial projections against configurable shock variables |

---

## Forecast Page (`/forecast`)

**File:** `app/(dashboard)/forecast/page.tsx`

A simulation tool — no API calls beyond what is already in the store. All projection math runs client-side. The baseline comes from the last month of real P&L data via `store.getFinancialPnL()`.

### Data Source

- `store.getFinancialPnL()` — provides the real baseline (last month's revenue and costs).
- Falls back to `baseRevenue = 150000`, `baseCosts = 90000` if no actual P&L data exists yet.

No additional API calls — requires invoices and time entries to already be loaded in `businessStore`.

---

### Shock Variables (Simulation Controls)

Displayed in a dark panel on the left side (`bg-slate-900 text-white`). Three sliders:

| Variable | Range | Step | Default | Applied As |
|---|---|---|---|---|
| Utilization Drop (Bench Risk) | 0–50% | 5 | 0% | Revenue penalty each month: `utilizationDrop% × currentRevenue` |
| Delayed Pipeline Deals | $0–$300,000 | $25,000 | $0 | Revenue penalty spread evenly over months 1–3: `delayedDeals / 3` per month |
| New Developer Hires | 0–10 | 1 | 0 | Fixed cost increase: `newHires × $8,000/month` added to base costs |

---

### Projection Calculation

`generateProjection()` returns 6 months of data:

```
baseRevenue  = last pnlData month's revenue (or 150000 fallback)
baseCosts    = last pnlData month's (directLabor + overhead) (or 90000 fallback)
hireCost     = newHires × 8000

For each month:
  revPenalty      = utilizationDrop% × currentRevenue
  delayPenalty    = delayedDeals / 3   (months 1–3 only)
  ProjectedRevenue = currentRevenue − revPenalty − delayPenalty
  ProjectedCost    = baseCosts + hireCost  (costs are sticky)
  ProjectedProfit  = ProjectedRevenue − ProjectedCost
  BaselineProfit   = currentRevenue − ProjectedCost  (no shocks)
  currentRevenue  *= 1.02  (2% organic growth per month)
```

---

### Impact Summary Badge

Displayed inside the control panel below the sliders:

| Condition | Severity | Color |
|---|---|---|
| `min(ProjectedProfit) < 0` | Critical: negative cashflow | rose |
| `min(ProjectedProfit) < 20000` | Warning: thin margins | amber |
| Otherwise | Healthy: operations remain profitable | emerald |

---

### Charts

#### 6-Month Profit Projection (Line Chart)

- **Library:** Recharts `LineChart`
- **Series:**
  - `Projected Profit (Stressed)` — rose solid line (width 3)
  - `Baseline Profit (Expected)` — emerald dashed line
- **X-axis:** Month 1–6
- **Y-axis:** Formatted as `$Xk`
- Title badge shows "In the red" (rose) or "Profitable" (emerald) based on Month 6 value.

#### Month 6 Summary Cards (2 cards)

| Card | Value |
|---|---|
| M6 Stressed Revenue | `chartData[5].ProjectedRevenue` |
| M6 Fixed Costs | `chartData[5].ProjectedCost` |

---

## Known Gaps

- Hire cost is hardcoded at $8,000/month per developer — not derived from actual `store.employees` salary data.
- No ability to save or name scenarios — simulation state resets on navigation.
- No API call — purely client-side simulation. Does not model capacity utilization from actual time entries.
- Organic growth is hardcoded at 2%/month — not configurable.
- Only projects 6 months forward — cannot change the window.
