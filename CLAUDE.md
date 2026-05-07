# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Start dev server (Next.js)
npm run build     # Production build
npm run start     # Start production server
npm run lint      # ESLint (next/core-web-vitals + TypeScript rules)
```

No test runner is configured. There are no automated tests.

## Architecture

**Anka** is an agency management platform (SaaS) with these modules: Organization, CRM/Pipeline, Estimation, Contracts, Projects, Time Tracking, Financials, Forecasting, and Multi-tenancy.

**Stack:** Next.js 16 App Router · React 19 · TypeScript · Tailwind CSS 4 · Zustand 5 · TanStack Query 5 · shadcn/ui · React Hook Form + Zod · Recharts · @hello-pangea/dnd

**All data comes from the Laravel backend API (`anka-api`) via `lib/api.ts`. The frontend never touches Supabase directly.**

### Route groups

```
app/
  (auth)/login/                        # Full-screen login, no sidebar
  (public)/                            # Public-facing pages (no auth required)
  (dashboard)/layout.tsx               # Protected shell: Sidebar + Header + Toaster
  (dashboard)/dashboard/               # Main dashboard overview
  (dashboard)/crm/                     # Sales pipeline (Kanban)
  (dashboard)/crm/[id]/                # Deal detail view
  (dashboard)/crm/[id]/staffing/       # AI team staffing for a deal
  (dashboard)/crm/new/                 # Create new deal
  (dashboard)/crm/edit/[id]/           # Edit existing deal
  (dashboard)/organization/            # Departments, roles, employees, overheads
  (dashboard)/estimation/              # Project estimation builder
  (dashboard)/contracts/               # Contract management
  (dashboard)/projects/                # Project tracking
  (dashboard)/time-tracking/           # Time entry logging
  (dashboard)/financial/               # Financials & P&L
  (dashboard)/forecast/                # Revenue forecasting
  (dashboard)/tenant/                  # Super-admin only: tenant management
  (dashboard)/profile/                 # User profile settings
  api/ai-team-builder/route.ts         # Next.js API route — calls Google Gemini
  api/auth/session/                    # Manages __session + __role httpOnly cookies
