# Anka Platform — Business Flow & Route Audit

**Audit Date:** 2026-05-05  
**Auditor:** Senior Software Engineer  
**Scope:** All frontend routes — business flow, form completeness, UX, and role-based access

---

## Route: `/` (Root)

### A. Business Purpose
None — simple redirect.

### B. Route & Navigation Correctness
- ✅ Redirects to `/login`

### ⚠️ Critical Issues
- None

---

## Route: `/login`

### A. Business Purpose
Authentication entry point for all users (super admins and org users).

### B. Route & Navigation Correctness
- ✅ Clean full-screen login, no sidebar
- ✅ Redirects super admins → `/tenant`, org users → `/dashboard`
- ✅ Uses `useAuth` hook → CSRF cookie → Sanctum token → httpOnly cookie

### C. Form Fields Audit
| Field | Present? | Type | Required? | Notes |
|-------|----------|------|-----------|-------|
| Email | ✅ | email input | Yes | |
| Password | ✅ | password input | Yes (min 6) | |

### ⚠️ Critical Issues
- None. Login flow is solid.

---

## Route: `/dashboard`

### A. Business Purpose
High-level overview — revenue, pipeline, active projects, P&L charts. This is the first screen org users see.

### B. Route & Navigation Correctness
- ✅ KPI cards cover the right metrics
- ⚠️ Label says "Agency Global Dashboard" — misleading for multi-tenant app (it's one agency's data)
- ✅ Has P&L chart and pipeline chart
- ⚠️ No quick-action links to create deals, log time, or other common actions

### C. Form Fields Audit
No forms — read-only dashboard.

### D. Workflow Correctness
- ✅ Uses `store.getFinancialPnL()` which is derived from real data

### E. Role-Based Access Gaps
- All org roles see this. No RBAC gating needed.

### ⚠️ Critical Issues
- [ ] Heading says "Agency Global Dashboard" — should say "Dashboard" or "[TenantName] Overview"
- [ ] No loading skeleton while data fetches (data comes from query hooks that may be slow)

---

## Route: `/crm` — Sales Pipeline (Kanban)

### A. Business Purpose
Visual Kanban board for the sales pipeline. Sales/Executive/Admin roles manage deals here.

### B. Route & Navigation Correctness
- ✅ Kanban columns: Lead → Inquiry → Proposal → Contract → Won
- ✅ Drag-and-drop stage transitions with auto-win-probability assignment
- ✅ KPI cards: Total Pipeline Value, Weighted Revenue, Forecasted Yield, Capacity Bookings
- ✅ "New Deal" button links to `/crm/new`
- ✅ Deal cards have edit, staffing, win, delete actions
- ❌ **Missing: No deal detail page (`/crm/[id]`)** — clicking on a deal card does nothing except the action menu

### C. Form Fields Audit
Kanban is read-only. Deals are created on `/crm/new` and edited on `/crm/edit/[id]`.

### D. Workflow Correctness
- ✅ Win deal creates Contract + Project atomically via stored procedure
- ✅ Win deal has modal confirmation
- ✅ Delete deal has modal confirmation
- ⚠️ Deal cards show truncated ID instead of proper readable identifier

### E. Role-Based Access Gaps
- Sales/Admin/Executive should use this. No RBAC gates on the page itself.

### ⚠️ Critical Issues
- [ ] **P0 — Missing `/crm/[id]` deal detail page**: No way to view full deal details, estimation breakdown, projected P&L per deal
- [ ] P1 — Kanban card shows ID as label: `{tenant.id.slice(0, 8)}...` — not meaningful to users

---

## Route: `/crm/new` — Create Deal

### A. Business Purpose
Create a new sales deal with client context, budget, timeline, workload estimate, and ghost roles for staffing estimation.

### B. Route & Navigation Correctness
- ✅ Accessible from `/crm` via "New Deal" button
- ✅ After save, redirects to `/crm`
- ✅ Uses tabs: Sales Context, Staffing & Est., Contracts (placeholder)

