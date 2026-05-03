# Phase 7 — Production Hardening

**Effort:** ~3 days  
**Dependency:** Phases 1–6 complete  
**Why last:** Hardening before the feature set is stable wastes effort. Do it once the data flows are confirmed correct, then lock them down.

---

## Business Context

ANKA is a multi-tenant SaaS platform. A single database stores data from multiple independent agencies. A bug in tenant isolation means Agency A could see Agency B's deals, contracts, and employee data — a serious data breach. Production hardening ensures every query is scoped, every action is authorized, and the system handles load gracefully.

---

## 7.1 — Multi-Tenancy: Enforce Tenant Scope Everywhere

### Laravel Middleware

Add a `TenantScope` middleware that runs on all API routes:

```php
// app/Http/Middleware/TenantScope.php

public function handle(Request $request, Closure $next)
{
    $tenantId = $request->header('X-Tenant-ID');
    
    if (!$tenantId) {
        return response()->json(['message' => 'Tenant ID required'], 400);
    }
    
    // Verify the authenticated user belongs to this tenant
    if (auth()->user()->tenant_id !== $tenantId) {
        return response()->json(['message' => 'Forbidden'], 403);
    }
    
    // Set on request for controllers to use
    $request->merge(['tenant_id' => $tenantId]);
    
    return $next($request);
}
```

Apply to every resource route group. Never accept `tenant_id` from the request body — always take it from the header (which is validated against the authenticated user).

### Laravel Global Scope

Use an Eloquent global scope so tenant filtering is automatic on every model query:

```php
// app/Models/Scopes/TenantScope.php

class TenantScope implements Scope
{
    public function apply(Builder $builder, Model $model)
    {
        $tenantId = request()->header('X-Tenant-ID');
        if ($tenantId) {
            $builder->where($model->getTable() . '.tenant_id', $tenantId);
        }
    }
}
```

Apply to every model that has `tenant_id`: `Deal`, `Contract`, `Project`, `Employee`, `TimeEntry`, `Invoice`, `Milestone`, `Department`, `Role`, `GlobalOverhead`, `CompanySettings`.

---

## 7.2 — Supabase Row Level Security (RLS)

Enable RLS on all tables in Supabase that are accessed by the frontend directly (Organization module):

```sql
-- Enable RLS on all org tables
ALTER TABLE departments     ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees       ENABLE ROW LEVEL SECURITY;
ALTER TABLE global_overheads ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_settings ENABLE ROW LEVEL SECURITY;
```

**Policy strategy for frontend Supabase direct access:**

The frontend uses the Supabase anon key. RLS policies should restrict reads/writes to the authenticated tenant's data only.

If using Supabase Auth alongside Laravel Auth, set a custom JWT claim for `tenant_id`:

```sql
-- Policy example using custom JWT claim
CREATE POLICY "tenant_read" ON departments
    FOR SELECT
    USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

CREATE POLICY "tenant_write" ON departments
    FOR ALL
    USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
```

If not using Supabase Auth (frontend uses Laravel Sanctum only), use the **service role key** server-side for org operations and disable anon key access to these tables entirely.

---

## 7.3 — RBAC: Server-Side Permission Enforcement

**File:** `lib/rbac.ts` — already defines the permission matrix

The frontend currently uses `hasPermission(role, permission)` for UI gating only. The backend must enforce these same permissions on every endpoint.

### Laravel RBAC Middleware

```php
// app/Http/Middleware/CheckPermission.php

public function handle(Request $request, Closure $next, string $permission)
{
    $user = auth()->user();
    $role = $user->app_role;
    
    $permissions = [
        'Admin'     => ['*'],
        'Executive' => ['view_dashboard', 'view_reports', 'manage_tenant', 'view_projects', 'view_crm'],
        'Sales'     => ['view_crm', 'manage_crm', 'manage_estimation', 'view_contracts'],
        'Delivery'  => ['view_projects', 'manage_projects', 'track_time'],
        'HR'        => ['manage_organization', 'view_employees', 'manage_employees'],
    ];
    
    $allowed = $permissions[$role] ?? [];
    
    if (!in_array('*', $allowed) && !in_array($permission, $allowed)) {
        return response()->json(['message' => 'Forbidden'], 403);
    }
    
    return $next($request);
}
```

