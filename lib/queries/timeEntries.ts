import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { useBusinessStore } from '@/store/businessStore';
import { toTimeEntry } from '@/lib/dealsMapper';
import type { TimeEntry } from '@/types/business';
import type { PaginatedResponse } from '@/types/api';

async function patchStatus(id: string, action: 'submit' | 'reject'): Promise<TimeEntry> {
    const { data } = await api.patch(`/time-entries/${id}/${action}`);
    return toTimeEntry(data.data ?? data);
}

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
    /**
     * Single status, or a comma-separated list (e.g. `'Draft,Rejected'`).
     * The backend explodes CSVs and matches via `whereIn`.
     */
    status?: TimeEntry['status'] | string;
    /** Substring match on the task description. */
    q?: string;
    date_from?: string;
    date_to?: string;
}

// ── Read hooks ───────────────────────────────────────────────────────────────

/**
 * Fetches a paginated list of time entries from `GET /time-entries`.
 *
 * @param params Optional pagination and filter params (project, employee, status, date range).
 */
export function useTimeEntryList(
    params: TimeEntryListParams = {},
    options: {
        enabled?: boolean;
        /**
         * When true, the fetched entries are mirrored into the global
         * `businessStore.timeEntries` for downstream consumers (Dashboard /
         * Forecast / Financial P&L). Callers MUST only opt in when this query
         * represents the full tenant set — i.e. no filter params AND a
         * `per_page` large enough to return everything in one page. Filtered
         * or paginated-page-N calls must leave this false (default), otherwise
         * they'll silently overwrite the global set with a partial slice and
         * break P&L math elsewhere on the app.
         */
        mirrorToStore?: boolean;
    } = {},
) {
    return useQuery<PaginatedResponse<TimeEntry>>({
        queryKey: timeEntryKeys.list(params),
        queryFn: async () => {
            const { data: body } = await api.get('/time-entries', { params });
            const timeEntries = (body.data ?? []).map(toTimeEntry);
            if (options.mirrorToStore) {
                useBusinessStore.setState({ timeEntries });
            }
            return { ...body, data: timeEntries } as PaginatedResponse<TimeEntry>;
        },
        staleTime: 30_000,
        enabled: options.enabled ?? true,
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

    /**
     * Employee marks a Draft entry as self-completed (Draft -> Pending).
     * Only valid for the assigned employee; backend rejects otherwise.
     */
    const submitTimeEntry = useMutation({
        mutationFn: (id: string) => patchStatus(id, 'submit'),
        onSettled: () =>
            queryClient.invalidateQueries({ queryKey: timeEntryKeys.all }),
    });

    /**
     * Manager rejects a self-completed entry (Pending -> Rejected).
     */
    const rejectTimeEntry = useMutation({
        mutationFn: (id: string) => patchStatus(id, 'reject'),
        onSettled: () =>
            queryClient.invalidateQueries({ queryKey: timeEntryKeys.all }),
    });

    return { createTimeEntry, approveTimeEntry, submitTimeEntry, rejectTimeEntry, deleteTimeEntry };
}
