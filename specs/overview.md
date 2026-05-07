# anka-frontend — Architecture Overview

## All Pages and Routes

| Route | File | Auth | Notes |
|---|---|---|---|
| `/login` | `(auth)/login/page.tsx` | Public | Full-screen, no sidebar |
| `/dashboard` | `(dashboard)/dashboard/page.tsx` | Member | Main overview |
| `/crm` | `(dashboard)/crm/page.tsx` | Member | Kanban pipeline |
| `/crm/new` | `(dashboard)/crm/new/page.tsx` | Member | Create deal form |
| `/crm/[id]` | `(dashboard)/crm/[id]/page.tsx` | Member | Deal detail |
| `/crm/edit/[id]` | `(dashboard)/crm/edit/[id]/page.tsx` | Member | Edit deal form |
| `/crm/[id]/staffing` | `(dashboard)/crm/[id]/staffing/page.tsx` | Member | AI team staffing |
| `/estimation` | `(dashboard)/estimation/page.tsx` | Member | Estimation Engine |
| `/contracts` | `(dashboard)/contracts/page.tsx` | Member | Contracts, milestones, invoices |
| `/projects` | `(dashboard)/projects/page.tsx` | Member | Project delivery |
| `/time-tracking` | `(dashboard)/time-tracking/page.tsx` | Member | Log & approve hours |
| `/organization` | `(dashboard)/organization/page.tsx` | Member | Dept/role/employee mgmt |
| `/financial` | `(dashboard)/financial/page.tsx` | Member | P&L reporting |
| `/forecast` | `(dashboard)/forecast/page.tsx` | Member | Revenue forecasting |
| `/profile` | `(dashboard)/profile/page.tsx` | Member | User profile settings |
| `/tenant` | `(dashboard)/tenant/page.tsx` | Super-Admin only | Tenant management |
| `/api/ai-team-builder` | `app/api/ai-team-builder/route.ts` | Server | Gemini API proxy |
| `/api/auth/session` | `app/api/auth/session/route.ts` | Server | Cookie management |

---

## Route Protection

Handled in `middleware.ts` via Edge-readable cookies:

| Cookie | Value | Controls |
|---|---|---|
| `__session` | Bearer token | Presence = authenticated |
| `__role` | `super_admin` or `member` | Routes allowed |

- **Unauthenticated** → redirect to `/login`
- **Super admin** → only `/tenant` allowed; blocked from all org routes
- **Member** → all dashboard routes; blocked from `/tenant`

---

## Folder Structure

```
app/
  (auth)/login/               # Public login page
  (dashboard)/
    layout.tsx                # DashboardShell wrapper
    crm/                      # Deal pipeline + detail + edit + staffing
    estimation/               # EstimationSimulator page
    contracts/                # Tabbed contracts/milestones/invoices
    projects/                 # Project list + status management
    time-tracking/            # Time entry log + approval
    organization/             # Dept/roles/employees
    financial/                # P&L
    forecast/                 # Forecasting
    tenant/                   # Super-admin tenant management
  api/
    ai-team-builder/route.ts  # Gemini proxy
    auth/session/route.ts     # Cookie set/get

components/
  ui/                         # 20 shadcn/ui primitives (never modify directly)
  layout/                     # DashboardShell, Sidebar, Header
  providers/                  # AppProviders (QueryClient), AuthInitializer
  crm/                        # KanbanBoard, DealForm, AITeamBuilder, AITeamBuilderResult
  estimation/                 # EstimationSimulator
  tables/                     # TanStack Table wrappers
  charts/                     # Recharts wrappers
  ai-usage/                   # AI usage logging
  PermissionGuard.tsx         # RBAC wrapper — disables + tooltip, never hides
  ProtectedRoute.tsx          # Auth gate

hooks/
  useAuth.ts                  # Login/logout mutations + me query
  useOrganizationSync.ts      # Seeds Zustand businessStore from API on mount
  usePermission.ts            # Returns boolean for permission check

lib/
  api.ts                      # Axios: business data (Bearer + X-Tenant-ID)
  axios.ts                    # Axios: auth endpoints (CSRF / Sanctum)
  calculations.ts             # 5 pure math functions for estimation
  dealsMapper.ts              # snake_case ↔ camelCase for all domain types
  errorHandler.ts             # normalizeError() → NormalizedError
  rbac.ts                     # Role permission matrix
  env.ts                      # Validates & exports env vars
  queries/                    # TanStack Query hooks (one file per module)
  schemas/                    # Zod schemas (one file per module)

store/
  businessStore.ts            # Main Zustand store — NOT persisted
  authStore.ts                # Bearer token in memory — NOT persisted
  tenantStore.ts              # Tenant info — persisted (tenant-storage)
  uiStore.ts                  # Sidebar state — persisted (ui-storage)

types/
  business.ts                 # All domain interfaces
  api.ts                      # PaginatedResponse, ApiError, ValidationErrors
```

---

## Shared Components

