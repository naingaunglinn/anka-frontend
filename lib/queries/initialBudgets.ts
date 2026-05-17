import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';

/**
 * Year-scoped target profit (spec process ①.3). Replaces the legacy
 * `companySettings.annualInitialBudget` singleton — one row per fiscal
 * year. The Forecast page (⑧) reads the row matching the year of the
 * displayed months.
 */
export interface InitialBudget {
    id: string;
    fiscalYear: number;
    amount: number;
    createdAt: string | null;
    updatedAt: string | null;
}

function toInitialBudget(row: Record<string, unknown>): InitialBudget {
    return {
        id:         row.id as string,
        fiscalYear: Number(row.fiscal_year),
        amount:     Number(row.amount),
        createdAt:  (row.created_at as string | null) ?? null,
        updatedAt:  (row.updated_at as string | null) ?? null,
    };
}

export const initialBudgetKeys = {
    all: ['initial-budgets'] as const,
    list: () => [...initialBudgetKeys.all, 'list'] as const,
    byYear: (year: number) => [...initialBudgetKeys.all, 'year', year] as const,
};

/** All budgets for the current tenant, ordered desc by fiscal_year. */
export function useInitialBudgets() {
    return useQuery<InitialBudget[]>({
        queryKey: initialBudgetKeys.list(),
        queryFn: async () => {
            const { data } = await api.get('/initial-budgets');
            return (data.data ?? []).map(toInitialBudget);
        },
        staleTime: 60_000,
    });
}

/**
 * Single year's budget. Returns `undefined` when nothing's been declared
 * for that year — the Forecast page surfaces a "no budget set" notice
 * in that case rather than silently falling back to another year.
 */
export function useInitialBudget(fiscalYear: number | null | undefined) {
    const listQuery = useInitialBudgets();
    const budget = listQuery.data?.find(b => b.fiscalYear === fiscalYear) ?? undefined;
    return {
        ...listQuery,
        data: budget,
    };
}

export function useUpsertInitialBudget() {
    const queryClient = useQueryClient();
    return useMutation<InitialBudget, Error, { fiscalYear: number; amount: number }>({
        mutationFn: async ({ fiscalYear, amount }) => {
            const { data } = await api.put(`/initial-budgets/${fiscalYear}`, { amount });
            return toInitialBudget(data.data);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: initialBudgetKeys.list() });
        },
    });
}

export function useDeleteInitialBudget() {
    const queryClient = useQueryClient();
    return useMutation<void, Error, number>({
        mutationFn: async (fiscalYear: number) => {
            await api.delete(`/initial-budgets/${fiscalYear}`);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: initialBudgetKeys.list() });
        },
    });
}
