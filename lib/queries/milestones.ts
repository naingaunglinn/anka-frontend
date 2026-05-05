import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import type { PaginatedResponse } from '@/types/api';

export interface Milestone {
    id: string;
    contractId: string;
    name: string;
    dueDate: string;
    amount: number;
    status: 'Pending' | 'In Progress' | 'Completed';
    completedAt?: string | null;
}

function toMilestone(row: Record<string, unknown>): Milestone {
    return {
        id:          row.id as string,
        contractId:  row.contract_id as string,
        name:        row.name as string,
        dueDate:     row.due_date as string,
        amount:      row.amount as number,
        status:      row.status as Milestone['status'],
        completedAt: row.completed_at as string | null,
    };
}

export const milestoneKeys = {
    all: ['milestones'] as const,
    lists: () => [...milestoneKeys.all, 'list'] as const,
    list: (params: { contract_id?: string; status?: string } = {}) =>
        [...milestoneKeys.lists(), params] as const,
    detail: (id: string) => [...milestoneKeys.all, 'detail', id] as const,
};

export function useMilestoneList(params: { contract_id?: string; status?: string } = {}) {
    return useQuery<PaginatedResponse<Milestone>>({
        queryKey: milestoneKeys.list(params),
        queryFn: async () => {
            const { data: body } = await api.get('/milestones', { params });
            const milestones = (body.data ?? []).map(toMilestone);
            return { ...body, data: milestones } as PaginatedResponse<Milestone>;
        },
        staleTime: 30_000,
    });
}

export function useMilestoneMutations() {
    const queryClient = useQueryClient();

    const createMilestone = useMutation({
        mutationFn: async (m: Omit<Milestone, 'id' | 'completedAt'>) => {
            const { data } = await api.post('/milestones', {
                contract_id: m.contractId,
                name:        m.name,
                due_date:    m.dueDate,
                amount:      m.amount,
                status:      m.status,
            });
            return toMilestone(data.data ?? data);
        },
        onSettled: () => queryClient.invalidateQueries({ queryKey: milestoneKeys.all }),
    });

    const updateMilestone = useMutation({
        mutationFn: async ({ id, updates }: { id: string; updates: Partial<Milestone> }) => {
            const { data } = await api.put(`/milestones/${id}`, {
                name:     updates.name,
                due_date: updates.dueDate,
                amount:   updates.amount,
                status:   updates.status,
            });
            return toMilestone(data.data ?? data);
        },
        onSettled: () => queryClient.invalidateQueries({ queryKey: milestoneKeys.all }),
    });

    const deleteMilestone = useMutation({
        mutationFn: (id: string) => api.delete(`/milestones/${id}`),
        onSettled: () => queryClient.invalidateQueries({ queryKey: milestoneKeys.all }),
    });

    return { createMilestone, updateMilestone, deleteMilestone };
}
