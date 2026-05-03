# ANKA Frontend — Backend Integration Progress

Last updated: 2026-05-02 (Phase 5 added)  
Stack: Next.js 16 · React 19 · TypeScript · Zustand · Supabase · Laravel (planned)

---

## Summary

| Phase | Scope | Status | Branch / PR |
|---|---|---|---|
| Phase 0 | Frontend type fixes | ✅ Merged | PR #2 |
| Phase 1 | Auth & identity | ✅ Merged | PR #3 |
| Phase 2 | Organization module | ✅ Merged | PR #4 |
| Phase 3 | CRM & deals pipeline | ✅ Merged | PR #5 |
| Phase 4 | Win deal flow | ✅ Merged | PR #6 |
| Phase 5 | Contracts, milestones & invoices | ✅ Merged | PR #7 |
| Phase 6 | Projects & time tracking | ✅ Completed | phase-6/projects-time-tracking |
| Phase 7 | Production hardening | ⬜ Not started | — |

---

## ✅ Phase 0 — Frontend Type Fixes (Merged)

Aligned all TypeScript domain types in `types/business.ts` with the `ANKA.sql` schema before any backend wiring. No runtime behavior changed — the point was to eliminate silent mismatches that would have caused DB write failures later.

### Changes Made

**`types/business.ts`**
- `Employee`: added `roleName?: string`, `capacityRole?: RoleType`; annotated `costPerHour` as GENERATED/read-only
- `CompanySettings`: added `employerTaxPercentage` and `benefitsPercentage`
- `GhostRole`: renamed `role` → `roleType` (matches `deal_ghost_roles.role_type` column)
- `HardAssignment`: renamed `engineerId` → `employeeId` (matches `deal_hard_assignments.employee_id`)
- `Deal`: added `workloadDescription`
- `Invoice`: renamed `date` → `issueDate`; added `milestoneId`, `invoiceNumber`, `dueDate`, `total`, `paidAt`, `notes`; extended status to include `Overdue` and `Cancelled`
- `Contract`: added `contractNumber`, `startDate`, `endDate`, `notes`; extended status to include `Cancelled`
- `Project`: added `projectNumber`, `startDate`, `endDate`
- `TimeEntry`: extended status to include `Rejected`; added `approvedAt`, `approvedBy`, `notes`

**`store/businessStore.ts`**
- Renamed `engineerId` → `employeeId` throughout `assignEngineer` and `getCapacityPool`
- Renamed `gr.role` → `gr.roleType` in soft-booking loop
- Renamed `inv.date` → `inv.issueDate` in `getFinancialPnL`
- Added `employerTaxPercentage` and `benefitsPercentage` to `MOCK_SETTINGS`
- P&L revenue now filters to `Paid` invoices only; labor filters to `Approved` entries only
- Removed auto-increment of `consumedHours` from `addTimeEntry` (derived at query time)
- Fixed `getFinancialPnL` return type from `any[]` to explicit shape

**`lib/supabaseOrganization.ts`**
- Added `roleName`, `capacityRole` to `toEmployee` mapper with safe fallbacks
- Added `employerTaxPercentage`, `benefitsPercentage` to `toCompanySettings` mapper with `?? 0` fallback

**`app/(dashboard)/crm/new/page.tsx` & `crm/edit/[id]/page.tsx`**
- `ghostRoleSchema`: renamed `role` → `roleType`; added `id: z.string().optional()` to edit page schema
- All `append({})` calls and form field names updated to `roleType`
- AI team builder result mapping: `engineerId` → `employeeId`

**`app/(dashboard)/contracts/page.tsx`**
- `invoice.date` → `invoice.issueDate`

**`components/crm/AITeamBuilderResult.tsx`**
- `engineerId` → `employeeId` in hard assignment mapping

---

## ✅ Phase 1 — Auth & Identity (Merged)