### C. Form Fields Audit
| Field | Present? | Type | Required? | Notes |
|-------|----------|------|-----------|-------|
| Deal Name | ✅ | text | Yes | |
| Client Budget ($) | ✅ | number | No (defaults 0) | Should be required |
| Win Probability (%) | ✅ | number | No | Set to 50 |
| Timeline (Months) | ✅ | number | No | Set to 1 |
| Total Workload (Hours) | ✅ | number | No | |
| Workload Description | ✅ | textarea | No | Used by AI team builder |
| Ghost Roles (role/qty/months/salary) | ✅ | dynamic fields | Yes (min 1) | |
| **Client Name** | ❌ | — | — | **MISSING** — `Deal` type has `client` field but form doesn't include it |
| **Target Margin (%)** | ❌ | — | — | **MISSING** — hardcoded to 30 in onSubmit |
| **Upload Brief (.txt)** | ✅ | file input | No | For AI team builder |
| **Status** | ❌ | — | — | Hardcoded to "inquiry" — should be selectable |

### D. Workflow Correctness
- ✅ Live financials sidebar updates as user fills in ghost roles
- ✅ AI Team Builder component present
- ⚠️ Client field is missing from the form despite existing in Deal type and API. Users can't set the client name when creating a deal, only via edit.

### E. Role-Based Access Gaps
- Sales/Admin/Executive should create deals. No RBAC gate.

### ⚠️ Critical Issues
- [ ] **P1 — Missing `client` field**: Deal form has no client name input. API supports it but form doesn't include it.
- [ ] P2 — Target margin hardcoded to 30% instead of configurable
- [ ] P2 — Status always "inquiry" on create — should let user pick initial stage (lead, inquiry, proposal)

---

## Route: `/crm/edit/[id]` — Edit Deal

### A. Business Purpose
Edit existing deal details — ghost roles, budget, timeline, workload description.

### B. Route & Navigation Correctness
- ✅ Accessible from Kanban card action menu
- ✅ Loads existing deal data via `useDealDetail` or fallback from store
- ⚠️ Same missing `client` field as create form

### C. Form Fields Audit
| Field | Present? | Type | Required? | Notes |
|-------|----------|------|-----------|-------|
| Deal Name | ✅ | text | Yes | |
| Client Budget ($) | ✅ | number | No | |
| Win Probability (%) | ✅ | number | No | |
| Timeline (Months) | ✅ | number | No | |
| Total Workload (Hours) | ✅ | number | No | |
| Workload Description | ✅ | textarea | No | |
| Ghost Roles | ✅ | dynamic fields | Yes | |
| **Client Name** | ❌ | — | — | **MISSING** — same as create form |
| **Status** | ❌ | — | — | Only changeable via Kanban drag-drop |

### ⚠️ Critical Issues
- [ ] **P1 — Missing `client` field** — same as create form
- [ ] P2 — No status dropdown — can only change via Kanban drag-drop, which is unintuitive for keyboard/accessibility users

---

## Route: `/crm/[id]/staffing` — AI Team Staffing

### A. Business Purpose
AI-powered team composition suggestion for a deal. Converts ghost roles into hard assignments with specific employees.

### B. Route & Navigation Correctness
- ✅ Accessible from Kanban card action menu
- ✅ Uses Google Gemini Flash Lite for AI suggestions
- ✅ Shows ghost roles input, AI recommendations, employee selection

### ⚠️ Critical Issues
- [ ] Route works but missing parent route `/crm/[id]` — you have to go through staffing to see any deal detail

---

## Route: `/organization` — Organization Settings

### A. Business Purpose
Manage departments, roles, employees, salary multipliers, and global overhead costs. Core HR/Admin module.

### B. Route & Navigation Correctness
- ✅ Five tabs: Departments, Roles, Employees, Salary Structure, Global Overhead
- ✅ Each tab has Add/Edit/Delete and a table
- ✅ Uses `useOrganizationSync` to seed data into Zustand store on mount
- ✅ Cost per hour shown as read-only (generated column)

