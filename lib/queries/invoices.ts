import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { useBusinessStore } from '@/store/businessStore';
import { toInvoice } from '@/lib/dealsMapper';
import { normalizeError } from '@/lib/errorHandler';
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
     * Calls `PATCH /invoices/:id`. Use to correct a typoed amount, swap the
     * linked milestone, fix the due date, etc. The backend rejects structural
     * edits once an invoice is Paid or Cancelled — only `notes` is editable
     * after that.
     */
    const updateInvoice = useMutation({
        mutationFn: (input: { id: string; updates: Partial<Invoice> }) =>
            useBusinessStore.getState().updateInvoice(input.id, input.updates),
        onSettled: () => queryClient.invalidateQueries({ queryKey: invoiceKeys.all }),
    });

    /**
     * Calls `PATCH /invoices/:id/pay` with an optional partial amount.
     *
     * If `amount` is omitted, the backend treats this as full payment of the
     * remaining balance (legacy "Mark as Paid" behavior). If `amount` is
     * supplied, it is applied as a partial payment and the invoice transitions
     * to `Partially Paid` until cumulative payments reach the total.
     *
     * Server-side runs in a `DB::transaction` and increments
     * `contracts.revenue_recognized` by the applied amount only.
     */
    const payInvoice = useMutation({
        mutationFn: (input: string | { id: string; amount?: number }) => {
            const id     = typeof input === 'string' ? input : input.id;
            const amount = typeof input === 'string' ? undefined : input.amount;
            return useBusinessStore.getState().payInvoice(id, amount);
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: invoiceKeys.all });
            queryClient.invalidateQueries({ queryKey: ['contracts'] });
        },
    });

    const deleteInvoice = useMutation({
        mutationFn: (id: string) =>
            useBusinessStore.getState().deleteInvoice(id),
        onSettled: () =>
            queryClient.invalidateQueries({ queryKey: invoiceKeys.all }),
    });

    /**
     * Email the invoice to the client. Default recipient is the contract's
     * billing_email; pass `to` to override (e.g. when chasing a CC). First
     * call sets `issued_at` and promotes Draft → Pending; subsequent calls
     * increment `reminder_sent_count`.
     */
    const sendInvoice = useMutation({
        mutationFn: async ({ id, to }: { id: string; to?: string }) => {
            const { data } = await api.post(`/invoices/${id}/send`, to ? { to } : {});
            return toInvoice(data.data ?? data);
        },
        onSuccess: (inv) => {
            const isReminder = (inv.reminderSentCount ?? 0) > 0;
            toast.success(isReminder
                ? `Reminder sent to ${inv.sentToEmail}.`
                : `Invoice ${inv.invoiceNumber ?? ''} sent to ${inv.sentToEmail}.`);
        },
        onError: (err) => {
            toast.error(`Failed to send invoice: ${normalizeError(err).message}`);
        },
        onSettled: () => queryClient.invalidateQueries({ queryKey: invoiceKeys.all }),
    });

    return { createInvoice, updateInvoice, payInvoice, deleteInvoice, sendInvoice };
}
