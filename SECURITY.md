# Security

## Reporting a vulnerability

Open a private GitHub security advisory or email the maintainers directly. Do not file public issues for security reports.

---

## Architecture overview

Anka Frontend is a Next.js 16 App Router application that communicates with two backend services:

- **Laravel 13 (Sanctum)** — primary auth and business API (`NEXT_PUBLIC_BACKEND_URL`)
- **Secondary API** — multi-tenant data API (`NEXT_PUBLIC_API_URL`)

Session tokens are stored in-memory (Zustand) and persisted across page refreshes via a server-set `__session` httpOnly cookie, which is unreadable by JavaScript.

---

## Authentication & session security

| Control | Implementation |
|---|---|
| Token storage | In-memory Zustand state only — never `localStorage` |
| Session persistence | `__session` httpOnly, Secure (prod), SameSite=Lax cookie set by Next.js route handler |
| CSRF protection | Laravel Sanctum CSRF cookie auto-fetched before every mutating request |
| Token refresh | Silent refresh via `/auth/refresh` with request queue to prevent concurrent storms |
| Unauthorized events | `auth-unauthorized` DOM event triggers logout across all in-flight requests |

---

## Multi-tenancy / tenant isolation

The secondary API client (`lib/api.ts`) reads the active tenant ID from `tenantStore` and attaches it as an `X-Tenant-ID` header on every request. If no tenant is selected, the request is rejected client-side before it leaves the browser.

### Backend tenant isolation checklist

These controls are enforced server-side. Frontend header-passing alone is not a security boundary:

- [x] **`BelongsToTenant` model scope audit** — all six tenant-data models (`User`, `Deal`, `Contract`, `Invoice`, `Project`, `TimeEntry`) use the `BelongsToTenant` global scope trait. Cross-tenant reads are structurally impossible without explicitly removing the scope.
- [ ] **Policy authorization** — all resource controllers should verify `$request->user()->tenant_id === $resource->tenant_id` before returning or mutating data. Currently enforced implicitly by the global scope; explicit policy checks are recommended as a secondary control.
- [x] **CORS hardening** (`config/cors.php`) — `allowed_origins` is driven by the `FRONTEND_URL` env var. Production deployments must set this variable. See `SECURITY.md` in anka-api.

---

## Rate limiting

### Frontend handling
Both HTTP clients display a countdown toast on HTTP 429 responses:

- `lib/axios.ts` — uses toast ID `rate-limit-axios`, prefix `"Too many login attempts."`
- `lib/api.ts` — uses toast ID `rate-limit-api`, prefix `"Too many requests."`

The `Retry-After` response header is read to set the countdown duration; defaults to 60 s if absent.

### Laravel throttle middleware — implemented

Applied in `routes/api.php`:

```php
// Brute-force protection on login
Route::post('/login', ...)->middleware('throttle:5,1');

// General authenticated API routes
Route::middleware(['auth:sanctum', 'tenant', 'throttle:60,1'])->group(function () {
    // all other routes
});
```

`Retry-After` is returned automatically by Laravel's throttle middleware and is also exposed via `config/cors.php` `exposed_headers` so the frontend countdown toast can read it cross-origin.

---

## Content Security Policy

CSP is applied via `next.config.ts` security headers to all routes (`source: '/(.*)'`).

| Directive | Value | Reason |
|---|---|---|
| `default-src` | `'self'` | Deny-by-default |
| `script-src` | `'self' 'unsafe-inline'` | Required for Next.js App Router hydration and RSC inline scripts |
| `style-src` | `'self' 'unsafe-inline'` | Required for Tailwind CSS 4 and Radix UI |
| `connect-src` | `'self'` + backend/API/Supabase URLs | Built dynamically from env vars at build time |
| `img-src` | `'self' data: blob:` | Avatar/upload previews |
| `frame-ancestors` | `'none'` | Clickjacking protection (also enforced by `X-Frame-Options: DENY`) |

### Migration path: nonce-based CSP (future)

`'unsafe-inline'` weakens XSS protection. The recommended migration path is:

1. Upgrade to Next.js nonce support (available in Next.js 13.4+ via `headers()` in Middleware)
2. Generate a per-request nonce in `middleware.ts`
3. Pass the nonce via a response header and thread it through `<Script nonce={...}>` and Tailwind's runtime
4. Replace `'unsafe-inline'` with `'nonce-{nonce}'` in `script-src` and `style-src`

This is a significant refactor and should be tracked as a dedicated security sprint.

---

## Input validation

All user-facing forms use centralized Zod schemas from `lib/schemas/`:

| Schema file | Covers |
|---|---|
| `auth.schema.ts` | Login credentials |
| `deal.schema.ts` | CRM deals, ghost roles |
| `organization.schema.ts` | Departments, roles, employees, overheads |
| `invoice.schema.ts` | Invoice creation |
| `contract.schema.ts` | Contract updates |
| `project.schema.ts` | Project updates |
| `timeEntry.schema.ts` | Time entry logging |

Schemas are the single source of truth — no duplicate inline definitions in components.

---

## Sensitive data handling

- `Authorization` header values are never logged (see comment in `lib/axios.ts` request interceptor)
- `GEMINI_API_KEY` is server-side only (`typeof window === 'undefined'` guard in `lib/env.ts`)
- No secrets are written to `localStorage` or `sessionStorage`
- The `__session` cookie is httpOnly — inaccessible to JavaScript

---

## npm dependency audit status

As of the last audit (`npm audit`):

| Package | Severity | Status | Notes |
|---|---|---|---|
| `next` (postcss transitive) | Moderate | No safe fix | Fixing requires downgrading Next to 9.3.3. Accepted risk — Next.js 16.2.4 is the latest stable. |
| `uuid` | Moderate | Requires uuid@14 (breaking) | `uuid` v13 has a missing buffer bounds check in `v3/v5/v6` when `buf` is provided. Anka only uses `v4` (random), so this code path is not exercised. Track upgrade to uuid@14 when the API stabilizes. |
| `postcss` | Moderate | Blocked by `next` transitive dep | Same as the `next` row above. |

Run `npm audit` to check for any newly introduced findings.