Replaced the mock login cookie with a real Sanctum-ready auth flow. Two Zustand stores were doing the same job — merged into one. Session guard now actively redirects unauthenticated users server-side (cookie) and client-side (redirect).

### Changes Made

**`store/authStore.ts`** (rewritten)
- New `AuthUser` type: `id`, `firstName`, `lastName`, `email`, `appRole`, `tenant`
- `login()` sets `auth_token` cookie so Next.js `proxy.ts` middleware can read it for server-side route protection
- `logout()` clears the cookie
- `merge()` migration guard: wipes stale persisted user if it's missing `firstName` (old shape), forcing a clean re-login instead of crashing

**`store/useAuthStore.ts`** — deleted (merged into `authStore.ts`)

**`hooks/useAuth.ts`** (rewritten)
- Imports from `store/authStore` only
- `mapApiUser()`: converts snake_case Laravel response (`first_name`, `app_role`) to camelCase `AuthUser`
- `useQuery` for `/auth/me` — only runs when `token` is present
- Sets `activeTenantId` in `tenantStore` on first hydration (skips if already set, preserving manual tenant switches)
- `loginMutation`: CSRF cookie → POST `/auth/login` → map → store hydration
- `logoutMutation`: POST `/auth/logout` → clear store + tenant + query cache (runs even if API fails)

**`app/(auth)/login/page.tsx`** (rewritten)
- Removed mock user, mock token, `document.cookie` assignment
- Calls `useAuth().login({ email, password })` — CSRF + API + store in one step
- API error message shown on email field

**`app/(auth)/layout.tsx`** (new)
- Wraps auth pages with `QueryClientProvider` so `useAuth` (which uses TanStack Query) works on the login page without a prerender crash

**`components/providers/AuthInitializer.tsx`** (rewritten)
- Combined `!token || isError` check into a single `useEffect` → `router.replace('/login')`

**`app/(dashboard)/layout.tsx`**
- Wrapped with `AppProviders` — activates `QueryClientProvider` and `AuthInitializer` on all dashboard pages (was defined but never wired in)

**`components/layout/Header.tsx`** (rewritten)
- Uses `user.firstName`, `user.lastName`, `user.appRole` from merged `AuthUser`
- Logout calls `useAuth().logout()` which hits `POST /auth/logout` before clearing state
- Removed mock tenant seeding `useEffect` — tenant is set from login response

**`components/ProtectedRoute.tsx`**
- `user.roles[]` → `user.appRole` string comparison
- Removed `allowedPermissions` prop (permission checks belong in `lib/rbac.ts`)

---

## ✅ Phase 2 — Organization Module (Merged)

Wires the Organization page to real Supabase data. Mock org arrays removed from store initial state — data now loads from the DB via `useOrganizationSync` on page mount.

> **Prerequisite:** `ANKA.sql` must be applied to the Supabase project before this branch is deployed. The `tenant_id`, `deleted_at`, `role_name`, `capacity_role`, and `department_id` columns must exist.

### Changes Made

**`types/business.ts`**
- `Role`: added `departmentId?: string` (maps to `roles.department_id` FK)

**`lib/supabaseOrganization.ts`** (full upgrade)
- All fetch queries scoped with `.eq('tenant_id', tenantId)` and `.is('deleted_at', null)`
- `company_settings` query uses `.eq('tenant_id', tenantId).maybeSingle()` instead of singleton ID
- All inserts include `tenant_id` in payload
- `insertEmployee` / `updateEmployeeDB`: added `role_name`, `capacity_role`; removed `cost_per_hour` (GENERATED ALWAYS — DB computes it)
- `insertRole` / `updateRoleDB`: added `department_id` FK
- All 4 delete functions converted to soft delete via `deleted_at`
- `upsertCompanySettings`: added `tenant_id`, `employer_tax_percentage`, `benefits_percentage`; uses `{ onConflict: 'tenant_id' }`

