import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api, { csrfCookie } from '@/lib/axios';
import { useAuthStore, AuthUser } from '@/store/authStore';
import { useTenantStore } from '@/store/tenantStore';
import { useEffect } from 'react';

// Maps snake_case Laravel response to camelCase AuthUser
function mapApiUser(raw: Record<string, unknown>): AuthUser {
    const tenant = raw.tenant as Record<string, unknown> | undefined;
    return {
        id: raw.id as number,
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

export const useAuth = () => {
    const queryClient = useQueryClient();
    const { login, logout, token } = useAuthStore();

    useEffect(() => {
        const handleUnauthorized = () => {
            logout();
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
        enabled: !!token,
        retry: false,
    });

    useEffect(() => {
        if (user && token) {
            login(user, token);
            useTenantStore.getState().setActiveTenant(user.tenant.id);
        }
        if (isError) {
            logout();
        }
    }, [user, isError, login, logout, token]);

    const loginMutation = useMutation({
        mutationFn: async (credentials: Record<string, string>) => {
            await csrfCookie();
            const res = await api.post('/auth/login', credentials);
            return res.data;
        },
        onSuccess: (data) => {
            const user = mapApiUser(data.user as Record<string, unknown>);
            login(user, data.token as string);
            useTenantStore.getState().setActiveTenant(user.tenant.id);
            queryClient.setQueryData(['user'], user);
        },
    });

    const logoutMutation = useMutation({
        mutationFn: async () => {
            await api.post('/auth/logout');
        },
        onSettled: () => {
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
