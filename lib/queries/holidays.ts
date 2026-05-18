import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { teamCapacityKeys } from './teamCapacity';

export interface Holiday {
    id: string;
    date: string;       // YYYY-MM-DD
    name: string;
    isRecurring: boolean;
    createdAt?: string | null;
    updatedAt?: string | null;
}

export interface HolidayInput {
    date: string;
    name: string;
    isRecurring?: boolean;
}

export const holidayKeys = {
    all: ['holidays'] as const,
    list: () => [...holidayKeys.all, 'list'] as const,
};

function toHoliday(row: Record<string, unknown>): Holiday {
    return {
        id:          row.id as string,
        date:        String(row.date ?? ''),
        name:        String(row.name ?? ''),
        isRecurring: Boolean(row.is_recurring ?? false),
        createdAt:   (row.created_at as string | null) ?? null,
        updatedAt:   (row.updated_at as string | null) ?? null,
    };
}

export function useHolidays() {
    return useQuery<Holiday[]>({
        queryKey: holidayKeys.list(),
        queryFn: async () => {
            const { data: body } = await api.get('/holidays');
            const rows = (body.data ?? body ?? []) as Record<string, unknown>[];
            return rows.map(toHoliday);
        },
        staleTime: 60_000,
    });
}

export function useHolidayMutations() {
    const queryClient = useQueryClient();
    const invalidate = () => {
        queryClient.invalidateQueries({ queryKey: holidayKeys.all });
        // Capacity math derives from holidays; refresh the utilization KPI too.
        queryClient.invalidateQueries({ queryKey: teamCapacityKeys.all });
    };

    const create = useMutation({
        mutationFn: async (input: HolidayInput) => {
            const { data: body } = await api.post('/holidays', {
                date:         input.date,
                name:         input.name,
                is_recurring: input.isRecurring ?? false,
            });
            return toHoliday(body.data ?? body);
        },
        onSuccess: invalidate,
    });

    const update = useMutation({
        mutationFn: async ({ id, ...input }: HolidayInput & { id: string }) => {
            const { data: body } = await api.patch(`/holidays/${id}`, {
                date:         input.date,
                name:         input.name,
                is_recurring: input.isRecurring ?? false,
            });
            return toHoliday(body.data ?? body);
        },
        onSuccess: invalidate,
    });

    const destroy = useMutation({
        mutationFn: async (id: string) => {
            await api.delete(`/holidays/${id}`);
            return id;
        },
        onSuccess: invalidate,
    });

    return { create, update, destroy };
}