Apply per route group:

```php
Route::middleware(['auth:sanctum', 'tenant', 'permission:manage_crm'])
    ->group(function () {
        Route::post('/deals', [DealController::class, 'store']);
        Route::put('/deals/{id}', [DealController::class, 'update']);
        Route::delete('/deals/{id}', [DealController::class, 'destroy']);
    });

Route::middleware(['auth:sanctum', 'tenant', 'permission:track_time'])
    ->group(function () {
        Route::post('/time-entries', [TimeEntryController::class, 'store']);
        Route::patch('/time-entries/{id}/submit', [TimeEntryController::class, 'submit']);
    });
```

---

## 7.4 — Soft Delete Consistency

All tables with `deleted_at` must be filtered in every query. In Laravel, use `SoftDeletes` trait on every model:

```php
use Illuminate\Database\Eloquent\SoftDeletes;

class Deal extends Model
{
    use SoftDeletes;
}
```

This automatically adds `WHERE deleted_at IS NULL` to all Eloquent queries and provides `restore()` and `forceDelete()` methods.

Apply to: `Deal`, `Contract`, `Project`, `Employee`, `Role`, `Department`, `GlobalOverhead`, `Invoice`.

---

## 7.5 — Input Validation (Laravel Form Requests)

Every API endpoint must validate its input before touching the database. Use Laravel Form Requests:

```php
// Example: StoreDealRequest
class StoreDealRequest extends FormRequest
{
    public function rules(): array
    {
        return [
            'name'              => ['required', 'string', 'max:255'],
            'client'            => ['nullable', 'string', 'max:255'],
            'estimated_value'   => ['nullable', 'numeric', 'min:0'],
            'win_probability'   => ['required', 'integer', 'between:0,100'],
            'status'            => ['required', Rule::in(['lead','inquiry','opportunity','proposal','contract','won','lost'])],
            'target_margin'     => ['nullable', 'numeric', 'between:0,100'],
        ];
    }
}
```

Key validations by module:
- `hours` on time entries: `required|numeric|min:0.01` (mirrors DB `CHECK (hours > 0)`)
- `status` on deals: `in:lead,inquiry,opportunity,proposal,contract,won,lost`
- `status` on invoices: `in:Draft,Pending,Paid,Overdue,Cancelled`
- `capacity_role` on employees: `in:frontend,backend,pm,qa,design`
- `amount`, `cost`, `rate`: `numeric|min:0`

---

## 7.6 — API Error Response Format

Standardize error responses so the frontend error handling is consistent:

```json
// 422 Validation Error
{
    "message": "The given data was invalid.",
    "errors": {
        "hours": ["The hours field must be greater than 0."],
        "status": ["The selected status is invalid."]
    }
}

// 404 Not Found
{
    "message": "Deal not found."
}

// 403 Forbidden
{
    "message": "You do not have permission to perform this action."
}

// 409 Conflict
{
    "message": "Invoice is not in Pending status."
}
```

Laravel's default JSON error format matches this. Add a `Handler.php` exception handler to ensure 404s on model not found return JSON (not HTML).

---

## 7.7 — Pagination

All list endpoints should return paginated results once data grows beyond hundreds of records:

```
GET /api/deals?page=1&per_page=20
```

Response structure:

```json
{
    "data": [...],
    "meta": {
        "current_page": 1,
        "last_page": 5,
        "per_page": 20,
        "total": 98
    }
}
```

For now, the frontend loads all data into Zustand on page mount. When pagination is added, update the store to append or replace based on page.