### C. Form Fields Audit — Employee Form
| Field | Present? | Type | Required? | Notes |
|-------|----------|------|-----------|-------|
| Name | ✅ | text | Yes | |
| Role (billing role) | ✅ | select | Yes | Shows list of roles |
| Capacity Role | ✅ | select | No | Frontend/Backend/PM/QA/Design/None |
| Monthly Salary | ✅ | number | Yes | |
| Workable Hours | ✅ | number | Yes | |
| Status | ✅ | select | Yes | Active/On Leave/Terminated |
| Cost Per Hour | ✅ (read-only) | number | No | Generated by DB |
| **Department** | ❌ | — | — | **MISSING** — employees have `department_id` FK but form doesn't let you set it |
| **Email / Phone** | ❌ | — | — | Not in the data model but useful |

### C. Form Fields Audit — Department Form
| Field | Present? | Type | Required? | Notes |
|-------|----------|------|-----------|-------|
| Name | ✅ | text | Yes | |
| Manager | ✅ | text | Yes | Free text, not linked to employees |

### C. Form Fields Audit — Role Form
| Field | Present? | Type | Required? | Notes |
|-------|----------|------|-----------|-------|
| Title | ✅ | text | Yes | |
| Department | ✅ | select | Yes | |
| Rate ($/hr) | ✅ | number | Yes | Billable rate |

### ⚠️ Critical Issues
- [ ] P2 — Employee form has no `Department` dropdown — `department_id` is nullable but should be settable
- [ ] P2 — Department manager is free text, not linked to employees. Should be a select.

---

## Route: `/estimation` — Estimation Engine

### A. Business Purpose
Standalone estimation simulator for calculating project costs and margins independent of a deal.

### B. Route & Navigation Correctness
- ✅ Exists at `/estimation`
- ⚠️ **Disconnected from the CRM deal flow** — estimation should primarily happen inside a deal (`/crm/new` or `/crm/[id]`). This standalone version has value as a "what-if" calculator but it's not linked from deal pages.
- ⚠️ No "Save to Deal" or "Start New Deal from Estimation" button

### ⚠️ Critical Issues
- [ ] P2 — Estimation page not linked from CRM deal pages. If a user builds an estimation here, there's no path to convert it into a deal.
- [ ] P3 — The EstimationSimulator component could be embedded in the deal detail page instead of being standalone

---

## Route: `/contracts` — Contracts & Billing

### A. Business Purpose
Manage active contracts, milestones, and client invoices. Core for tracking post-sale revenue.

### B. Route & Navigation Correctness
- ✅ Three tabs: Contracts, Milestones, Invoices
- ✅ Create invoice dialog with proper fields
- ✅ Archive contract and delete invoice have modal confirmations
- ✅ Edit contract status/notes dialog
- ⚠️ No contract detail page (`/contracts/[id]`)
- ⚠️ Milestones have no confirmation on delete (clicking trash immediately deletes)

### C. Form Fields Audit — Create Invoice
| Field | Present? | Type | Required? | Notes |
|-------|----------|------|-----------|-------|
| Contract | ✅ | select | Yes | Only active contracts |
| Issue Date | ✅ | date | Yes | Defaults to today |
| Due Date | ✅ | date | No | |
| Amount | ✅ | number | Yes | |
| Tax | ✅ | number | No | Defaults to 0 |
| Notes | ✅ | text | No | |
| **Milestone** | ❌ | — | — | API supports `milestone_id` but form doesn't offer it |
| **Invoice Number** | ❌ | — | — | Auto-generated by DB sequence |

### C. Form Fields Audit — Create Milestone
| Field | Present? | Type | Required? | Notes |
|-------|----------|------|-----------|-------|
| Contract | ✅ | select | Yes | |
| Milestone Name | ✅ | text | Yes | |
| Due Date | ✅ | date | Yes | |
| Amount | ✅ | number | Yes | |

### D. Workflow Correctness
- ✅ Contracts are only created via `win_deal()` — no manual create button
- ✅ Invoice payment increments `revenue_recognized` atomically
- ✅ Invoice `total` is generated by DB — read-only correctly
- ⚠️ No invoice detail page — can't view invoice history or download PDF (the "Download PDF" button in the dropdown is present but likely non-functional)

### ⚠️ Critical Issues
- [ ] **P1 — No confirmation on milestone delete** — clicking the trash icon immediately deletes without asking
- [ ] P2 — Missing `milestone_id` field in create invoice form
- [ ] P2 — "Download PDF" menu item present but no implementation

---