**`store/businessStore.ts`**
- Removed `MOCK_DEPARTMENTS`, `MOCK_ROLES`, `MOCK_EMPLOYEES`, `MOCK_OVERHEADS`, `MOCK_SETTINGS` from initial state
- `departments`, `roles`, `employees`, `globalOverheads` start as `[]`
- `companySettings` starts with sensible defaults (overhead 20%, buffer 10%)
- `addRole` / `updateRole`: resolve `departmentId` by looking up loaded departments before writing to DB

**`components/forms/EmployeeForm.tsx`**
- Added `capacityRole` optional field to Zod schema
- Added "Capacity Pool" dropdown (frontend / backend / pm / qa / design / none) next to Billing Role

**`app/(dashboard)/organization/page.tsx`**
- `handleAddEmployee` and `handleEditEmployee`: pass `capacityRole` and `roleName` through to the store so they reach `insertEmployee` / `updateEmployeeDB`

---

## ✅ Phase 3 — CRM & Deals Pipeline (Merged)

Wires the CRM Kanban board to the Laravel deals API. Mock deal data removed from store initial state — deals now load from `GET /api/deals` on page mount. All four deal mutation actions are now async with optimistic update + rollback, matching the pattern used by the org module.

> **Prerequisite:** Laravel must implement the deal endpoints listed below before this branch is deployed. The frontend is ready; it will show an empty board until the API exists.

### Changes Made

**`store/businessStore.ts`**
- Added `import api from '@/lib/api'`
- Removed `MOCK_DEALS` constant; `deals` initial state is now `[]`
- `addDeal`: async — POST `/deals`, optimistic temp-id replaced with DB record on success
- `updateDeal`: async — PUT `/deals/{id}`, optimistic update with rollback on error
- `deleteDeal`: async — DELETE `/deals/{id}`, optimistic remove with rollback on error
- `updateDealStage`: async — PATCH `/deals/{id}/stage`, used by Kanban drag-and-drop
- Updated `BusinessState` interface: all four deal actions now return `Promise<void>`

**`app/(dashboard)/crm/page.tsx`**
- Added `useEffect` that calls `GET /deals` on mount and seeds store via `useBusinessStore.setState`
- Added `toDeal()` mapper: snake_case API response → camelCase `Deal` type
- Added sub-mappers: `toGhostRole`, `toHardAssignment`, `toEstimationResource`, `toProjectOverhead`

### What Still Needs the Backend (Laravel)

**What needs to be built:**

### Backend (Laravel)
- `GET /api/deals` — list all deals for tenant (paginated, filterable)
- `GET /api/deals/{id}` — single deal with eager-loaded relations (ghost_roles, hard_assignments, estimation_resources, deal_overheads)
- `POST /api/deals` — create deal
- `PUT /api/deals/{id}` — update deal fields
- `PATCH /api/deals/{id}/stage` — Kanban drag-and-drop stage update
- `DELETE /api/deals/{id}` — soft delete
- `PUT /api/deals/{id}/estimation` — replace-all estimation resources
- `PUT /api/deals/{id}/overheads` — replace-all deal overheads
- `PUT /api/deals/{id}/ghost-roles` — replace-all ghost roles
- `POST/PUT/DELETE /api/deals/{id}/assignments` — hard assignments per employee

### Frontend
- `store/businessStore.ts`: convert `addDeal`, `updateDeal`, `updateDealStage`, `deleteDeal` from sync mock to async API calls with optimistic rollback
- `app/(dashboard)/crm/page.tsx`: add `useEffect` to fetch deals from API on mount; add `toDeal()` snake_case → camelCase mapper
- Remove `MOCK_DEALS` from store initial state
- Kanban drag-and-drop: no logic changes needed — `updateDealStage` becoming async is enough

---

## ✅ Phase 4 — Win Deal Flow (Merged)