```

### State management

Zustand stores in `store/`:

| Store | Persisted | Purpose |
|---|---|---|
| `businessStore.ts` | no | **Primary store** — org data, CRM deals, contracts, projects, time entries, financial calculations |
| `uiStore.ts` | yes (`ui-storage`) | Sidebar collapsed state |
| `authStore.ts` | no | Current user + Bearer token (in-memory only; token is re-hydrated from httpOnly cookie on mount) |
| `tenantStore.ts` | yes (`tenant-storage`) | Active tenant ID + current tenant object |

`businessStore.ts` is the main application state. Key computed selectors: `getCapacityPool()`, `getFinancialPnL()`, `getDealEstimation()`. Mutations follow an optimistic-update + rollback pattern: snapshot state → mutate → call API → on error restore snapshot and toast.

### Auth flow

The Sanctum Bearer token is never stored in `localStorage` or a JS-readable cookie. The full flow:

1. `useAuth` hook's `loginMutation` calls `POST /api/auth/login` via `lib/axios.ts`.
2. On success, the token is written to an httpOnly `__session` cookie (and `__role` cookie) via `POST /api/auth/session` (Next.js route handler).
3. The token is also held in-memory in `authStore` (not persisted) for the current session.
4. On page refresh, `AuthInitializer` (`components/providers/AuthInitializer.tsx`) calls `GET /api/auth/session` to re-hydrate the in-memory store from the cookie.
5. Once the token is in-memory, `useAuth`'s `useQuery` fires `GET /auth/me` to populate the user profile.

`middleware.ts` reads the httpOnly `__role` cookie (Edge-accessible) to route super admins to `/tenant` and block them from org routes without any client JS.

### Two-tier role system

There are two independent role dimensions:

- **`isSuperAdmin` / `systemRole`** — system-level; super admins manage tenants at `/tenant` and cannot access any org routes.
- **`appRole`** — org-level RBAC: `Admin`, `Executive`, `Sales`, `Delivery`, `HR`. Defined in `lib/rbac.ts` with a permissions matrix. Use `hasPermission(role, permission)` to gate features, `usePermission(permission)` hook in components, or wrap elements in `<PermissionGuard permission="...">`.

`PermissionGuard` (`components/PermissionGuard.tsx`) never hides guarded elements — it disables them with a tooltip explaining why, so users can always see that a feature exists.

### API layers

- **`lib/api.ts`** — Laravel backend (`NEXT_PUBLIC_API_URL`). Bearer token from `authStore`, `X-Tenant-ID` header from `tenantStore`. Redirects to `/login` on 401.
- **`lib/axios.ts`** — Same Laravel backend (`NEXT_PUBLIC_BACKEND_URL/api`). Used for auth endpoints (login, logout, /auth/me). Handles CSRF cookie via `/sanctum/csrf-cookie`. Emits `auth-unauthorized` event on 401/419.
- **`app/api/ai-team-builder/route.ts`** — Next.js route handler that calls Google Gemini Flash Lite to suggest team compositions.

### Query layer

`lib/queries/` contains TanStack Query hooks and plain API functions per module:

| File | Module |
|---|---|
| `lib/queries/organization.ts` | Departments, Roles, Employees, Overheads, Company Settings |
| `lib/queries/deals.ts` | CRM Deals |
| `lib/queries/contracts.ts` | Contracts |
| `lib/queries/invoices.ts` | Invoices |
| `lib/queries/projects.ts` | Projects |
| `lib/queries/timeEntries.ts` | Time Entries |
| `lib/queries/milestones.ts` | Contract Milestones |
| `lib/queries/tenant.ts` | Current tenant settings (org members) |
| `lib/queries/admin.ts` | Super-admin: tenant CRUD + user management |
| `lib/queries/useAuth.ts` | Auth query + login/logout mutations |

Organization data is seeded into `businessStore` on page mount via `hooks/useOrganizationSync.ts`, which calls `fetchAllOrganizationData()` from `lib/queries/organization.ts`.

### API response mapping

All snake_case → camelCase conversions live in `lib/dealsMapper.ts`. This file exports typed mapper functions (`toDeal`, `toContract`, `toProject`, `toInvoice`, `toTimeEntry`) and the reverse (`dealToApiPayload`). When adding a new entity, follow this pattern — never convert field names inline in components or query hooks.

### Form validation

`lib/schemas/` contains Zod schemas per module (`deal.schema.ts`, `contract.schema.ts`, `project.schema.ts`, etc.). Use these with React Hook Form's `zodResolver`. Do not define validation logic inline in components.

### Error handling

Use `normalizeError(err)` from `lib/errorHandler.ts` in all catch blocks. It returns a typed `NormalizedError` with a `code` field (`'validation'`, `'conflict'`, `'unauthorized'`, `'server'`, etc.) and a human-readable `message`. For 422 responses it also surfaces a `fields` map for inline form errors. Never access `error.response.data.errors` directly.

### Key utilities

- `lib/utils.ts` — `cn()` = clsx + tailwind-merge (use for all className composition)
- `lib/env.ts` — typed, validated environment variable exports; throws at dev startup if vars are missing
- `lib/calculations.ts` — cost, overhead, buffer, and soft-booking calculations for estimation
- `lib/aiTeamBuilder.ts` — Gemini prompt builder (not a route handler; builds the prompt string)
- `types/business.ts` — canonical domain types for all modules (Role, Department, Deal, Project, etc.)
- `types/api.ts` — shared API response shapes (`PaginatedResponse`, `ApiError`, `ValidationErrors`)

### Provider tree

`components/providers/AppProviders.tsx` wraps the app in `QueryClientProvider` (TanStack Query) and `AuthInitializer`. `AuthInitializer` handles the cookie → in-memory token re-hydration on mount and redirects to `/login` on auth failures. ReactQueryDevtools is included in development only.

### Environment variables

Required in `.env.local`:

```
NEXT_PUBLIC_BACKEND_URL      # Laravel backend base URL
NEXT_PUBLIC_API_URL          # Laravel API base URL (same host + /api)
GEMINI_API_KEY               # Server-side only, for ai-team-builder route
```

### UI conventions

- All UI primitives come from `components/ui/` (shadcn/ui, "new-york" style, neutral palette).
- Path alias `@/` maps to the repo root (configured in `tsconfig.json`).
- Dark mode is supported via the `.dark` class and oklch CSS variables in `globals.css`.
- Icons: Lucide React only.
- Drag-and-drop (CRM Kanban): `@hello-pangea/dnd`.
- Toast notifications: `react-hot-toast` via `<Toaster>` in dashboard layout.
