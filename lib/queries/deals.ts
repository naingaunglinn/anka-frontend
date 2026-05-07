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
    return useQuery<PaginatedResponse<Deal>>({
        queryKey: dealKeys.list(params),
        queryFn: async () => {
            const { data: body } = await api.get('/deals', { params });
            const deals = (body.data ?? []).map(toDeal);
            // Sync into Zustand so optimistic mutations (Kanban drag-drop, etc.)
            // have the latest server state as their snapshot base.
            useBusinessStore.setState({ deals });
            return { ...body, data: deals } as PaginatedResponse<Deal>;
        },
        staleTime: 30_000,
    });
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
 * **`winDeal` note**: this triggers the `win_deal()` stored procedure which
 * atomically creates a Contract and a Project. It **cannot be undone** from the
 * frontend. Always present a confirmation dialog before calling
 * `winDeal.mutate(dealId)`.
 */
export function useDealMutations() {
    const queryClient = useQueryClient();

    const createDeal = useMutation({
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

    const updateDealStage = useMutation({
        mutationFn: ({
            id,
            status,
            probability,
        }: {
            id: string;
            status: string;
            probability?: number;
        }) => useBusinessStore.getState().updateDealStage(id, status, probability),
        onSettled: (_data, _err, { id }) => {
            queryClient.invalidateQueries({ queryKey: dealKeys.detail(id) });
            queryClient.invalidateQueries({ queryKey: dealKeys.lists() });
        },
    });

    /**
     * Calls `POST /deals/:id/win`, which triggers the `win_deal()` stored procedure.
     *
     * On success, deals, contracts, AND projects caches are all invalidated because
     * the procedure creates records in all three tables atomically.
     *
     * If the stored procedure raises a constraint violation the backend returns a
     * 422 or 409, which `normalizeError` maps to a clear user-facing message.
     *
     * ⚠️  Confirm with the user before calling — this action cannot be undone.
     */
    const winDeal = useMutation({
        mutationFn: ({ dealId, winReason }: { dealId: string; winReason?: string }) =>
            useBusinessStore.getState().winDeal(dealId, winReason),
        onSettled: () => {
            // The stored proc touches three tables — invalidate all three caches
            queryClient.invalidateQueries({ queryKey: dealKeys.all });
            queryClient.invalidateQueries({ queryKey: ['contracts'] });
            queryClient.invalidateQueries({ queryKey: ['projects'] });
        },
    });

    /** Calls `POST /deals/:id/lose`. Requires a loss_reason. */
    const loseDeal = useMutation({
        mutationFn: ({ dealId, lossReason }: { dealId: string; lossReason: string }) =>
            useBusinessStore.getState().loseDeal(dealId, lossReason),
        onSettled: () =>
            queryClient.invalidateQueries({ queryKey: dealKeys.all }),
    });

    return { createDeal, updateDeal, deleteDeal, updateDealStage, winDeal, loseDeal };
}