Replaces the mock `winDeal()` implementation with a real `POST /api/deals/{id}/win` API call. The backend delegates to the `win_deal()` PostgreSQL function which handles atomicity, idempotency, and row-locking. The frontend adds `toContract` and `toProject` mappers, then seeds the store with the real contract and project returned by the API.

> **Prerequisite:** Laravel must implement `POST /api/deals/{id}/win` calling `win_deal(deal_id, tenant_id)` before deploying. Do not replicate the DB function logic in PHP.

### Changes Made

**`lib/dealsMapper.ts`**
- Added `toContract(row)`: maps snake_case API contract response to camelCase `Contract` type (`deal_id` → `dealId`, `contract_number` → `contractNumber`, `total_value` → `totalValue`, etc.)
- Added `toProject(row)`: maps snake_case API project response to camelCase `Project` type (`contract_id` → `contractId`, `project_number` → `projectNumber`, `budget_hours` → `budgetHours`, etc.)

**`store/businessStore.ts`**
- `winDeal` interface updated from `void` to `Promise<void>`
- Replaced local mock implementation (random IDs, no persistence) with async `api.post('/deals/{id}/win')`
- Optimistic update: deal status set to `'won'` immediately in UI
- On success: deal replaced with real DB record (includes `won_at`), contract and project appended to store via `toContract`/`toProject` mappers
- On failure: all three store slices (deals, contracts, projects) roll back to pre-call snapshots; toast shows backend error message
- `getCapacityPool()` selector requires no changes — it already switches from ghost-role soft-booking to hard-assignment tracking when `status === 'won'`

### What Still Needs the Backend (Laravel)

- `POST /api/deals/{id}/win` — call `DB::statement('SELECT win_deal(?::uuid, ?::uuid)', [$id, $tenantId])`, return `{deal, contract, project}`
- The `win_deal()` DB function handles the full atomic flow (lock, idempotency check, contract + project creation with auto-numbered sequences)

---

## ✅ Phase 5 — Contracts, Milestones & Invoices (Merged)

Wires the Contracts & Billing page to real API data. Mock contract, invoice, and milestone data removed from store initial state. `addInvoice` is now async with optimistic rollback. New `payInvoice` action handles the mark-paid flow including updating `revenue_recognized` on the contract locally. Overdue detection runs client-side in the mapper.

> **Prerequisite:** Laravel must implement the billing endpoints below. `getFinancialPnL()` already filters for `Paid` invoices and uses `issueDate` (done in Phase 0) — it just needs real data flowing in.

### Changes Made

**`lib/dealsMapper.ts`**
- Added `toInvoice(row)`: snake_case → camelCase `Invoice` mapper; handles `invoice_number`, `issue_date`, `due_date`, `paid_at`, and the `total` GENERATED column
- Overdue detection in mapper: sets `status = 'Overdue'` when `status === 'Pending'` and `due_date` is in the past — no backend computed field needed

**`store/businessStore.ts`**
- Removed `MOCK_CONTRACTS`, `MOCK_INVOICES`, `MOCK_MILESTONES`; all three slices start as `[]`
- `addInvoice` interface updated to `Promise<void>`; implementation now calls `POST /invoices` — omits `total` (GENERATED ALWAYS), uses temp-id optimistic pattern
- New `payInvoice(id)` action: calls `PATCH /invoices/{id}/pay`, optimistically sets status to `Paid`, then on success merges real server record and increments `revenueRecognized` on the matching contract in local state
- Both actions roll back affected slices on failure with backend error message in toast
- Imported `toInvoice` from `lib/dealsMapper`

**`app/(dashboard)/contracts/page.tsx`**
- Added `useEffect` fetching `GET /contracts` and `GET /invoices` in parallel on mount
- "Mark as Paid" dropdown item wired to `store.payInvoice(id)` — only shown for `Pending` and `Overdue` invoices
- Contract table shows `contractNumber` (e.g. `CON-0001`) instead of raw UUID
- Invoice table shows `invoiceNumber` (e.g. `INV-1042`) instead of raw UUID
- Added `Overdue` badge style (red) to the invoice status badge

