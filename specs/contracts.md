# anka-frontend — Contracts Module Spec

## Pages

| Page | File | Purpose |
|---|---|---|
| Contracts & Billing | `app/(dashboard)/contracts/page.tsx` | All contracts, milestones, invoices |

⚠️ There is no Contract detail page or dedicated Milestone/Invoice pages — all are managed via tabs and dialogs within a single page.

---

## Contracts Page (`/contracts`)

**File:** `app/(dashboard)/contracts/page.tsx`

### Data fetched
| Hook | Endpoint | Purpose |
|---|---|---|
| `useContractList()` | GET `/api/contracts` | All tenant contracts |
| `useInvoiceList()` | GET `/api/invoices` | All tenant invoices |
| `useMilestoneList()` | GET `/api/milestones` | All tenant milestones |
| `useDealList()` | GET `/api/deals` | Resolve source deal name per contract |
| `useProjectList()` | GET `/api/projects` | Resolve linked project per contract |

### Summary KPI cards
| Card | Calculation |
|---|---|
| Active Contracts | count where status === 'Active' |
| Total Contract Value | sum of totalValue |
| Revenue Recognized | sum of revenueRecognized (with % of total) |

### Tab: Active Contracts

**Table columns:**
| Column | Notes |
|---|---|
| Contract ID | contractNumber or id |
| Client | contract.client |
| Source Deal | deal name (looked up via dealId); clickable → `/crm/:dealId` |
| Linked Project | projectNumber or name (looked up via contractId); clickable → `/projects` |
| Status | badge: Active (blue), Completed (emerald), Draft/Cancelled (slate) |
| Total Value | formatted currency |
| Recognized | revenue_recognized formatted currency |
| Actions | dropdown menu |

**Row actions (dropdown):**
- View Source Deal → `/crm/:dealId` (only if deal found)
- View Linked Project → `/projects` (only if project found)
- Edit Contract → opens Edit Contract dialog
- Archive → confirmation dialog → `deleteContract.mutateAsync(id)`

**Edit Contract Dialog:**
| Field | Type | Notes |
|---|---|---|
| Status | select | Active, Completed, Draft, Cancelled |
| Notes | text input | optional |
| Save Changes button | | `updateContract.mutateAsync()` |

### Tab: Milestones

**Table columns:**
| Column | Notes |
|---|---|
| Contract | contract number looked up by contractId |
| Milestone Name | milestone.name |
| Due Date | milestone.dueDate |
| Status | badge: Completed (emerald), In Progress (blue), Pending (amber) |
| Amount | formatted currency |
| Delete | trash icon → confirmation dialog |

**Add Milestone Dialog:**
| Field | Required | Notes |
|---|---|---|
| Contract | ✅ | select from contracts list |
| Milestone Name | ✅ | text |
| Due Date | ✅ | date |
| Amount | ✅ | number > 0 |

### Tab: Invoices

**Table columns:**
| Column | Notes |
|---|---|
| Invoice # | invoiceNumber or short ID |
| Contract | contract number looked up by contractId |
| Issue Date | invoice.issueDate |
| Status | badge: Paid (emerald), Pending (amber), Overdue (red), others (slate) |
| Amount | invoice.amount formatted |
| Actions | dropdown menu |

**Row actions:**
- Download PDF → placeholder action
- Mark as Paid → `payInvoice.mutate(invoiceId)` — visible only for Pending or Overdue
- Delete → confirmation dialog → `deleteInvoice.mutateAsync(id)`

**Create Invoice Dialog** (triggered from page-level "Create Invoice" button):
| Field | Required | Notes |
|---|---|---|
| Contract | ✅ | select from contracts list |
| Milestone | No | filtered to selected contract |
| Issue Date | ✅ | date, defaults to today |
| Due Date | No | date |
| Amount ($) | ✅ | number > 0 |
| Tax ($) | No | number |
| Notes | No | text |

---

## API Calls

| Action | Hook | HTTP | Endpoint |
|---|---|---|---|
| Load contracts | `useContractList()` | GET | `/api/contracts` |
| Update contract | `updateContract.mutate()` | PATCH | `/api/contracts/{id}` |
| Delete contract | `deleteContract.mutate()` | DELETE | `/api/contracts/{id}` |
| Load invoices | `useInvoiceList()` | GET | `/api/invoices` |
| Create invoice | `createInvoice.mutate()` | POST | `/api/invoices` |
| Pay invoice | `payInvoice.mutate()` | PATCH | `/api/invoices/{id}/pay` |
| Delete invoice | `deleteInvoice.mutate()` | DELETE | `/api/invoices/{id}` |
| Load milestones | `useMilestoneList()` | GET | `/api/milestones` |
| Create milestone | `createMilestone.mutate()` | POST | `/api/milestones` |
| Delete milestone | `deleteMilestone.mutate()` | DELETE | `/api/milestones/{id}` |

---

## Contract → Create Project Flow

| Check | Status |
|---|---|
| Source Deal column with link | ✅ EXISTS — links to `/crm/:dealId` |
| Linked Project column with link | ✅ EXISTS — links to `/projects` |
| Project auto-created when deal is won | ✅ EXISTS — via win_deal() SP |
| "Create Project" button on Contract | ⚠️ NOT IMPLEMENTED |
| Contract "Signed" status gate | ⚠️ NOT IMPLEMENTED |
| Pre-fill Project from Contract | ⚠️ NOT IMPLEMENTED — no manual project create |

---

## Pre-fill Behavior

| Data | Status | Notes |
|---|---|---|
| Contract pre-filled from Estimation | ⚠️ NOT IMPLEMENTED | No estimation_id FK; contract data comes from win_deal() SP |
| Invoice pre-filled from Contract | ✅ PARTIAL | Contract dropdown pre-selects; milestone filtered by contract |
| Milestone linked to Contract | ✅ EXISTS | Required contract selection in create dialog |

---

## Overdue Invoice Detection

Overdue status is computed **client-side** in `dealsMapper.ts::toInvoice()`:
```typescript
const isOverdue = row.status === 'Pending' && row.due_date && new Date(row.due_date) < new Date();
```
The database stores `Pending` — the frontend displays it as `Overdue`. The backend does not auto-update invoice status.
