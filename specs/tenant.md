# anka-frontend — Tenant Module Spec

## Pages

| Page | File | Purpose |
|---|---|---|
| Tenant / Admin | `app/(dashboard)/tenant/page.tsx` | Org tenant settings (member view) OR full tenant management (super admin view) |

The same route renders two completely different UIs based on `authStore.user.isSuperAdmin`.

---

## Org User View (`OrgTenantSettings`)

Accessible by any authenticated org member. Allows editing own organization's name and slug.

### Data Fetched

| Hook | Endpoint | Purpose |
|---|---|---|
| `useTenantSettings()` | GET `/api/tenant` | Current tenant data |

### Organization Profile Card

Editable fields:
| Field | Notes |
|---|---|
| Organization Name | text input, synced from `tenantQuery.data.name` |
| Tenant Slug | text input with `.anka.app` suffix display; synced from `tenantQuery.data.slug` |
| Plan | read-only; shows `tenantQuery.data.plan ?? 'Free'` |

"Save Profile" → `updateTenant.mutateAsync({ name, slug })` → `PUT /api/tenant`. Shows toast on success or failure.

### Tenant Information Card (read-only)

Displays Tenant ID (monospace) and Active/Inactive status indicator.

---

## Super Admin View (`SuperAdminTenantManagement`)

Only visible when `authStore.user.isSuperAdmin === true`. Full CRUD over all tenants + user management per tenant.

### Data Fetched

| Hook | Endpoint | Purpose |
|---|---|---|
| `useAdminTenantList()` | GET `/api/admin/tenants` | All tenants (paginated 50) |
| `useAdminTenantUsers(tenantId)` | GET `/api/admin/tenants/{id}/users` | Per-tenant user list (loaded on expand) |

### Summary KPI Cards (4 cards)

| Card | Calculation |
|---|---|
| Total Tenants | `tenants.length` |
| Active | count where `isActive === true` (emerald) |
| Inactive | count where `isActive === false` (rose) |
| Total Users | `sum(tenant.usersCount)` (blue) |

### Tenant Search

Client-side filter by name or slug via `searchQuery` state. No API call on search.

### Tenant Table

**Columns:**
| Column | Notes |
|---|---|
| (expand chevron) | click row to expand/collapse user panel |
| Organization | name (bold) + short UUID (monospace) |
| Slug | |
| Plan | badge: `free`, `pro`, `enterprise` |
| Users | count with Users icon |
| Status | Active (emerald dot) / Inactive (slate dot) |
| Created | formatted date |
| Actions | Edit (pencil) + Deactivate/Reactivate (PowerOff/Power icon) |

**Row click:** Toggles expanded user sub-panel (`TenantUsersPanel`).

### Tenant Actions

| Action | Trigger | API Call |
|---|---|---|
| Create Tenant | "New Tenant" button | `createTenant.mutateAsync()` → POST `/api/admin/tenants` |
| Edit Tenant | Pencil icon | Dialog → `updateTenant.mutateAsync()` → PUT `/api/admin/tenants/{id}` |
| Deactivate | PowerOff icon (active tenants only) | Confirm → `deactivateTenant.mutateAsync(id)` → DELETE `/api/admin/tenants/{id}` |
| Reactivate | Power icon (inactive tenants only) | Confirm → `updateTenant.mutateAsync({ isActive: true })` → PUT `/api/admin/tenants/{id}` |

**Create Tenant Dialog fields:**
| Field | Notes |
|---|---|
| Organization Name | required text |
| Slug | required; shown with `.anka.app` suffix |
| Plan | select: Free, Pro, Enterprise |

**Edit Tenant Dialog fields:**
| Field | Notes |
|---|---|
| Organization Name | text |
| Slug | text with suffix |
| Plan | select: Free, Pro, Enterprise |
| Status | select: Active / Inactive |

---

### Per-Tenant User Panel (`TenantUsersPanel`)

Rendered as an expanded table row. Loads `useAdminTenantUsers(tenantId)` on expand.

**User columns:** Name, Email, Role (badge), Actions (edit pencil + delete trash)

**Add User Dialog fields:**
| Field | Required | Notes |
|---|---|---|
| First Name | ✅ | |
| Last Name | ✅ | |
| Email | ✅ | must be globally unique |
| Role | ✅ | select: Admin, Executive, Sales, Delivery, HR |

`createUser.mutateAsync({ tenantId, payload })` → POST `/api/admin/tenants/{id}/users`

On success: shows toast with the generated password for 8 seconds (`duration: 8000`). This is the only time the password is visible to the super admin.

**Edit User Dialog fields:** First Name, Last Name, Email, Role (same selects)

**Delete User:** Confirmation dialog → `deleteUser.mutateAsync({ tenantId, userId })`

---

### AI Usage Panel (`AdminAIUsagePanel`)

Rendered below the tenant table in the super admin view. Loads `GET /api/admin/ai-usage` and shows usage aggregated by tenant:

| Column | Notes |
|---|---|
| Tenant | tenant name |
| Calls | total AI calls |
| Input Tokens | total input tokens |
| Output Tokens | total output tokens |
| Est. Cost (USD) | total estimated cost |

Plus a totals row at the top.

**Component file:** `components/ai-usage/AIUsageDashboard.tsx`

---

## API Calls

| Action | Hook | HTTP | Endpoint |
|---|---|---|---|
| Load own tenant | `useTenantSettings()` | GET | `/api/tenant` |
| Update own tenant | `updateTenant.mutateAsync()` | PUT | `/api/tenant` |
| List all tenants | `useAdminTenantList()` | GET | `/api/admin/tenants` |
| Create tenant | `createTenant.mutateAsync()` | POST | `/api/admin/tenants` |
| Update tenant | `updateTenant.mutateAsync()` | PUT | `/api/admin/tenants/{id}` |
| Deactivate tenant | `deactivateTenant.mutateAsync()` | DELETE | `/api/admin/tenants/{id}` |
| List tenant users | `useAdminTenantUsers(id)` | GET | `/api/admin/tenants/{id}/users` |
| Create user | `createUser.mutateAsync()` | POST | `/api/admin/tenants/{id}/users` |
| Update user | `updateUser.mutateAsync()` | PUT | `/api/admin/tenants/{id}/users/{userId}` |
| Delete user | `deleteUser.mutateAsync()` | DELETE | `/api/admin/tenants/{id}/users/{userId}` |
| AI usage stats | `AdminAIUsagePanel` internal | GET | `/api/admin/ai-usage` |

---

## Route Access Control

`middleware.ts` gates `/tenant`:
- Super admins: can only access `/tenant` (blocked from all other dashboard routes)
- Org members: can access `/tenant` but `isSuperAdmin === false` → see org settings view

The page-level code (`TenantPage`) does a second check: `isSuperAdmin ? <SuperAdminTenantManagement /> : <OrgTenantSettings />`.
