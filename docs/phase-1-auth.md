# Phase 1 — Authentication & Identity

**Effort:** ~2 days  
**Dependency:** Phase 0 complete  
**Why this is Phase 1:** Every protected route, every API call, and every tenant-scoped query depends on a real authenticated user with a real token. Nothing else can be wired until auth works end-to-end.

---

## Business Context

Users log into ANKA as a named employee of an agency. Their `app_role` (Admin / Executive / Sales / Delivery / HR) determines what pages and actions they can access. The platform supports multiple agencies (tenants) — a user belongs to exactly one tenant.

The current mock login assigns the role `Admin` if the email contains "admin", otherwise `Executive`. This must be replaced with real role data from the database.

---

## Current State

| File | What it does today |
|---|---|
| `app/(auth)/login/page.tsx` | Sets a hardcoded cookie, fakes a 1-second delay, assigns role by email string |
| `store/authStore.ts` | Persisted Zustand store — holds `user`, `token`, `isAuthenticated` |
| `store/useAuthStore.ts` | Non-persisted store — holds richer `User` shape matching Laravel `/auth/me` response |
| `lib/axios.ts` | Points to Laravel (`NEXT_PUBLIC_BACKEND_URL`), handles CSRF, fires `auth-unauthorized` event on 401/419 |
| `lib/api.ts` | Points to API (`NEXT_PUBLIC_API_URL`), sends `Authorization: Bearer` + `X-Tenant-ID` header |
| `components/providers/AuthInitializer.tsx` | Calls `useAuth` hook on mount to hydrate `useAuthStore` |

**Problem:** `login/page.tsx` uses `store/authStore.ts` but `lib/api.ts` also imports from `store/authStore.ts` for the Bearer token. Meanwhile `store/useAuthStore.ts` is a separate non-persisted store that holds the richer user object. Two stores for the same concern is confusing — they need to be consolidated.

---

## 1.1 — Laravel Backend: Auth Endpoints

The backend must implement these three endpoints using **Laravel Sanctum**:

### `POST /api/auth/login`

```json
// Request
{ "email": "user@agency.com", "password": "secret" }

// Response 200
{
    "token": "1|abc123...",
    "user": {
        "id": 1,
        "first_name": "Jane",
        "last_name": "Doe",
        "email": "user@agency.com",
        "app_role": "Admin",
        "system_role": "owner",
        "tenant": {
            "id": "a0000000-0000-0000-0000-000000000001",
            "name": "Anka Agency",
            "slug": "anka-agency"
        }
    }
}

// Response 422
{ "message": "The provided credentials are incorrect." }
```

### `GET /api/auth/me`

Returns the currently authenticated user. Called by `AuthInitializer` on every page load to re-hydrate session state after refresh.

```json
// Response 200
{
    "id": 1,
    "first_name": "Jane",
    "last_name": "Doe",
    "email": "user@agency.com",
    "app_role": "Admin",
    "tenant": { "id": "...", "name": "Anka Agency" }
}

// Response 401 — triggers redirect to /login
```

### `POST /api/auth/logout`

Revokes the Sanctum token.

```json
// Response 200
{ "message": "Logged out" }
```

---

## 1.2 — Consolidate Auth Stores

**Goal:** One store, one source of truth for auth state.

`store/authStore.ts` (legacy) has the `login(user, token)` interface that the login page calls. `store/useAuthStore.ts` (new) has the richer User shape with `first_name`, `last_name`, `roles`, `tenant` that `/auth/me` returns.

**Fix — merge into `store/authStore.ts`, expand the User type:**

```ts
// store/authStore.ts — REPLACE the User interface with:
export interface AuthUser {
    id: number;
    firstName: string;
    lastName: string;
    email: string;
    appRole: 'Admin' | 'Executive' | 'Sales' | 'Delivery' | 'HR';
    tenant: {
        id: string;
        name: string;
        slug: string;
    };
}

interface AuthState {
    user: AuthUser | null;
    token: string | null;
    isAuthenticated: boolean;
    login: (user: AuthUser, token: string) => void;
    logout: () => void;
}
```

After this change, `store/useAuthStore.ts` can be deleted — it is replaced by `authStore.ts`.

Update `lib/api.ts` to keep using `authStore` for the Bearer token (no change needed there).

---

## 1.3 — Wire Login Page to Real API

