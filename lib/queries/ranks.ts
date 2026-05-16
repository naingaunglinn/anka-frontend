import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import type { Rank } from '@/types/business';

// ───────────────────────────────────────────────────────────────────────
// Tenant-managed seniority ranks (Junior / Mid / Senior / Lead defaults).
// Used by the AI Team Builder + the Employee form's rank dropdown.
// ───────────────────────────────────────────────────────────────────────

export const rankKeys = {
    all: ['ranks'] as const,
    list: () => [...rankKeys.all, 'list'] as const,
};

function toRank(row: Record<string, unknown>): Rank {
    return {
        id: row.id as string,
        name: row.name as string,
        code: row.code as string,
        level: row.level as number,
    };
}

export function useRanks() {
    return useQuery<Rank[]>({
        queryKey: rankKeys.list(),
        queryFn: async () => {
            const { data: body } = await api.get('/ranks');
            const rows = (body.data ?? []) as Record<string, unknown>[];
            return rows.map(toRank);
        },
        staleTime: 5 * 60_000, // ranks barely change — cache for 5 min
    });
}

export interface RankPayload {
    name: string;
    code: string;
    level: number;
}

export function useRankMutations() {
    const queryClient = useQueryClient();

    const create = useMutation<Rank, Error, RankPayload>({
        mutationFn: async (payload) => {
            const { data: body } = await api.post('/ranks', payload);
            return toRank(body.data ?? body);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: rankKeys.list() });
        },
    });

    const update = useMutation<Rank, Error, { id: string; payload: Partial<RankPayload> }>({
        mutationFn: async ({ id, payload }) => {
            const { data: body } = await api.put(`/ranks/${id}`, payload);
            return toRank(body.data ?? body);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: rankKeys.list() });
        },
    });

    const remove = useMutation<void, Error, string>({
        mutationFn: async (id) => {
            await api.delete(`/ranks/${id}`);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: rankKeys.list() });
        },
    });

    return { create, update, remove };
}
