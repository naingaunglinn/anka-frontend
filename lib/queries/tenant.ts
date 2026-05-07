import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';

export interface TenantSettings {
    id: string;
    name: string;
    slug: string;
    plan: string | null;
    isActive: boolean;
}

function toTenant(row: Record<string, unknown>): TenantSettings {
    return {
        id:       row.id as string,
        name:     row.name as string,
        slug:     row.slug as string,
        plan:     row.plan as string | null,
        isActive: row.is_active as boolean,
    };
}

export const tenantKeys = {
    all: ['tenant'] as const,
    current: () => [...tenantKeys.all, 'current'] as const,
};

export function useTenantSettings() {
    return useQuery<TenantSettings>({
        queryKey: tenantKeys.current(),
        queryFn: async () => {
            const { data: body } = await api.get('/tenant');
            return toTenant(body.data ?? body);
        },
        staleTime: 60_000,
    });
}

export function useTenantMutations() {
    const queryClient = useQueryClient();

    const updateTenant = useMutation({
        mutationFn: async (updates: { name?: string; slug?: string }) => {
            const { data: body } = await api.put('/tenant', updates);
            return toTenant(body.data ?? body);
        },
        onSuccess: (data) => {
            queryClient.setQueryData(tenantKeys.current(), data);
        },
    });

    return { updateTenant };
}
