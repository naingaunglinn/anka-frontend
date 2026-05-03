# ANKA Platform — Backend Integration Roadmap

## What This Is

This directory contains the full analysis of the ANKA frontend codebase against the `ANKA.sql` PostgreSQL schema. Each phase document is an actionable checklist for connecting the frontend to the real Laravel + Supabase backend.

The frontend is production-grade UI that is entirely functional today using mock/Zustand state. The goal is to replace mock data layer-by-layer without breaking the UI at any point.

---

## Current State Snapshot

| Layer | Technology | Status |
|---|---|---|
| Auth | Mock cookie + localStorage | ❌ Not wired |
| Organization (Dept / Roles / Employees / Overheads / Settings) | Supabase JS direct | ⚠️ Wired but has gaps |
| CRM / Deals | Zustand mock only | ❌ Not wired |
| Estimation / Ghost Roles / Assignments | Zustand mock only | ❌ Not wired |
| Contracts | Zustand mock only | ❌ Not wired |
| Milestones | Zustand mock only | ❌ Not wired |
| Invoices | Zustand mock only | ❌ Not wired |
| Projects | Zustand mock only | ❌ Not wired |
| Time Tracking | Zustand mock only | ❌ Not wired |
| Financial P&L | Computed from mock invoices/entries | ❌ Not wired |
| RBAC | Defined, not enforced server-side | ⚠️ Partial |
| Multi-tenancy | `X-Tenant-ID` header sent | ⚠️ Not enforced |

---

## Phase Order and Dependencies

```
Phase 0 → Type Fixes (unblocks everything else)
    ↓
Phase 1 → Auth & Identity (gate for all protected routes)
    ↓
Phase 2 → Organization Module (master data: roles, employees, settings)
    ↓
Phase 3 → CRM & Deals (core sales pipeline)
    ↓
Phase 4 → Win Deal Flow (handoff: Sales → Delivery)
    ↓
Phase 5 → Contracts, Milestones & Invoices (billing cycle)
    ↓
Phase 6 → Projects & Time Tracking (delivery execution)
    ↓
Phase 7 → Production Hardening (multi-tenancy, RLS, RBAC, performance)
```

Each phase is independent enough to ship and test without completing the next one. The frontend will remain functional on mock data for any module not yet wired.

---

## Phase Documents

| File | Scope | Effort |
|---|---|---|
| [phase-0-type-fixes.md](./phase-0-type-fixes.md) | Frontend-only fixes before any backend work | ~1 day |
| [phase-1-auth.md](./phase-1-auth.md) | Login, token, user session, tenant selection | ~2 days |
| [phase-2-organization.md](./phase-2-organization.md) | Dept / Roles / Employees / Overheads / Settings | ~1 day |
| [phase-3-crm-deals.md](./phase-3-crm-deals.md) | Deals CRUD, Kanban, Estimation, Ghost Roles | ~3 days |
| [phase-4-win-deal.md](./phase-4-win-deal.md) | Win Deal atomic flow → Contract + Project auto-create | ~1 day |
| [phase-5-contracts-billing.md](./phase-5-contracts-billing.md) | Contracts, Milestones, Invoices, P&L | ~3 days |
| [phase-6-projects-time.md](./phase-6-projects-time.md) | Projects, Time Entries, Approval Workflow | ~2 days |
| [phase-7-production.md](./phase-7-production.md) | Multi-tenancy RLS, RBAC, hardening, performance | ~3 days |

---

## Key Architectural Rules (read before coding)

1. **Never insert `cost_per_hour`** — it is `GENERATED ALWAYS` in Postgres from `monthly_salary / workable_hours`. The column is read-only from the application side.
2. **Never insert `invoices.total`** — it is `GENERATED ALWAYS` as `amount + tax`.
3. **`win_deal()` is a DB function** — call it via Laravel, do not replicate its logic in PHP. It is idempotent and row-locked.
4. **`consumed_hours` must increment exactly once per approval** — check `status = 'Pending'` before incrementing. Never use a DB trigger for this — the schema comments explicitly warn against it.
5. **Tenant scope every query** — every backend query must filter `WHERE tenant_id = ?` from the `X-Tenant-ID` request header.
6. **Soft deletes everywhere** — tables with `deleted_at` must never be hard-deleted. Always `WHERE deleted_at IS NULL` in selects.
7. **`company_settings.id = 'singleton'`** is a prototype shortcut. Multi-tenant production uses `id = tenant_id::text`.

---

## Environment Variables Required

```env
# .env.local

NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000   # Laravel (Sanctum auth)
NEXT_PUBLIC_API_URL=http://localhost:8000       # Laravel REST API
GEMINI_API_KEY=                                  # Server-side only
```

> `NEXT_PUBLIC_BACKEND_URL` and `NEXT_PUBLIC_API_URL` point to the same Laravel server. `axios.ts` uses the former for CSRF + auth routes, `api.ts` uses the latter for all resource routes with Bearer token.
