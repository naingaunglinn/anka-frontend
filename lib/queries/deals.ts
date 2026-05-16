import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { useBusinessStore } from '@/store/businessStore';
import { toDeal } from '@/lib/dealsMapper';
import type { Deal } from '@/types/business';
import type { PaginatedResponse } from '@/types/api';

// ── Query key factory ────────────────────────────────────────────────────────
// Centralised here so any file that needs to invalidate deal-related cache can
// import these constants rather than hard-coding string arrays.

export const dealKeys = {
    all: ['deals'] as const,
    lists: () => [...dealKeys.all, 'list'] as const,
    list: (params: DealListParams = {}) => [...dealKeys.lists(), params] as const,
    details: () => [...dealKeys.all, 'detail'] as const,
    detail: (id: string) => [...dealKeys.details(), id] as const,
};

export interface DealListParams {
    page?: number;
    per_page?: number;
    search?: string;
    status?: Deal['status'];
}

// ── Read hooks ───────────────────────────────────────────────────────────────

/**
 * Fetches a paginated list of deals from `GET /deals`.
 *
 * The result is also pushed into the Zustand businessStore so Kanban and other
 * components that read `useBusinessStore((s) => s.deals)` stay in sync without
 * requiring a separate "load all" call.
 *
 * @param params Optional pagination and filter params forwarded as query string.
 */
export function useDealList(params: DealListParams = {}) {
    const query = useQuery<PaginatedResponse<Deal>>({
        queryKey: dealKeys.list(params),
        queryFn: async () => {
            const { data: body } = await api.get('/deals', { params });
            const deals = (body.data ?? []).map(toDeal);
            return { ...body, data: deals } as PaginatedResponse<Deal>;
        },
        staleTime: 30_000,
    });

    // Sync the fetched list into Zustand so components that read
    // `useBusinessStore((s) => s.deals)` stay in sync — but only when the
    // server snapshot actually changes. Doing this in an effect (instead of
    // inside `queryFn`) avoids the race where a background refetch's
    // `setState({ deals })` clobbers an in-flight optimistic mutation, and
    // keeps the merge surface small (only the latest deals, not aux state).
    useEffect(() => {
        if (query.data?.data) {
            useBusinessStore.setState({ deals: query.data.data });
        }
    }, [query.data]);

    return query;
}

/**
 * Fetches a single deal by ID from `GET /deals/:id`.
 *
 * @param id The deal UUID. Query is disabled when `id` is empty.
 */
export function useDealDetail(id: string) {
    return useQuery<Deal>({
        queryKey: dealKeys.detail(id),
        queryFn: async () => {
            const { data: body } = await api.get(`/deals/${id}`);
            return toDeal(body.data ?? body);
        },
        enabled: !!id,
    });
}

// ── Mutation hooks ───────────────────────────────────────────────────────────

/**
 * Returns all deal mutation hooks.
 *
 * Each mutation follows the businessStore optimistic-update pattern:
 * 1. Snapshot Zustand state
 * 2. Apply optimistic update immediately to the store
 * 3. Call `lib/api.ts`
 * 4. On error: restore snapshot + toast the normalised error message
 * 5. **On settled**: invalidate the TanStack Query cache so list/detail views
 *    reflect authoritative server state (even after an optimistic rollback)
 *
 * Removed in chg-009/chg-011 Phase B-breaking:
 *   - `updateDealStage` — drag-to-rank is gone; rank changes are event-driven
 *     (Estimation flips C→B; ContractDraftService flips B→A on draft generation
 *     and A→S on counter-signed PDF upload).
 *   - `winDeal` — there's no manual win path anymore; the only route to S
 *     is uploading a counter-signed contract PDF.
 *   - `loseDeal` — replaced by `dropDeal` which uses the orthogonal
 *     `lifecycle_status` flag rather than overwriting `status` with 'lost'.
 */
export function useDealMutations() {
    const queryClient = useQueryClient();

    const createDeal = useMutation<Deal, Error, Deal>({
        mutationFn: (deal: Deal) =>
            useBusinessStore.getState().addDeal(deal),
        onSettled: () =>
            queryClient.invalidateQueries({ queryKey: dealKeys.all }),
    });

    const updateDeal = useMutation({
        mutationFn: ({ id, updates }: { id: string; updates: Partial<Deal> }) =>
            useBusinessStore.getState().updateDeal(id, updates),
        onSettled: (_data, _err, { id }) => {
            queryClient.invalidateQueries({ queryKey: dealKeys.detail(id) });
            queryClient.invalidateQueries({ queryKey: dealKeys.lists() });
        },
    });

    const deleteDeal = useMutation({
        mutationFn: (id: string) =>
            useBusinessStore.getState().deleteDeal(id),
        onSettled: () =>
            queryClient.invalidateQueries({ queryKey: dealKeys.all }),
    });

    /**
     * Marks a deal Dropped. Replaces the old loseDeal mutation. Uses the
     * orthogonal `lifecycle_status` flag so the deal's rank-at-drop is
     * preserved for analytics ("dropped at A after burning estimation
     * effort" vs "dropped at C, minimal investment").
     *
     * Backend refuses status='won' (S deals are final per spec).
     */
    const dropDeal = useMutation({
        mutationFn: ({ dealId, reason }: { dealId: string; reason: string }) =>
            useBusinessStore.getState().dropDeal(dealId, reason),
        onSettled: () =>
            queryClient.invalidateQueries({ queryKey: dealKeys.all }),
    });

    return { createDeal, updateDeal, deleteDeal, dropDeal };
}
