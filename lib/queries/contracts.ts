import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { useBusinessStore } from '@/store/businessStore';
import { toContract } from '@/lib/dealsMapper';
import type { Contract } from '@/types/business';
import type { PaginatedResponse } from '@/types/api';

// ── Query key factory ────────────────────────────────────────────────────────

export const contractKeys = {
    all: ['contracts'] as const,
    lists: () => [...contractKeys.all, 'list'] as const,
    list: (params: ContractListParams = {}) => [...contractKeys.lists(), params] as const,
    details: () => [...contractKeys.all, 'detail'] as const,
    detail: (id: string) => [...contractKeys.details(), id] as const,
    linked: (dealId: string) => [...contractKeys.all, 'linked', dealId] as const,
};

export interface ContractListParams {
    page?: number;
    per_page?: number;
    deal_id?: string;
    status?: Contract['status'];
}

// ── Read hooks ───────────────────────────────────────────────────────────────

/**
 * Fetches a paginated list of contracts from `GET /contracts`.
 *
 * Note: contracts are created exclusively by the `win_deal()` stored procedure
 * (via `useDealMutations().winDeal`). This hook is read-only.
 *
 * @param params Optional pagination, `deal_id`, and `status` filters.
 */
export function useContractList(params: ContractListParams = {}) {
    return useQuery<PaginatedResponse<Contract>>({
        queryKey: contractKeys.list(params),
        queryFn: async () => {
            const { data: body } = await api.get('/contracts', { params });
            const contracts = (body.data ?? []).map(toContract);
            useBusinessStore.setState({ contracts });
            return { ...body, data: contracts } as PaginatedResponse<Contract>;
        },
        staleTime: 30_000,
    });
}

/**
 * Fetches a single contract by ID from `GET /contracts/:id`.
 *
 * @param id Contract UUID. Query is disabled when `id` is empty.
 */
export function useContractDetail(id: string) {
    return useQuery<Contract>({
        queryKey: contractKeys.detail(id),
        queryFn: async () => {
            const { data: body } = await api.get(`/contracts/${id}`);
            return toContract(body.data ?? body);
        },
        enabled: !!id,
    });
}

/**
 * Fetches the contract linked to a specific deal from `GET /deals/:dealId/contract`.
 *
 * This is useful when you have a won deal and need to show its linked contract
 * without relying on the global contract list being in memory.
 *
 * @param dealId Deal UUID. Query is disabled when empty.
 * @returns The linked Contract, or `null` if the deal has no linked contract.
 */
export function useLinkedContract(dealId: string) {
    return useQuery<Contract | null>({
        queryKey: contractKeys.linked(dealId),
        queryFn: async () => {
            const { data: body } = await api.get(`/deals/${dealId}/contract`);
            const raw = body.data ?? body;
            if (!raw || !raw.id) return null;
            return toContract(raw);
        },
        enabled: !!dealId,
        staleTime: 60_000,
    });
}

// ── Mutation hooks ───────────────────────────────────────────────────────────

/**
 * Returns mutation hooks for contract operations.
 *
 * Contracts cannot be created from the frontend — they are produced by the
 * `win_deal()` stored proc. Only `update` and `delete` are exposed here.
 *
 * Each mutation follows the optimistic-update pattern:
 * snapshot → apply to Zustand → call API → restore on error / invalidate on settled.
 */
export function useContractMutations() {
    const queryClient = useQueryClient();

    const updateContract = useMutation({
        mutationFn: ({ id, updates }: { id: string; updates: Partial<Contract> }) =>
            useBusinessStore.getState().updateContract(id, updates),
        onSettled: (_data, _err, { id }) => {
            queryClient.invalidateQueries({ queryKey: contractKeys.detail(id) });
            queryClient.invalidateQueries({ queryKey: contractKeys.lists() });
        },
    });

    const deleteContract = useMutation({
        mutationFn: (id: string) =>
            useBusinessStore.getState().deleteContract(id),
        onSettled: () =>
            queryClient.invalidateQueries({ queryKey: contractKeys.all }),
    });

    return { updateContract, deleteContract };
}
