import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api, { csrfCookie } from '@/lib/axios';
import { useAuthStore, User } from '@/store/useAuthStore';
import { useEffect } from 'react';

export const useAuth = () => {
    const queryClient = useQueryClient();
    const { setUser, clearAuth } = useAuthStore();

    // Listen for global unauthorized events from Axios interceptor
    useEffect(() => {
        const handleUnauthorized = () => {
            clearAuth();
            queryClient.clear();
        };

        window.addEventListener('auth-unauthorized', handleUnauthorized);
        return () => window.removeEventListener('auth-unauthorized', handleUnauthorized);
    }, [clearAuth, queryClient]);

    const { data: user, isLoading, refetch, isError } = useQuery<User>({
        queryKey: ['user'],
        queryFn: async () => {
            const res = await api.get('/auth/me');
            return res.data.data; // Laravel typical UserResource wrap
        },
        retry: false,
    });

    // Hydrate store on load if user fetch is successful
    useEffect(() => {
        if (user) {
            setUser(user);
        }
        if (isError) {
            clearAuth();
        }
    }, [user, isError, setUser, clearAuth]);

    const loginMutation = useMutation({
        mutationFn: async (credentials: Record<string, string>) => {
            await csrfCookie();
            const res = await api.post('/auth/login', credentials);
            return res.data;
        },
        onSuccess: (data) => {
            setUser(data.user);
            queryClient.setQueryData(['user'], data.user);
        },
    });

    const logoutMutation = useMutation({
        mutationFn: async () => {
            await api.post('/auth/logout');
        },
        onSettled: () => {
            clearAuth();
            queryClient.clear();
        }
    });

    return {
        user,
        isLoading,
        login: loginMutation.mutateAsync,
        logout: logoutMutation.mutateAsync,
        isLoggingIn: loginMutation.isPending,
        isLoggingOut: logoutMutation.isPending,
        refetchUser: refetch,
    };
};