## Route: `/projects` — Project Delivery

### A. Business Purpose
Track active project status, consumed hours, and budget burn rate. Delivery/Admin roles.

### B. Route & Navigation Correctness
- ✅ KPI cards: Active Projects, Total Budgeted Hours, Total Consumed Hours
- ✅ Burn rate progress bars
- ✅ Status changeable via dropdown (Not Started → On Track → At Risk → Over Budget → Completed)
- ⚠️ No project detail page (`/projects/[id]`)
- ⚠️ Can't see which time entries belong to a project from this page

### D. Workflow Correctness
- ✅ Projects are only created via `win_deal()` — no manual create
- ✅ `consumed_hours` updated by TimeEntry approval
- ⚠️ Can't view project start/end dates from the table (only in the model)

### ⚠️ Critical Issues
- [ ] P2 — No project detail page — can't drill into project to see time entries, assigned team, milestones, etc.
- [ ] P2 — Start/end dates not shown in the project table

---

## Route: `/time-tracking` — Time Entry Logging

### A. Business Purpose
Log hours against active projects to track budget consumption and labor costs. All roles use this.

### B. Route & Navigation Correctness
- ✅ Log Time dialog with employee, project, date, task, hours
- ✅ Recent time entries table
- ✅ KPI cards: Total Hours, Active Projects, Utilization
- ✅ Approval workflow (Draft → Approved)
- ✅ Delete button on entries
- ⚠️ **No confirmation dialog on time entry delete** — unlike every other delete in the app
- ⚠️ **Entries created with status "Approved" directly** — should be "Draft" by default, requiring approval workflow

### C. Form Fields Audit
| Field | Present? | Type | Required? | Notes |
|-------|----------|------|-----------|-------|
| Employee | ✅ | select | Yes | |
| Project | ✅ | select | Yes | |
| Date | ✅ | date | Yes | Defaults to today |
| Task Description | ✅ | text | Yes | |
| Hours | ✅ | number | Yes | Min 0.5, step 0.5 |
| **Billable toggle** | ❌ | — | — | Hardcoded to `true` in code, but API supports it |

### D. Workflow Correctness
- ⚠️ Status hardcoded to `'Approved'` in `handleSaveTime` — skips the entire approval workflow. Should be `'Draft'` or `'Pending'`.
- ✅ Delete button exists but no confirmation

### ⚠️ Critical Issues
- [ ] **P0 — Time entries created as 'Approved' directly** — bypasses the entire approval workflow. Should default to 'Draft'.
- [ ] **P1 — No confirmation on time entry delete** — inconsistent with other delete flows
- [ ] P3 — Billable flag hardcoded to `true` — should be a toggle/checkbox

---

## Route: `/financial` — Financial Performance (P&L)

### A. Business Purpose
Real-time P&L tracking from invoices, time tracking, and overheads. Admin/Executive roles.

