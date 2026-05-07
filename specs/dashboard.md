# anka-frontend — Dashboard Module Spec

## Pages

| Page | File | Purpose |
|---|---|---|
| Dashboard | `app/(dashboard)/dashboard/page.tsx` | High-level KPI overview with P&L and pipeline charts |

---

## Dashboard Page (`/dashboard`)

**File:** `app/(dashboard)/dashboard/page.tsx`

Main landing page for authenticated org users. Data is loaded via TanStack Query hooks (which seed `businessStore`). All calculations are derived from `businessStore` — no dedicated dashboard API endpoint exists.

### Data Fetched

| Hook | Endpoint | Purpose |
|---|---|---|
| `useDealList()` | GET `/api/deals` | Pipeline deals + stage values |
| `useProjectList()` | GET `/api/projects` | Active project count |
| `useInvoiceList()` | GET `/api/invoices` | Revenue data for P&L |
| `useTimeEntryList()` | GET `/api/time-entries` | Labor cost data for P&L |

All four hooks fire on mount independently. They seed `businessStore` as a side effect.

Uses `isMounted` guard to prevent hydration mismatch — renders `null` until mounted.

---

### KPI Cards (4 cards)

| Card | Formula | Icon Color |
|---|---|---|
| Total Revenue (YTD) | `sum(pnlData.revenue)` from `store.getFinancialPnL()` | emerald |
| Operating Profit (YTD) | `sum(pnlData.operatingProfit)` | blue; value colored emerald if ≥ 0, rose if < 0 |
| Active Pipeline Value | `sum(deal.estimatedValue \|\| deal.clientBudget)` for deals not `won` or `lost` | purple |
| Active Projects | count of projects with status `On Track`, `At Risk`, or `Over Budget` | amber |

Revenue and profit are formatted with `Intl.NumberFormat` as USD with no decimals.

---

### Charts (2-column grid)

#### Monthly P&L Trend (Bar Chart)

- **Source:** `store.getFinancialPnL()`
- **X-axis:** `month` (YYYY-MM string)
- **Series:**
  - `Revenue` (emerald bars)
  - `Op. Profit` (blue bars)
- **Y-axis:** formatted as `$Xk`
- **Library:** Recharts `BarChart`
- Empty state: "No financial data. Add invoices and timesheets."

#### Top Pipeline Deals - Weighted Value (Horizontal Bar Chart)

- **Source:** `store.deals` filtered to non-won/non-lost, sorted by weighted value descending, top 10
- **Calculation:** `weightedValue = estimatedValue * (winProbability / 100)`
- **Series:**
  - `Weighted Value` (purple bars)
  - `Target Value (100% Win)` (slate bars)
- **X-axis:** formatted as `$Xk`; Y-axis: deal name (width 120px)
- Empty state: "No active deals in pipeline."

---

## Computed Data Source: `getFinancialPnL()`

Defined in `store/businessStore.ts`. Returns an array of monthly rows:

```typescript
type PnLRow = {
    month: string;         // "YYYY-MM"
    revenue: number;       // sum of paid invoices that month
    directLabor: number;   // sum of (hours × costPerHour) for approved time entries
    overhead: number;      // sum of globalOverheads.monthly_cost
    grossProfit: number;   // revenue - directLabor
    operatingProfit: number; // grossProfit - overhead
    netProfit: number;     // same as operatingProfit in current implementation
}
```

---

## Known Gaps

- Dashboard does not auto-refresh — data is fetched once on mount.
- No date range filter on the dashboard (unlike the Financial page which has month pickers).
- `Active Pipeline Value` uses `estimatedValue || clientBudget` — if neither is set, the deal contributes $0.
- No per-user or per-role dashboard customization.
