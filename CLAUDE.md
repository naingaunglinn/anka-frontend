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
  (auth)/login/          # Full-screen login, no sidebar
  (dashboard)/layout.tsx # Protected shell: Sidebar + Header + Toaster
  (dashboard)/crm/       # Sales pipeline (Kanban + AI staffing)
  (dashboard)/organization/
  (dashboard)/financial/
  … (10 more modules)
  api/ai-team-builder/route.ts  # Only custom API route — calls Google Gemini
```

### State management

Four Zustand stores in `store/`:

| Store | Persisted | Purpose |
|---|---|---|
| `businessStore.ts` | no | **Primary store** — org data, CRM deals, contracts, projects, time entries, financial calculations |
| `uiStore.ts` | yes (`ui-storage`) | Sidebar collapsed state |
| `useAuthStore.ts` | no | Current user + auth state (active) |
| `authStore.ts` | yes (`auth-storage`) | Legacy auth store — do not use for new code |
| `tenantStore.ts` | no | Active tenant ID for multi-tenancy |

`businessStore.ts` is the main application state. Key computed selectors: `getCapacityPool()`, `getFinancialPnL()`, `getDealEstimation()`. Mutations follow an optimistic-update + rollback pattern: snapshot state → mutate → call API → on error restore snapshot and toast.

### API layers

One HTTP client handles all backend traffic:

- **`lib/api.ts`** — Laravel backend (`NEXT_PUBLIC_API_URL`). Bearer token from `useAuthStore`, `X-Tenant-ID` header from `tenantStore`. Redirects to `/login` on 401.
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

Organization data is seeded into `businessStore` on page mount via `hooks/useOrganizationSync.ts`, which calls `fetchAllOrganizationData()` from `lib/queries/organization.ts`.

### Auth & RBAC

Login is currently mocked (`app/(auth)/login/page.tsx` sets a cookie directly). `useAuth` hook (React Query) fetches `/auth/me` to hydrate `useAuthStore`.

`lib/rbac.ts` defines a permissions matrix for five roles: `Admin`, `Executive`, `Sales`, `Delivery`, `HR`. Use `hasPermission(role, permission)` to gate features.

### Key utilities

- `lib/utils.ts` — `cn()` = clsx + tailwind-merge (use for all className composition)
- `lib/calculations.ts` — cost, overhead, buffer, and soft-booking calculations for estimation
- `lib/aiTeamBuilder.ts` — Gemini prompt builder (not a route handler; builds the prompt string)
- `types/business.ts` — canonical domain types for all modules (Role, Department, Deal, Project, etc.)
- `types/aiTeamBuilder.ts` — AI team builder input/output types

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
