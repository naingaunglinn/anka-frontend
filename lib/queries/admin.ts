import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';

export interface AdminTenant {
    id: string;
    name: string;
    slug: string;
    plan: string | null;
    isActive: boolean;
    createdAt: string;
    usersCount: number;
}

function toAdminTenant(row: Record<string, unknown>): AdminTenant {
    return {
        id:        row.id as string,
        name:      row.name as string,
        slug:      row.slug as string,
        plan:      row.plan as string | null,
        isActive:  row.is_active as boolean,
        createdAt: row.created_at as string,
        usersCount: (row.users_count as number) ?? 0,
    };
}

export interface AdminUser {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    appRole: string;
}

function toAdminUser(row: Record<string, unknown>): AdminUser {
    return {
        id:        row.id as string,
        firstName: row.first_name as string,
        lastName:  row.last_name as string,
        email:     row.email as string,
        appRole:   row.app_role as string,
    };
}

export const adminKeys = {
    all:     ['admin'] as const,
    tenants: () => [...adminKeys.all, 'tenants'] as const,
    tenant:  (id: string) => [...adminKeys.all, 'tenants', id] as const,
    users:   (tenantId: string) => [...adminKeys.all, 'tenants', tenantId, 'users'] as const,
};

export function useAdminTenantList() {
    return useQuery<AdminTenant[]>({
        queryKey: adminKeys.tenants(),
        queryFn: async () => {
            const { data: body } = await api.get('/admin/tenants');
            return (body.data ?? []).map(toAdminTenant);
        },
        staleTime: 30_000,
    });
}

export function useAdminTenantUsers(tenantId: string) {
    return useQuery<AdminUser[]>({
        queryKey: adminKeys.users(tenantId),
        queryFn: async () => {
            const { data: body } = await api.get(`/admin/tenants/${tenantId}/users`);
            return (body.data ?? []).map(toAdminUser);
        },
        staleTime: 30_000,
        enabled: !!tenantId,
    });
}

export function useAdminMutations() {
    const queryClient = useQueryClient();

    const createTenant = useMutation({
        mutationFn: async (payload: { name: string; slug: string; plan?: string }) => {
            const { data } = await api.post('/admin/tenants', payload);
            return toAdminTenant(data.data ?? data);
        },
        onSettled: () => queryClient.invalidateQueries({ queryKey: adminKeys.tenants() }),
    });

    const updateTenant = useMutation({
        mutationFn: async ({ id, updates }: { id: string; updates: Partial<AdminTenant> }) => {
            const { data } = await api.put(`/admin/tenants/${id}`, {
                name:      updates.name,
                slug:      updates.slug,
                plan:      updates.plan,
                is_active: updates.isActive,
            });
            return toAdminTenant(data.data ?? data);
        },
        onSettled: () => queryClient.invalidateQueries({ queryKey: adminKeys.tenants() }),
    });

    const deactivateTenant = useMutation({
        mutationFn: (id: string) => api.delete(`/admin/tenants/${id}`),
        onSettled: () => queryClient.invalidateQueries({ queryKey: adminKeys.tenants() }),
    });

    const createUser = useMutation({
        mutationFn: async ({
            tenantId,
            payload,
        }: {
            tenantId: string;
            payload: { first_name: string; last_name: string; email: string; app_role: string };
        }) => {
            const { data } = await api.post(`/admin/tenants/${tenantId}/users`, payload);
            return {
                user: toAdminUser(data.data ?? data),
                generatedPassword: (data.generated_password as string) || undefined,
            };
        },
        onSettled: (_d, _e, vars) =>
            queryClient.invalidateQueries({ queryKey: adminKeys.users(vars.tenantId) }),
    });

    const updateUser = useMutation({
        mutationFn: async ({
            tenantId,
            userId,
            payload,
        }: {
            tenantId: string;
            userId: string;
            payload: { first_name?: string; last_name?: string; email?: string; app_role?: string };
        }) => {
            const { data } = await api.put(`/admin/tenants/${tenantId}/users/${userId}`, payload);
            return toAdminUser(data.data ?? data);
        },
        onSettled: (_d, _e, vars) =>
            queryClient.invalidateQueries({ queryKey: adminKeys.users(vars.tenantId) }),
    });

    const deleteUser = useMutation({
        mutationFn: async ({ tenantId, userId }: { tenantId: string; userId: string }) => {
            await api.delete(`/admin/tenants/${tenantId}/users/${userId}`);
        },
        onSettled: (_d, _e, vars) =>
            queryClient.invalidateQueries({ queryKey: adminKeys.users(vars.tenantId) }),
    });

    return { createTenant, updateTenant, deactivateTenant, createUser, updateUser, deleteUser };
}