### B. Route & Navigation Correctness
- ✅ 4 KPI cards: Revenue, Costs, Operating Profit, Margin
- ✅ Monthly P&L table with all line items
- ✅ CSV export button
- ✅ Computed from real store data
- ⚠️ No period filter (can't filter by quarter or custom date range)

### ⚠️ Critical Issues
- [ ] P2 — No date range filter — always shows all-time P&L
- [ ] P3 — No charts on the financial page itself (only table)

---

## Route: `/forecast` — Scenario Forecasting

### A. Business Purpose
Stress-test the agency's finances against market shocks (utilization drops, delayed deals, new hires).

### B. Route & Navigation Correctness
- ✅ Three sliders: Utilization Drop, Delayed Pipeline Deals, New Hires
- ✅ 6-month projection chart with baseline vs stressed profit
- ✅ Health analysis (Critical/Warning/Healthy)
- ✅ Impact summary card
- ⚠️ Projection uses hardcoded fallback values ($150k revenue, $90k costs) when no P&L data exists — should indicate "insufficient data"

### ⚠️ Critical Issues
- [ ] P2 — Hardcoded fallback values when no P&L data ($150k/$90k) — should show "not enough data" message instead
- [ ] P3 — No way to save a forecast scenario or compare multiple scenarios

---

## Route: `/tenant` — Tenant Management

### A. Business Purpose
Super admin only: create/manage tenants, manage tenant users.

### B. Route & Navigation Correctness
- ✅ Summary cards: Total Tenants, Active, Inactive, Total Users
- ✅ Search bar for filtering tenants
- ✅ Create tenant dialog (name, slug, plan)
- ✅ Edit tenant dialog (all fields + status toggle)
- ✅ Deactivate/reactivate with modal confirmations
- ✅ User count per tenant in table
- ✅ Expandable user list per tenant with create/edit/delete users
- ✅ All destructive actions have modal confirmations

### ⚠️ Critical Issues
- [ ] P2 — No pagination controls visible (API supports it but UI doesn't)
- [ ] P3 — No "Export Tenants" button for reporting

---

## Route: `/profile` — User Profile

### A. Business Purpose
Users can update their own name and email.

### B. Route & Navigation Correctness
- ✅ Accessible from header avatar dropdown
- ✅ Shows current info + edit form
- ✅ Shows read-only role and user ID
- ✅ Updates auth store immediately after save

### C. Form Fields Audit
| Field | Present? | Type | Required? | Notes |
|-------|----------|------|-----------|-------|
| First Name | ✅ | text | Yes | |
| Last Name | ✅ | text | Yes | |
| Email | ✅ | email | Yes | Validates uniqueness |
| **Change Password** | ❌ | — | — | **MISSING** — users need to change the auto-generated password |
| **Current Password** | ❌ | — | — | Needed for email change security |

### ⚠️ Critical Issues
- [ ] **P1 — No change password form** — users get a temporary 8-char password via email and need to change it
- [ ] P2 — No current password requirement when changing email (security gap)

---

## Final Summary — Prioritized Issue Matrix

| Priority | Route | Issue | Impact | Recommendation |
|----------|-------|-------|--------|----------------|
| **P0** | `/crm/[id]` | **No deal detail page exists** | Can't view full deal info, estimation, or P&L per deal | Create `crm/[id]/page.tsx` |
| **P0** | `/time-tracking` | **Entries created as 'Approved' directly** | Approval workflow broken, consumed_hours can't be tracked properly | Change default status to `'Draft'` |
| **P1** | `/crm/new` + `/crm/edit/[id]` | **Missing `client` field** | Can't set client name when creating a deal | Add client input to deal form and schema |
| **P1** | `/contracts` | **No confirmation on milestone delete** | Accidental data loss | Add modal confirmation dialog |
| **P1** | `/time-tracking` | **No confirmation on time entry delete** | Inconsistent UX, accidental data loss | Add modal confirmation dialog |
| **P1** | `/profile` | **No change password form** | Users stuck with temporary password | Add password change form |
| **P2** | `/contracts` | **No invoice `milestone_id` in form** | Invoices can't be linked to milestones | Add optional milestone dropdown |
| **P2** | `/financial` | **No date range filter** | Can't view quarterly/specific period P&L | Add date_from/date_to filters |
| **P2** | `/organization` | **No Department dropdown in employee form** | Can't assign employees to departments | Add department select |
| **P2** | `/estimation` | **Not linked to CRM** | Can't convert estimation to deal | Add "Save to Deal" or link from deal detail |
| **P3** | `/dashboard` | **"Agency Global Dashboard" label** | Misleading in multi-tenant context | Change to "Dashboard" |

---

## Missing Routes

| Missing Route | Why It's Needed | Suggested Path |
|---------------|-----------------|----------------|
| **`/crm/[id]`** | Deal detail view with estimation breakdown, linked contract/project | `app/(dashboard)/crm/[id]/page.tsx` |
| **`/contracts/[id]`** | Contract detail with milestone progress, invoice history | `app/(dashboard)/contracts/[id]/page.tsx` |
| **`/projects/[id]`** | Project detail with time entries, team assignments, budget burn | `app/(dashboard)/projects/[id]/page.tsx` |
| **`/invoices/[id]`** | Invoice detail, payment history, PDF download | `app/(dashboard)/invoices/[id]/page.tsx` |
| **`/organization/employees/[id]`** | Employee detail with linked user, time entries, project assignments | `app/(dashboard)/organization/employees/[id]/page.tsx` |
