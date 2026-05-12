import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';

export interface TenantSettings {
    id: string;
    name: string;
    slug: string;
    plan: string | null;
    taxRate: number;
    deliveryLagMonths: number;
    paymentDaysLate: number;
    isActive: boolean;
    exchangeRates?: Record<string, number>;
}

function toTenant(row: Record<string, unknown>): TenantSettings {
    const rawTax = row.tax_rate;
    const rawLag = row.avg_delivery_lag_months;
    const rawDays = row.avg_payment_days_late;
    return {
        id:                row.id as string,
        name:              row.name as string,
        slug:              row.slug as string,
        plan:              row.plan as string | null,
        taxRate:           typeof rawTax === 'number' ? rawTax : rawTax != null ? Number(rawTax) : 0.20,
        deliveryLagMonths: typeof rawLag === 'number' ? rawLag : rawLag != null ? Number(rawLag) : 1,
        paymentDaysLate:   typeof rawDays === 'number' ? rawDays : rawDays != null ? Number(rawDays) : 0,
        isActive:          row.is_active as boolean,
        exchangeRates:     row.exchange_rates as Record<string, number> | undefined,
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
        mutationFn: async (updates: {
            name?: string;
            slug?: string;
            tax_rate?: number;
            avg_delivery_lag_months?: number;
            avg_payment_days_late?: number;
        }) => {
            const { data: body } = await api.put('/tenant', updates);
            return toTenant(body.data ?? body);
        },
        onSuccess: (data) => {
            queryClient.setQueryData(tenantKeys.current(), data);
        },
    });

    const updateExchangeRate = useMutation({
        mutationFn: async (payload: {
            from_currency: string;
            to_currency?: string;
            rate: number;
        }) => {
            const { data: body } = await api.put('/exchange-rates', payload);
            return body.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: tenantKeys.current() });
        },
    });

    return { updateTenant, updateExchangeRate };
}