**File:** `app/(auth)/login/page.tsx`

Replace the mock block (lines 43–65) with a real call:

```ts
import axiosClient from '@/lib/axios';
import { csrfCookie } from '@/lib/axios';
import { useTenantStore } from '@/store/tenantStore';

const onSubmit = async (values: LoginFormValues) => {
    setLoading(true);
    try {
        // Step 1: Get CSRF cookie (Sanctum requirement)
        await csrfCookie();

        // Step 2: Login
        const { data } = await axiosClient.post('/auth/login', {
            email: values.email,
            password: values.password,
        });

        // Step 3: Persist token + user
        login(data.user, data.token);

        // Step 4: Set active tenant from the user's tenant
        useTenantStore.getState().setActiveTenant(data.user.tenant.id);

        router.push('/dashboard');
    } catch (err: any) {
        form.setError('email', {
            message: err.response?.data?.message ?? 'Login failed. Check your credentials.',
        });
    } finally {
        setLoading(false);
    }
};
```

Remove the `document.cookie` line — token persistence is handled by Sanctum's httpOnly cookie or the Zustand `auth-storage` localStorage entry.

---

## 1.4 — Wire `AuthInitializer` to `/auth/me`

**File:** `components/providers/AuthInitializer.tsx`

This component runs on every dashboard page mount. It should call `/auth/me` and populate the auth store — or redirect to login if the token is invalid.

```ts
// components/providers/AuthInitializer.tsx
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { useTenantStore } from '@/store/tenantStore';

export function AuthInitializer() {
    const router = useRouter();
    const { token, setUser: login, clearAuth } = useAuthStore(); // adjust to match merged store

    useEffect(() => {
        if (!token) {
            router.replace('/login');
            return;
        }

        api.get('/auth/me')
            .then(({ data }) => {
                login(data, token);
                useTenantStore.getState().setActiveTenant(data.tenant.id);
            })
            .catch(() => {
                clearAuth();
                router.replace('/login');
            });
    }, []);

    return null;
}
```

---

## 1.5 — Logout Flow

**File:** `components/layout/Header.tsx`

The logout action should:
1. Call `POST /api/auth/logout` (revokes Sanctum token)
2. Clear `authStore` + `tenantStore` state
3. Redirect to `/login`

```ts
const handleLogout = async () => {
    try {
        await api.post('/auth/logout');
    } finally {
        useAuthStore.getState().logout();
        useTenantStore.getState().setActiveTenant('');
        router.push('/login');
    }
};
```

---

## 1.6 — Multi-Tenant Login (Future: Tenant Selector)

When a user can belong to multiple tenants (or when the platform onboards multi-org users), the login flow needs a tenant selection step. For now, the user's tenant is set automatically from `data.user.tenant` on login.

If the platform adds a tenant switcher later:
- `useTenantStore` already has `setActiveTenant(id)` and `setTenants(tenants[])`
- `lib/api.ts` already sends `X-Tenant-ID` from `activeTenantId` on every request
- Just call `setTenants(data.tenants)` and render a select dropdown

---

## 1.7 — RBAC Guard on Frontend Routes

**File:** `lib/rbac.ts` — already complete  
**File:** `components/ProtectedRoute.tsx` — wrap pages that need role checks

Example usage in pages:

```ts
// In any page component:
import { useAuthStore } from '@/store/authStore';
import { hasPermission } from '@/lib/rbac';

const { user } = useAuthStore();
if (!hasPermission(user?.appRole, 'manage_crm')) {
    return <div>Access denied</div>;
}
```

The `lib/rbac.ts` permission matrix is already defined. No changes needed there.

---

## Acceptance Criteria

- [ ] `POST /api/auth/login` with valid credentials returns token + user with `app_role` and `tenant`
- [ ] Logging in as `admin@example.com` / `123456` lands on `/dashboard` with real user name in the header
- [ ] Page refresh on `/dashboard` does not redirect to login (session persists via Zustand + token)
- [ ] Page load calls `/auth/me` — expired or missing token redirects to `/login`
- [ ] Logging out calls `/auth/logout`, clears localStorage `auth-storage`, redirects to `/login`
- [ ] `X-Tenant-ID` header is present on all API calls after login
- [ ] Two auth stores removed — only `store/authStore.ts` remains
- [ ] `store/useAuthStore.ts` file deleted
