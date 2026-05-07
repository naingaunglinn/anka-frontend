# anka-frontend — Financial Module Spec

## Pages

| Page | File | Purpose |
|---|---|---|
| Financial Performance | `app/(dashboard)/financial/page.tsx` | Monthly P&L statement with date filter and CSV export |

---

## Financial Page (`/financial`)

**File:** `app/(dashboard)/financial/page.tsx`

Real-time P&L tracking. No dedicated `/api/financial` endpoint — all data is computed client-side from `businessStore` state using `store.getFinancialPnL()`.

### Data Fetched

| Hook | Endpoint | Purpose |
|---|---|---|
| `useInvoiceList()` | GET `/api/invoices` | Revenue (paid invoices) |
| `useTimeEntryList()` | GET `/api/time-entries` | Direct labor costs (approved entries) |

Global overheads come from `store.globalOverheads` (already seeded by `useOrganizationSync`).

---

### Date Range Filter

Two `<input type="month">` fields (From / To). Filtering is done client-side against `pnlData`:
- `row.month` is a `"YYYY-MM"` string
- From filter: `row.month >= dateFrom`
- To filter: `row.month <= dateTo + '-31'` (string comparison; covers all days in the month)
- "Clear" button resets both to empty (shows all months)

---

### Summary KPI Cards (4 cards)

| Card | Formula |
|---|---|
| Total Recognized Revenue | `sum(pnlRow.revenue)` for filtered months |
| Total Costs (Labor + Overhead) | `sum(pnlRow.directLabor + pnlRow.overhead)` |
| Operating Profit | `sum(pnlRow.operatingProfit)` |
| Overall Profit Margin | `(totalProfit / totalRev) * 100`; 0% if no revenue |

---

### Monthly P&L Table

**Columns:**
| Column | Notes |
|---|---|
| Month | `YYYY-MM` string |
| Revenue (Invoices) | sum of paid invoice amounts for the month |
| Direct Labor (Timesheets) | sum of (hours × costPerHour) for approved time entries; displayed with `-$` prefix in rose |
| Gross Profit | Revenue − Direct Labor |
| Global Overhead | sum of all `globalOverheads.monthly_cost`; same value every month; displayed with `-$` prefix in rose |
| Op. Profit (EBITDA) | Gross Profit − Global Overhead |
| Net Margin % | `(netProfit / revenue) * 100` |

**Net Margin % badge colors:**
| Range | Color |
|---|---|
| > 20% | emerald |
| 0–20% | blue |
| < 0% | rose |

Empty state: "No financial data. Add invoices and time entries to generate P&L statements."

---

### CSV Export

Button triggers client-side CSV download (no API call).

**Columns exported:**
`Month`, `Revenue`, `Direct Labor`, `Overhead`, `Gross Profit`, `Operating Profit`, `Net Profit`

Encoded as `data:text/csv;charset=utf-8` and triggered via a temporary `<a>` element. Filename: `pnl_statement.csv`. Exports only the currently filtered months.

---

## P&L Calculation (`store.getFinancialPnL()`)

Defined in `store/businessStore.ts`. Groups data by month string (`YYYY-MM`):

- **Revenue:** Sum of `invoice.amount` for invoices with `status === 'Paid'`, grouped by `invoice.issueDate` month.
- **Direct Labor:** Sum of `(timeEntry.hours × employee.costPerHour)` for approved time entries, grouped by `timeEntry.date` month. Employee `costPerHour` is resolved from `store.employees`.
- **Overhead:** Sum of `globalOverhead.monthlyCost` — same fixed cost applied to every month in the result set.
- **Gross Profit:** Revenue − Direct Labor
- **Operating Profit / Net Profit:** Gross Profit − Overhead

⚠️ Current implementation uses the same global overhead total for every month, regardless of `effective_month` / `effective_year` fields on overhead records.

---

## Known Gaps

- Overhead is applied as a flat monthly total across all months — `effective_month` / `effective_year` fields on `GlobalOverhead` are stored but not used in the P&L calculation.
- No chart on the Financial page (charts are on the Dashboard page only).
- `netProfit` and `operatingProfit` are identical in the current calculation — no separate tax or depreciation line.
- Revenue uses `issueDate` grouping, not `paidAt` date — invoices paid in a later month still show revenue in the month they were issued.
