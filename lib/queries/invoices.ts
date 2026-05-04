import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { useBusinessStore } from '@/store/businessStore';
import { toInvoice } from '@/lib/dealsMapper';
import type { Invoice } from '@/types/business';
import type { PaginatedResponse } from '@/types/api';

// ── Query key factory ────────────────────────────────────────────────────────

export const invoiceKeys = {
    all: ['invoices'] as const,
    lists: () => [...invoiceKeys.all, 'list'] as const,
    list: (params: InvoiceListParams = {}) => [...invoiceKeys.lists(), params] as const,
    details: () => [...invoiceKeys.all, 'detail'] as const,
    detail: (id: string) => [...invoiceKeys.details(), id] as const,
};

export interface InvoiceListParams {
    page?: number;
    per_page?: number;
    contract_id?: string;
    status?: Invoice['status'];
}

// ── Read hooks ───────────────────────────────────────────────────────────────

/**
 * Fetches a paginated list of invoices from `GET /invoices`.
 *
 * The `total` field on each invoice is a database-generated column (`amount + tax`)
 * and is read-only — never send it in mutation payloads.
 *
 * @param params Optional pagination and filter params.
 */
export function useInvoiceList(params: InvoiceListParams = {}) {
    return useQuery<PaginatedResponse<Invoice>>({
        queryKey: invoiceKeys.list(params),
        queryFn: async () => {
            const { data: body } = await api.get('/invoices', { params });
            const invoices = (body.data ?? []).map(toInvoice);
            useBusinessStore.setState({ invoices });
            return { ...body, data: invoices } as PaginatedResponse<Invoice>;
        },
        staleTime: 30_000,
    });
}

/**
 * Fetches a single invoice by ID from `GET /invoices/:id`.
 *
 * @param id Invoice UUID. Query is disabled when `id` is empty.
 */
export function useInvoiceDetail(id: string) {
    return useQuery<Invoice>({
        queryKey: invoiceKeys.detail(id),
        queryFn: async () => {
            const { data: body } = await api.get(`/invoices/${id}`);
            return toInvoice(body.data ?? body);
        },
        enabled: !!id,
    });
}

// ── Mutation hooks ───────────────────────────────────────────────────────────

/**
 * Returns all invoice mutation hooks.
 *
 * **`payInvoice` note**: the backend runs payment inside a `DB::transaction`.
 * If the invoice has already been paid, the server returns **409 Conflict**,
 * which `normalizeError` maps to a clear user-facing message. The optimistic
 * `status: 'Paid'` update is rolled back on any error.
 *
 * `payInvoice` also invalidates the contracts cache because it updates
 * `revenue_recognized` on the parent contract.
 */
export function useInvoiceMutations() {
    const queryClient = useQueryClient();

    const createInvoice = useMutation({
        mutationFn: (invoice: Omit<Invoice, 'id'>) =>
            useBusinessStore.getState().addInvoice(invoice as Invoice),
        onSettled: () =>
            queryClient.invalidateQueries({ queryKey: invoiceKeys.all }),
    });

    /**
     * Calls `PATCH /invoices/:id/pay`.
     *
     * Optimistically marks the invoice as `Paid` in the store. If the server
     * returns 409 (already paid) the optimistic update is rolled back and the
     * conflict message is toasted.
     *
     * Also invalidates contracts because `revenue_recognized` changes server-side.
     */
    const payInvoice = useMutation({
        mutationFn: (id: string) =>
            useBusinessStore.getState().payInvoice(id),
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: invoiceKeys.all });
            // revenue_recognized on the parent contract changes when an invoice is paid
            queryClient.invalidateQueries({ queryKey: ['contracts'] });
        },
    });

    const deleteInvoice = useMutation({
        mutationFn: (id: string) =>
            useBusinessStore.getState().deleteInvoice(id),
        onSettled: () =>
            queryClient.invalidateQueries({ queryKey: invoiceKeys.all }),
    });

    return { createInvoice, payInvoice, deleteInvoice };
}