| Component | Location | Purpose |
|---|---|---|
| `DashboardShell` | `components/layout/` | Sidebar + Header wrapper |
| `KanbanBoard` | `components/crm/` | Drag-drop deal pipeline |
| `DealForm` | `components/crm/` | Quick create/edit deal form |
| `AITeamBuilder` | `components/crm/` | Gemini-powered team suggestions |
| `AITeamBuilderResult` | `components/crm/` | Accept/reject AI suggestions |
| `EstimationSimulator` | `components/estimation/` | Full estimation calculator UI |
| `PermissionGuard` | `components/` | Wraps elements — disables, never hides |
| `ProtectedRoute` | `components/` | Auth gate component |
| `AppProviders` | `components/providers/` | QueryClientProvider + AuthInitializer |
| `AuthInitializer` | `components/providers/` | Re-hydrates token from cookie on mount |

---

## Auth Flow (Full Sequence)

1. User submits login form → `POST /api/auth/login` via `lib/axios.ts`
2. Server returns Bearer token
3. Token written to httpOnly `__session` cookie via `POST /api/auth/session` (Next.js route)
4. Token also stored in-memory in `authStore` (NOT persisted to localStorage)
5. `AuthInitializer` fires on mount → reads `GET /api/auth/session` → re-hydrates `authStore`
6. Once token in memory, `useAuth` hook fires `GET /api/auth/me` → populates user profile
7. `middleware.ts` reads `__role` cookie (Edge-accessible) for routing decisions
8. 401 from `lib/api.ts` → auto-redirect to `/login`

---

## API Call Layer

### `lib/api.ts` — Business Data
- Base URL: `NEXT_PUBLIC_API_URL`
- Request interceptor: injects `Authorization: Bearer {token}` from `authStore`
- Request interceptor: injects `X-Tenant-ID` from `tenantStore` (skipped for super-admins)
- Response interceptor: 401 → redirect to `/login`, 403 → "Permission denied" toast, 429 → rate limit countdown

### `lib/axios.ts` — Auth Endpoints
- Base URL: `NEXT_PUBLIC_BACKEND_URL/api`
- Handles CSRF via `/sanctum/csrf-cookie`
- Emits `auth-unauthorized` event on 401/419

---

## Global State (businessStore)

The `businessStore` holds all business data in memory. It is **not persisted** — data rehydrates from API on page load via TanStack Query hooks.

**State shape:**
```typescript
{
  departments: Department[];
  roles: Role[];
  employees: Employee[];
  engineers: Engineer[];        // derived: Active employees with capacityRole
  globalOverheads: GlobalOverhead[];
  companySettings: CompanySettings;
  deals: Deal[];
  contracts: Contract[];
  invoices: Invoice[];
  milestones: Milestone[];
  projects: Project[];
  timeEntries: TimeEntry[];
}
```

**Key computed selectors:**
- `getCapacityPool()` → capacity by role (total / soft-booked / hard-booked hours)
- `getFinancialPnL()` → monthly P&L breakdown
- `getDealEstimation(dealId)` → labor, overhead, suggested price, profit for a deal

---

## Query Layer (TanStack Query)

One file per module in `lib/queries/`:

| File | Hooks |
|---|---|
| `deals.ts` | `useDealList`, `useDealDetail`, `useDealMutations` |
| `contracts.ts` | `useContractList`, `useContractDetail`, `useContractMutations` |
| `invoices.ts` | `useInvoiceList`, `useInvoiceDetail`, `useInvoiceMutations` |
| `milestones.ts` | `useMilestoneList`, `useMilestoneMutations` |
| `projects.ts` | `useProjectList`, `useProjectDetail`, `useProjectMutations` |
| `timeEntries.ts` | `useTimeEntryList`, `useTimeEntryMutations` |
| `organization.ts` | `fetchAllOrganizationData`, per-entity CRUD functions |
| `useAuth.ts` | `useAuthQuery`, `loginMutation`, `logoutMutation` |
| `tenant.ts` | Current tenant query |
| `admin.ts` | Super-admin tenant + user management |

All read hooks sync their result into `businessStore` via `useBusinessStore.setState()`.

---

## RBAC System

**5 app roles:** `Admin`, `Executive`, `Sales`, `Delivery`, `HR`

| Role | Key Permissions |
|---|---|
| `Admin` | All |
| `Executive` | view_dashboard, view_reports, manage_tenant, view_projects, view_crm |
| `Sales` | view_crm, manage_crm, manage_estimation, view_contracts |
| `Delivery` | view_projects, manage_projects, track_time |
| `HR` | manage_organization, view_employees, manage_employees |

- Check: `hasPermission(role, permission)` in `lib/rbac.ts`
- Hook: `usePermission(permission)` → boolean
- Component: `<PermissionGuard permission="...">` — **disables + tooltip**, never hides

**2 system roles:** `super_admin` (tenant management only), `member` (all org routes)

---

## Feature Flags

⚠️ **NOT IMPLEMENTED** — No feature flag system exists. All features are always-on per role.
