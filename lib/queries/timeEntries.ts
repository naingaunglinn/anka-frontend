import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { useBusinessStore } from '@/store/businessStore';
import { toTimeEntry } from '@/lib/dealsMapper';
import type { TimeEntry } from '@/types/business';
import type { PaginatedResponse } from '@/types/api';

// ── Query key factory ────────────────────────────────────────────────────────

export const timeEntryKeys = {
    all: ['time-entries'] as const,
    lists: () => [...timeEntryKeys.all, 'list'] as const,
    list: (params: TimeEntryListParams = {}) => [...timeEntryKeys.lists(), params] as const,
    details: () => [...timeEntryKeys.all, 'detail'] as const,
    detail: (id: string) => [...timeEntryKeys.details(), id] as const,
};

export interface TimeEntryListParams {
    page?: number;
    per_page?: number;
    project_id?: string;
    employee_id?: string;
    status?: TimeEntry['status'];
    date_from?: string;
    date_to?: string;
}

// ── Read hooks ───────────────────────────────────────────────────────────────

/**
 * Fetches a paginated list of time entries from `GET /time-entries`.
 *
 * @param params Optional pagination and filter params (project, employee, status, date range).
 */
export function useTimeEntryList(params: TimeEntryListParams = {}) {
    return useQuery<PaginatedResponse<TimeEntry>>({
        queryKey: timeEntryKeys.list(params),
        queryFn: async () => {
            const { data: body } = await api.get('/time-entries', { params });
            const timeEntries = (body.data ?? []).map(toTimeEntry);
            useBusinessStore.setState({ timeEntries });
            return { ...body, data: timeEntries } as PaginatedResponse<TimeEntry>;
        },
        staleTime: 30_000,
    });
}

/**
 * Fetches a single time entry by ID from `GET /time-entries/:id`.
 *
 * @param id Time entry UUID. Query is disabled when `id` is empty.
 */
export function useTimeEntryDetail(id: string) {
    return useQuery<TimeEntry>({
        queryKey: timeEntryKeys.detail(id),
        queryFn: async () => {
            const { data: body } = await api.get(`/time-entries/${id}`);
            return toTimeEntry(body.data ?? body);
        },
        enabled: !!id,
    });
}

// ── Mutation hooks ───────────────────────────────────────────────────────────

/**
 * Returns all time-entry mutation hooks.
 *
 * **`approveTimeEntry` note**: the backend acquires a pessimistic row lock
 * (`SELECT ... FOR UPDATE`) before writing the approval. If another request
 * holds the lock, the server returns **423 Locked**. `normalizeError` maps this
 * to "This record is currently being modified. Please try again in a moment."
 * The optimistic `status: 'Approved'` update is rolled back on any error.
 */
export function useTimeEntryMutations() {
    const queryClient = useQueryClient();

    const createTimeEntry = useMutation({
        mutationFn: (entry: Omit<TimeEntry, 'id'>) =>
            useBusinessStore.getState().addTimeEntry(entry as TimeEntry),
        onSettled: () =>
            queryClient.invalidateQueries({ queryKey: timeEntryKeys.all }),
    });

    /**
     * Calls `PATCH /time-entries/:id/approve`.
     *
     * Optimistically transitions the entry to `status: 'Approved'` in the store.
     * On 423 Locked (concurrent approval attempt) the optimistic update is rolled
     * back and a user-friendly retry message is toasted.
     */
    const approveTimeEntry = useMutation({
        mutationFn: (id: string) =>
            useBusinessStore.getState().approveTimeEntry(id),
        onSettled: () =>
            queryClient.invalidateQueries({ queryKey: timeEntryKeys.all }),
    });

    const deleteTimeEntry = useMutation({
        mutationFn: (id: string) =>
            useBusinessStore.getState().deleteTimeEntry(id),
        onSettled: () =>
            queryClient.invalidateQueries({ queryKey: timeEntryKeys.all }),
    });

    return { createTimeEntry, approveTimeEntry, deleteTimeEntry };
}
