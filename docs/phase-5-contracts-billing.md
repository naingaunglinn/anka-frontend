# Phase 5 — Contracts, Milestones & Invoices

**Effort:** ~3 days  
**Dependency:** Phase 4 (contracts and projects created by win deal), Phase 1 (auth)  
**Why now:** Once a deal is won and a contract exists, the finance team needs to track billing milestones, send invoices, and recognize revenue. The P&L dashboard depends on paid invoice data.

---

## Business Context

The billing cycle works like this:

```
Won Deal
    → Contract (total_value = agreed budget)
        → Milestones (payment schedule: "Kickoff $20k", "Phase 1 $50k")
            → Invoices (issued per milestone or manually)
                → Paid Invoice → revenue_recognized increments on Contract
                    → P&L Dashboard (monthly revenue chart)
```

The Financial page shows:
- Monthly revenue (from paid invoices grouped by `issue_date`)
- Direct labor cost (from approved time entries × employee cost)
- Overhead (from `global_overheads` monthly cost)
- Gross profit, operating profit, net profit

All of this currently runs off mock data in `businessStore.getFinancialPnL()`.

---

## 5.1 — Laravel API: Contracts

### List Contracts

```
GET /api/contracts
```

Returns all non-deleted contracts for the tenant, with milestone count summary.

```json
{
    "data": [
        {
            "id": "uuid",
            "contract_number": "CON-0001",
            "deal_id": "uuid",
            "client": "Acme Corp",
            "total_value": 120000,
            "revenue_recognized": 40000,
            "status": "Active",
            "start_date": "2024-03-01",
            "end_date": "2024-06-30",
            "notes": null,
            "created_at": "..."
        }
    ]
}
```

### Get Single Contract (with milestones)

```
GET /api/contracts/{id}
```

Includes `milestones` and `invoices` as relations.

### Update Contract

```
PUT /api/contracts/{id}
```

```json
{ "status": "Completed", "notes": "All deliverables accepted." }
```

Allowed updates: `status`, `start_date`, `end_date`, `notes`, `total_value`.  
Do not allow updating `contract_number`, `deal_id`, `tenant_id`.

---

## 5.2 — Laravel API: Milestones

Milestones are billing checkpoints tied to a contract. They define the payment schedule.

### List Milestones for Contract

```
GET /api/contracts/{contractId}/milestones
```

### Create Milestone

```
POST /api/contracts/{contractId}/milestones
```

```json
{
    "name": "Phase 2 Delivery",
    "due_date": "2024-05-31",
    "amount": 50000,
    "status": "Pending"
}
```

### Update Milestone

```
PUT /api/milestones/{id}
```

### Complete Milestone

```
PATCH /api/milestones/{id}/complete
```

Sets `status = 'Completed'` and `completed_at = now()`. This is a separate endpoint because completing a milestone is a business event (not just a field update) — it can optionally trigger invoice creation.

**Response:**

```json
{
    "id": "uuid",
    "status": "Completed",
    "completed_at": "2026-05-02T10:00:00Z"
}
```

### Delete Milestone

```
DELETE /api/milestones/{id}
```

Hard delete is acceptable here (no audit trail needed for milestones unless they have paid invoices linked).

---

## 5.3 — Laravel API: Invoices

### List Invoices

```
GET /api/invoices
```

**Query params:**
- `?status=Pending` — filter by payment status
- `?from=2024-01-01&to=2024-12-31` — filter by `issue_date` range
- `?contract_id=uuid` — filter by contract

Used by the Financial page for P&L revenue calculations.

### List Invoices for Contract

```
GET /api/contracts/{contractId}/invoices
```

### Create Invoice

```
POST /api/invoices
```

```json
{
    "contract_id": "uuid",
    "milestone_id": "uuid",       // optional
    "issue_date": "2026-05-01",
    "due_date": "2026-05-31",     // optional
    "amount": 40000,
    "tax": 4000,
    "notes": "First payment per contract terms."
}
```

> **Never include `total` in the request.** It is `GENERATED ALWAYS AS (amount + tax)` by the DB. The API response will include it automatically.

### Update Invoice

```
PUT /api/invoices/{id}
```

Only allowed while `status = 'Draft'`. Once `Pending` or `Paid`, the invoice should be locked except for status transitions.

### Pay Invoice

```
PATCH /api/invoices/{id}/pay
```

**Laravel controller must:**
1. Verify `status = 'Pending'` (reject if already Paid or Cancelled)
2. Set `status = 'Paid'`, `paid_at = now()`
3. Increment `contracts.revenue_recognized` by the invoice `total` (= `amount + tax`)

```php
DB::transaction(function () use ($invoice) {
    $invoice->update(['status' => 'Paid', 'paid_at' => now()]);
    
    $invoice->contract->increment('revenue_recognized', $invoice->total);
});
```

**Response 200:** Updated invoice with `paid_at`.  
**Response 409:** Invoice is not in `Pending` status.

### Cancel Invoice

```
PATCH /api/invoices/{id}/cancel
```

Sets `status = 'Cancelled'`. If the invoice was previously Paid, reverse the `revenue_recognized` increment on the contract.

### Delete Invoice (soft)

```
DELETE /api/invoices/{id}
```

Sets `deleted_at`. Only allowed for `Draft` invoices.

---

## 5.4 — Frontend: Load Contracts Data

**File:** `app/(dashboard)/contracts/page.tsx`

Add on-mount fetch:

```ts
useEffect(() => {
    api.get('/contracts').then(({ data }) => {
        useBusinessStore.setState({ contracts: data.data.map(toContract) });
    });
    // Also fetch milestones and invoices if not loaded by winDeal
    api.get('/invoices').then(({ data }) => {
        useBusinessStore.setState({ invoices: data.data.map(toInvoice) });
    });
}, []);
```

