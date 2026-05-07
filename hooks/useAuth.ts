import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/axios';
import { useAuthStore, AuthUser } from '@/store/authStore';
import { useTenantStore } from '@/store/tenantStore';
import { useEffect, useRef } from 'react';
import type { AxiosError } from 'axios';

// Maps snake_case Laravel response to camelCase AuthUser
function mapApiUser(raw: Record<string, unknown>): AuthUser {
    const tenant = raw.tenant as Record<string, unknown> | null | undefined;
    const isSuperAdmin = !!(raw.is_super_admin ?? raw.isSuperAdmin);

    const employeeId = (raw.employee_id ?? raw.employeeId) as string | null | undefined;

    return {
        id: raw.id as string,
        employeeId: employeeId ?? undefined,
        firstName: (raw.first_name ?? raw.firstName) as string,
        lastName: (raw.last_name ?? raw.lastName) as string,
        email: raw.email as string,
        appRole: ((raw.app_role ?? raw.appRole) as AuthUser['appRole']) ?? 'Executive',
        systemRole: (raw.system_role ?? raw.systemRole ?? 'member') as string,
        isSuperAdmin,
        tenant: tenant
            ? {
                id: (tenant.id as string) ?? '',
                name: (tenant.name as string) ?? '',
                slug: (tenant.slug as string) ?? '',
                currency: (tenant.currency as string) ?? 'MMK',
            }
            : null,
    };
}

function setTenantContext(user: AuthUser) {
    if (user.isSuperAdmin) {
        useTenantStore.getState().clearTenant();
        return;
    }
    if (user.tenant?.id) {
        const { activeTenantId, setActiveTenant, setCurrentTenant, setTenants, tenants } = useTenantStore.getState();
        const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!activeTenantId || !UUID_RE.test(activeTenantId)) {
            setActiveTenant(user.tenant.id);
        }
        setCurrentTenant({
            ...user.tenant,
            currency: user.tenant.currency as import('@/store/tenantStore').Currency,
        });
        // Ensure tenant is in the tenants array so currency lookups work
        const tenantWithCurrency = {
            ...user.tenant,
            currency: user.tenant.currency as import('@/store/tenantStore').Currency,
        };
        const exists = tenants.some((t) => t.id === user.tenant!.id);
        if (!exists) {
            setTenants([...tenants, tenantWithCurrency]);
        } else {
            setTenants(tenants.map((t) => (t.id === user.tenant!.id ? tenantWithCurrency : t)));
        }
    }
}

// Clears the httpOnly __session cookie and the role cookie via the Next.js route handler.
// Uses native fetch intentionally — this must succeed even when useAuthStore
// is already cleared and the axios interceptors would reject the request.
async function clearSession() {
    await fetch('/api/auth/session', { method: 'DELETE' });
}

/**
 * Returns true if the error represents an authentication failure (401/403/419).
 * Returns false for server errors (5xx), network errors, timeouts, etc.
 */
function isAuthError(err: unknown): boolean {
    const axiosErr = err as AxiosError | undefined;
    if (!axiosErr?.response?.status) return false;
    const status = axiosErr.response.status;
    return status === 401 || status === 403 || status === 419;
}

export const useAuth = () => {
    const queryClient = useQueryClient();
    const { login, logout, token } = useAuthStore();
    const hasHandledError = useRef(false);

    useEffect(() => {
        // auth-unauthorized is emitted by lib/axios.ts when a 401/419 cannot be recovered.
        // Clearing the query cache here ensures stale user data is not shown after logout.
        const handleUnauthorized = () => {
            logout();
            clearSession(); // fire-and-forget; best effort to clear the httpOnly cookie
            queryClient.clear();
        };
        window.addEventListener('auth-unauthorized', handleUnauthorized);
        return () => window.removeEventListener('auth-unauthorized', handleUnauthorized);
    }, [logout, queryClient]);

    const {
        data: user,
        isLoading,
        isError,
        error,
        refetch,
    } = useQuery<AuthUser, AxiosError>({
        queryKey: ['user'],
        queryFn: async () => {
            const res = await api.get('/auth/me');
            const raw = res.data?.data ?? res.data;
            return mapApiUser(raw as Record<string, unknown>);
        },
        // Only run when a token is present in-memory; prevents unauthenticated /auth/me calls.
        enabled: !!token,
        // Retry on server errors (5xx) with exponential backoff — the backend may
        // be temporarily down. Do NOT retry on 401/403 — that is a real auth failure.
        retry: (failureCount, err) => {
            if (isAuthError(err)) return false;
            return failureCount < 3;
        },
        retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
        // Keep stale data visible while retrying so the UI doesn't flicker.
        staleTime: 5 * 60 * 1000,
    });

    useEffect(() => {
        if (user && token) {
            login(user, token);
            setTenantContext(user);
            hasHandledError.current = false;
        }
    }, [user, login, token]);

    useEffect(() => {
        // Only logout on actual authentication errors (401/403/419).
        // Server errors (5xx) or network timeouts should NOT wipe the session.
        if (isError && error && isAuthError(error) && !hasHandledError.current) {
            hasHandledError.current = true;
            logout();
        }
    }, [isError, error, logout]);

    const loginMutation = useMutation({
        mutationFn: async (credentials: Record<string, string>) => {
            const res = await api.post('/auth/login', credentials);
            return res.data;
        },
        onSuccess: async (data) => {
            const user = mapApiUser(data.user as Record<string, unknown>);
            const token = data.token as string;

            // Write token + role to httpOnly cookie BEFORE updating the in-memory store
            // so any navigation triggered by the caller sees a valid cookie in middleware.
            await fetch('/api/auth/session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, is_super_admin: user.isSuperAdmin }),
            });

            login(user, token);
            setTenantContext(user);
            hasHandledError.current = false;

            queryClient.setQueryData(['user'], user);
        },
    });

    const logoutMutation = useMutation({
        mutationFn: async () => {
            // Use plain fetch instead of the axios instance so the 401 response
            // interceptor doesn't fire triggerLogout() → auth-unauthorized,
            // which would clear state and abort this mutation mid-flight.
            const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
            const currentToken = useAuthStore.getState().token;
            try {
                await fetch(`${backendUrl}/api/auth/logout`, {
                    method: 'DELETE',
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json',
                        ...(currentToken ? { 'Authorization': `Bearer ${currentToken}` } : {}),
                    },
                    credentials: 'include',
                });
            } catch {
                // swallow — backend may be unreachable or token already expired
            }

            // Always clear local state regardless of backend response.
            // clearSession() must finish before mutateAsync resolves so
            // the __session cookie is gone before router.push('/login') fires.
            await clearSession();
            logout();
            useTenantStore.getState().clearTenant();
            queryClient.clear();
            hasHandledError.current = false;
        },
    });

    // Distinguish auth failures from server errors for the UI.
    const isAuthFailure = isError && !!error && isAuthError(error);
    const isServerError = isError && !!error && !isAuthError(error);

    return {
        user,
        isLoading,
        isError,
        isAuthFailure,
        isServerError,
        login: loginMutation.mutateAsync,
        logout: logoutMutation.mutateAsync,
        isLoggingIn: loginMutation.isPending,
        isLoggingOut: logoutMutation.isPending,
        refetchUser: refetch,
    };
};
