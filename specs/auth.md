# anka-frontend — Auth Module Spec

## Pages

| Page | File | Purpose |
|---|---|---|
| Login | `app/(auth)/login/page.tsx` | Full-screen login form; no sidebar |
| Profile | `app/(dashboard)/profile/page.tsx` | Edit own name/email + change password |

---

## Login Page (`/login`)

**File:** `app/(auth)/login/page.tsx`

Full-screen card with blurred gradient background. Uses React Hook Form + Zod (`loginSchema` from `lib/schemas/auth.schema.ts`). Validation mode: `onBlur` + `reValidateMode: onChange`.

### Form Fields

| Field | Type | Required | Validation |
|---|---|---|---|
| Email | email input | ✅ | valid email format |
| Password | password input | ✅ | non-empty |

### Submit Behavior

1. Calls `login({ email, password })` from `useAuth`.
2. On success: checks `authStore.user.isSuperAdmin`.
   - Super admin → redirect to `/tenant`
   - Org user → redirect to `/dashboard`
3. On error: sets `form.setError('email')` with the API error message (no separate error state).

### Auth flow (full sequence)

1. `login` mutation → `POST /api/auth/login` via `lib/axios.ts`
2. Response: `{ user, token }`
3. Token written to httpOnly `__session` cookie + `__role` cookie via `POST /api/auth/session` (Next.js route)
4. Token also stored in-memory in `authStore` (NOT in localStorage)
5. On page refresh: `AuthInitializer` fires → `GET /api/auth/session` → re-hydrates `authStore`
6. Once token is in-memory: `useAuth` fires `GET /auth/me` → populates user profile in `authStore`

---

## Profile Page (`/profile`)

**File:** `app/(dashboard)/profile/page.tsx`

Three sections: Personal Information, Account Details (read-only), and Change Password. Does NOT use React Hook Form — manages form state with `useState`. Validates inline before submit.

### Personal Information

| Field | Required | Validation |
|---|---|---|
| First Name | ✅ | non-empty |
| Last Name | No | optional |
| Email | ✅ | valid email regex |

**Submit:** `PUT /auth/profile` via `lib/axios.ts`

On success: refreshes `authStore` with updated user data via `authStore.login(updatedUser, token)`. Does NOT redirect.

### Account Details (read-only)

| Field | Value |
|---|---|
| Role | `user.appRole` |
| User ID | `user.id` (monospace) |

### Change Password

| Field | Required | Validation |
|---|---|---|
| Current Password | ✅ | non-empty |
| New Password | ✅ | min 8 chars |
| Confirm New Password | ✅ | must match new password |

Password fields have toggle show/hide (Eye / EyeOff icons).

**Submit:** `POST /auth/password` via `lib/axios.ts`

On success: clears all password fields, shows success toast. Does NOT log user out — they must log in again to pick up the change.

On 422: surfaces inline field errors (`current_password`, `new_password`).

---

## Route Protection

**File:** `middleware.ts`

Reads httpOnly `__role` cookie (Edge-accessible, not JS-readable) on every request:

| Condition | Action |
|---|---|
| No `__session` cookie | Redirect to `/login` |
| `__role` = `super_admin` | Allow `/tenant`; block all other dashboard routes |
| `__role` = `member` | Allow all dashboard routes; block `/tenant` |

⚠️ The middleware runs at the Edge and cannot read the Bearer token directly — it only reads `__role` to make routing decisions.

---

## Session Cookie Management

**File:** `app/api/auth/session/route.ts`

| Method | Purpose |
|---|---|
| `POST /api/auth/session` | Set `__session` + `__role` httpOnly cookies after login |
| `GET /api/auth/session` | Read `__session` cookie value → return token to `AuthInitializer` |

Cookies are httpOnly (not readable by JS) to prevent XSS token theft.

---

## Stores Involved

| Store | Purpose |
|---|---|
| `authStore` | Holds `user` object + `token` in-memory; NOT persisted |
| `tenantStore` | Holds `tenantId` + tenant object; persisted in `tenant-storage` |

`AuthInitializer` (`components/providers/AuthInitializer.tsx`) re-hydrates `authStore` from the cookie on every page mount. It also listens for `auth-unauthorized` events (emitted by `lib/axios.ts` on 401/419) and redirects to `/login`.

---

## API Calls

| Action | Hook/Function | HTTP | Endpoint |
|---|---|---|---|
| Login | `loginMutation` in `useAuth` | POST | `/api/auth/login` |
| Logout | `logoutMutation` in `useAuth` | DELETE | `/api/auth/logout` |
| Get profile | `useAuthQuery` in `useAuth` | GET | `/auth/me` |
| Update profile | Direct `api.put()` in profile page | PUT | `/auth/profile` |
| Change password | Direct `api.post()` in profile page | POST | `/auth/password` |
| Set session cookie | Internal Next.js route | POST | `/api/auth/session` |
| Get session token | Internal Next.js route | GET | `/api/auth/session` |

---

## Known Gaps

- No "Forgot Password" / password reset flow.
- No email verification on account creation — users receive a generated password via email.
- Profile page bypasses React Hook Form and Zod — validation is done with inline `useState` logic.
- After changing password, the user is NOT automatically logged out — the old token remains valid until they refresh or explicitly log out.