---

## 5.5 — Frontend: Wire Invoice Actions in Store

**File:** `store/businessStore.ts`

```ts
addInvoice: async (invoice) => {
    const snapshot = get().invoices;
    const tempId = `temp-${Date.now()}`;
    set(s => ({ invoices: [...s.invoices, { ...invoice, id: tempId }] }));
    try {
        const { data } = await api.post('/invoices', {
            contract_id: invoice.contractId,
            milestone_id: invoice.milestoneId ?? null,
            issue_date: invoice.issueDate,
            due_date: invoice.dueDate ?? null,
            amount: invoice.amount,
            tax: invoice.tax,
            notes: invoice.notes ?? null,
        });
        set(s => ({
            invoices: s.invoices.map(i => i.id === tempId ? toInvoice(data) : i)
        }));
    } catch (err) {
        set({ invoices: snapshot });
        toast.error(`Failed to create invoice: ${(err as any).message}`);
    }
},

payInvoice: async (id) => {
    const snapshot = get().invoices;
    set(s => ({
        invoices: s.invoices.map(i => i.id === id ? { ...i, status: 'Paid' as const } : i)
    }));
    try {
        const { data } = await api.patch(`/invoices/${id}/pay`);
        // Update with real paid_at from server
        set(s => ({ invoices: s.invoices.map(i => i.id === id ? toInvoice(data) : i) }));
        // Also update contract revenue_recognized in store
        const inv = get().invoices.find(i => i.id === id);
        if (inv) {
            set(s => ({
                contracts: s.contracts.map(c =>
                    c.id === inv.contractId
                        ? { ...c, revenueRecognized: c.revenueRecognized + (inv.amount + inv.tax) }
                        : c
                )
            }));
        }
    } catch (err) {
        set({ invoices: snapshot });
        toast.error(`Failed to pay invoice: ${(err as any).message}`);
    }
},
```

---

## 5.6 — Invoice Mapper

```ts
export function toInvoice(row: any): Invoice {
    return {
        id: row.id,
        contractId: row.contract_id,
        milestoneId: row.milestone_id ?? undefined,
        invoiceNumber: row.invoice_number,
        issueDate: row.issue_date,
        dueDate: row.due_date ?? undefined,
        amount: row.amount,
        tax: row.tax,
        total: row.total,                  // GENERATED column — read only
        status: row.status,
        paidAt: row.paid_at ?? undefined,
        notes: row.notes ?? undefined,
    };
}
```

---

## 5.7 — Fix `getFinancialPnL()` to Use Real Data

**File:** `store/businessStore.ts` line 526

The P&L calculator references `inv.date` — after Phase 0 renames this to `inv.issueDate`, update:

```ts
// Before:
const month = new Date(inv.date).toLocaleString('default', { month: 'short' });

// After:
const month = new Date(inv.issueDate).toLocaleString('default', { month: 'short' });
```

Also filter for only `Paid` invoices in revenue calculation (currently counts all invoices regardless of status):

```ts
state.invoices
    .filter(inv => inv.status === 'Paid')    // ADD: only count paid revenue
    .forEach(inv => {
        const month = new Date(inv.issueDate).toLocaleString('default', { month: 'short' });
        ...
        monthlyData[month].revenue += inv.amount;
    });
```

---

## 5.8 — Overdue Invoice Detection

The frontend `Invoice.status` union now includes `'Overdue'`. The backend should have a scheduled job (or compute on-the-fly) that transitions invoices where:
- `status = 'Pending'`
- `due_date < today`

For the API response, the Laravel query can add a computed field:

```php
// In Invoice model or query:
->selectRaw("*, CASE WHEN status = 'Pending' AND due_date < CURRENT_DATE THEN 'Overdue' ELSE status END as display_status")
```

Or handle it client-side in the mapper:

```ts
status: row.due_date && row.status === 'Pending' && new Date(row.due_date) < new Date()
    ? 'Overdue'
    : row.status,
```

---

## 5.9 — Remove Mock Contract/Invoice/Milestone Data

**File:** `store/businessStore.ts` lines 112–125

Once the API is wired:

```ts
contracts: [],
invoices: [],
milestones: [],
```

---

## Field Mapping Reference

| Frontend | API / SQL |
|---|---|
| `contractNumber` | `contract_number` |
| `dealId` | `deal_id` |
| `totalValue` | `total_value` |
| `revenueRecognized` | `revenue_recognized` |
| `startDate` | `start_date` |
| `endDate` | `end_date` |
| `milestoneId` | `milestone_id` |
| `invoiceNumber` | `invoice_number` |
| `issueDate` | `issue_date` |
| `dueDate` | `due_date` |
| `paidAt` | `paid_at` |
| `contractId` | `contract_id` |
| `dueDate` (milestone) | `due_date` |

---

## Acceptance Criteria

- [ ] Contracts page loads real data from `GET /api/contracts`
- [ ] Milestones load per contract and show correct amounts and statuses
- [ ] Completing a milestone sets `completed_at` in DB
- [ ] Creating an invoice persists to DB with auto-generated `invoice_number`
- [ ] Invoice `total` is computed by DB (`amount + tax`) — not sent in request
- [ ] Paying an invoice sets `paid_at`, updates `status = 'Paid'`
- [ ] Paying an invoice increments `contracts.revenue_recognized` correctly
- [ ] P&L dashboard only counts `Paid` invoices as revenue
- [ ] P&L uses `issueDate` (not `date`) for monthly grouping
- [ ] Overdue invoices display with `Overdue` status badge when `due_date` has passed
- [ ] `GET /api/invoices` returns only this tenant's invoices