---

## 7.8 — API Rate Limiting

Protect against abuse and accidental loops:

```php
// routes/api.php
Route::middleware(['throttle:api'])->group(function () {
    // all protected routes
});
```

Default `throttle:api` = 60 requests/minute per user. Adjust for the AI team builder route which calls Gemini externally.

---

## 7.9 — Audit Log (Optional but Recommended)

For financial records (invoices, contracts), log every status change:

Key events to log:
- Invoice: `Draft → Pending → Paid / Cancelled`
- Contract: `Draft → Active → Completed / Cancelled`
- Time Entry: `Draft → Pending → Approved / Rejected`
- Deal: `any → won` or `any → lost`

A simple `audit_logs` table with `(entity_type, entity_id, action, actor_user_id, old_value, new_value, created_at)` is sufficient.

---

## 7.10 — Environment & Secrets Checklist

Before production deployment:

| Variable | Location | Notes |
|---|---|---|
| `GEMINI_API_KEY` | Server-side only (`.env`) | Never in `NEXT_PUBLIC_*` |
| `SUPABASE_SERVICE_KEY` | Server-side only | For service-level Supabase operations |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client-safe | Only for public/RLS-protected reads |
| `APP_KEY` | Laravel `.env` | Generate with `php artisan key:generate` |
| `DB_*` | Laravel `.env` | Never commit to repo |
| `SANCTUM_STATEFUL_DOMAINS` | Laravel `.env` | Set to your frontend domain |
| `SESSION_DOMAIN` | Laravel `.env` | Set to your domain for CSRF cookies |

---

## 7.11 — Frontend: Remove All Mock Data Constants

**File:** `store/businessStore.ts`

Final cleanup — all mock constants should be removed:

```ts
// DELETE all of these:
const INITIAL_ENGINEERS: Engineer[] = [...]
const MOCK_DEPARTMENTS: Department[] = [...]
const MOCK_ROLES: Role[] = [...]
const MOCK_EMPLOYEES: Employee[] = [...]
const MOCK_OVERHEADS: GlobalOverhead[] = [...]
const MOCK_SETTINGS: CompanySettings = {...}
const MOCK_DEALS: Deal[] = [...]
const MOCK_CONTRACTS: Contract[] = [...]
const MOCK_INVOICES: Invoice[] = [...]
const MOCK_MILESTONES: Milestone[] = [...]
const MOCK_PROJECTS: Project[] = [...]
const MOCK_TIME_ENTRIES: TimeEntry[] = [...]
```

Replace all initial state values with empty arrays. The API calls on page mount will populate the store.

---

## 7.12 — Loading States

Each page currently renders from Zustand synchronously (mock data is always present). Once API calls are async, add loading skeletons:

```ts
// Add to businessStore state:
isLoadingDeals: boolean;
isLoadingContracts: boolean;
isLoadingProjects: boolean;
isLoadingTimeEntries: boolean;
```

Set to `true` before fetch, `false` after. Render skeleton cards in the Kanban board and tables while loading.

---

## Acceptance Criteria

- [ ] A user from Tenant A cannot see any data from Tenant B even with a valid token
- [ ] A `Sales` role user cannot access `PUT /api/employees` (returns 403)
- [ ] A `Delivery` role user cannot create deals (returns 403)
- [ ] Deleting a deal with a linked contract returns 409 (or disables the delete button)
- [ ] All list endpoints return empty arrays for a new tenant (no data leaks from seed data)
- [ ] `GEMINI_API_KEY` is not exposed in any browser network requests
- [ ] `npm run build` completes with zero TypeScript errors
- [ ] `npm run lint` passes with zero warnings
- [ ] All mock data constants removed from `businessStore.ts`
- [ ] Loading skeletons show on each page while API data is fetching
- [ ] Page refresh on any dashboard route correctly reloads real data (no mock fallback)