### What Still Needs the Backend (Laravel)
- `GET /api/contracts`, `PUT /api/contracts/{id}`
- `GET /api/invoices`, `POST /api/invoices`, `PUT /api/invoices/{id}`
- `PATCH /api/invoices/{id}/pay` — set `paid_at`, increment `contracts.revenue_recognized` in a DB transaction
- `GET/POST /api/contracts/{id}/milestones`, `PUT/DELETE /api/milestones/{id}`
- `PATCH /api/milestones/{id}/complete`

---

## ✅ Phase 6 — Projects & Time Tracking (Completed)

**What needs to be built:**

### Backend (Laravel)
- `GET/POST /api/projects`, `PUT /api/projects/{id}`
- `GET/POST /api/time-entries`, `PUT/DELETE /api/time-entries/{id}`
- `POST /api/time-entries/{id}/submit` — Draft → Pending
- `POST /api/time-entries/{id}/approve` — Pending → Approved (manager only)
- `POST /api/time-entries/{id}/reject` — Pending → Rejected
- Project `consumed_hours` must be a computed sum of approved time entries — not maintained by application code (Phase 0 already removed the incorrect auto-increment)

### Frontend
- `store/businessStore.ts`: convert `addTimeEntry` to API call
- `app/(dashboard)/time-tracking/page.tsx`: load real time entries on mount
- `app/(dashboard)/projects/page.tsx`: load real projects on mount; project status badges (On Track / At Risk / Over Budget) already use `consumedHours` vs `budgetHours`

---

## ⬜ Phase 7 — Production Hardening

**What needs to be built:**

### Multi-tenancy
- Laravel `TenantScope` middleware: inject `tenant_id` filter on every model query automatically
- All API controllers: verify `deal.tenant_id === auth.user.tenant_id` before any mutation
- Supabase RLS policies: enable Row Level Security on all 5 org tables; policy: `tenant_id = current_setting('app.tenant_id')::uuid`

### Auth hardening
- Replace `proxy.ts` with a real Next.js `middleware.ts` file (current file is exported as `proxy`, not picked up by Next.js automatically)
- Add token expiry handling: refresh token flow or re-login prompt
- Remove remaining `Math.random()` IDs — all IDs should come from the database

### Error & loading states
- Global error boundary for API failures
- Skeleton loaders on all pages that fetch data (currently only org page has `syncing` state)
- Empty state UI when stores have no data (deals list, projects list, etc.)

### Data integrity
- Replace `Math.random().toString()` IDs with `crypto.randomUUID()` everywhere in store actions
- Validate `X-Tenant-ID` header is present on all `lib/api.ts` requests before they fire
- `useOrganizationSync`: expose `syncing` state to the dashboard shell so a global loading indicator can block navigation until org data is ready

---

## Key Files Reference

| File | Purpose |
|---|---|
| `types/business.ts` | All domain types — source of truth for field names |
| `store/businessStore.ts` | Main app state — org data, CRM, contracts, projects |
| `store/authStore.ts` | Auth session — user, token, cookie sync |
| `lib/supabaseOrganization.ts` | Supabase direct queries for org module |
| `lib/api.ts` | Laravel API client — Bearer token + X-Tenant-ID |
| `lib/axios.ts` | Laravel Sanctum client — CSRF cookie + auth endpoints |
| `hooks/useAuth.ts` | TanStack Query wrapper for /auth/me, login, logout |
| `hooks/useOrganizationSync.ts` | Fetches all org data on mount and seeds Zustand |
| `lib/rbac.ts` | Permission matrix for 5 roles — already complete |
| `app/api/ai-team-builder/route.ts` | Gemini API route for AI staffing suggestions |
| `proxy.ts` | Route protection via auth_token cookie — needs rename to middleware.ts |
