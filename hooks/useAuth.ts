import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/axios';
import { useAuthStore, AuthUser } from '@/store/authStore';
import { useTenantStore } from '@/store/tenantStore';
import { useEffect } from 'react';

// Maps snake_case Laravel response to camelCase AuthUser
function mapApiUser(raw: Record<string, unknown>): AuthUser {
    const tenant = raw.tenant as Record<string, unknown> | undefined;
    return {
        id: raw.id as string,
        firstName: (raw.first_name ?? raw.firstName) as string,
        lastName: (raw.last_name ?? raw.lastName) as string,
        email: raw.email as string,
        appRole: ((raw.app_role ?? raw.appRole) as AuthUser['appRole']) ?? 'Executive',
        tenant: {
            id: (tenant?.id as string) ?? '',
            name: (tenant?.name as string) ?? '',
            slug: (tenant?.slug as string) ?? '',
        },
    };
}

// Clears the httpOnly __session cookie via the Next.js route handler.
// Uses native fetch intentionally — this must succeed even when useAuthStore
// is already cleared and the axios interceptors would reject the request.
async function clearSession() {
    await fetch('/api/auth/session', { method: 'DELETE' });
}

export const useAuth = () => {
    const queryClient = useQueryClient();
    const { login, logout, token } = useAuthStore();

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

    const { data: user, isLoading, isError, refetch } = useQuery<AuthUser>({
        queryKey: ['user'],
        queryFn: async () => {
            const res = await api.get('/auth/me');
            const raw = res.data?.data ?? res.data;
            return mapApiUser(raw as Record<string, unknown>);
        },
        // Only run when a token is present in-memory; prevents unauthenticated /auth/me calls.
        enabled: !!token,
        retry: false,
    });

    useEffect(() => {
        if (user && token) {
            login(user, token);
            const { activeTenantId, setActiveTenant } = useTenantStore.getState();
            // Overwrite if no tenant is set OR if the stored value is stale / not a valid UUID.
            const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            if (!activeTenantId || !UUID_RE.test(activeTenantId)) {
                setActiveTenant(user.tenant.id);
            }
        }
        if (isError) {
            logout();
        }
    }, [user, isError, login, logout, token]);

    const loginMutation = useMutation({
        mutationFn: async (credentials: Record<string, string>) => {
            // CSRF cookie is auto-fetched by the lib/axios.ts request interceptor
            // before this POST reaches the server.
            const res = await api.post('/auth/login', credentials);
            return res.data;
        },
        onSuccess: async (data) => {
            const user = mapApiUser(data.user as Record<string, unknown>);
            const token = data.token as string;

            // Write the token to the httpOnly __session cookie BEFORE updating the
            // in-memory store, so that any navigation triggered by the caller already
            // sees a valid cookie in the middleware's cookie check.
            await fetch('/api/auth/session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token }),
            });

            login(user, token);
            useTenantStore.getState().setActiveTenant(user.tenant.id);
            queryClient.setQueryData(['user'], user);
        },
    });

    const logoutMutation = useMutation({
        mutationFn: async () => {
            // DELETE revokes the Sanctum personal access token server-side.
            // Swallow errors: if the token is already expired or the request fails,
            // we still want to clear local state.
            await api.delete('/auth/logout').catch(() => {});
        },
        onSettled: async () => {
            // Clear cookie first so any in-flight navigation sees an unauthenticated state.
            await clearSession();
            logout();
            useTenantStore.getState().setActiveTenant('');
            queryClient.clear();
        },
    });

    return {
        user,
        isLoading,
        isError,
        login: loginMutation.mutateAsync,
        logout: logoutMutation.mutateAsync,
        isLoggingIn: loginMutation.isPending,
        isLoggingOut: logoutMutation.isPending,
        refetchUser: refetch,
    };
};
