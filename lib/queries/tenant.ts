import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';

export interface TenantSettings {
    id: string;
    name: string;
    slug: string;
    plan: string | null;
    logoPath: string | null;
    logoUrl: string | null;
    signatoryName: string | null;
    signatoryTitle: string | null;
    /** Postal address rendered in the Invoice XLSX company block. */
    address: string | null;
    /** Phone rendered in the Invoice XLSX company block ("Tel: …"). */
    phone: string | null;
    taxRate: number;
    deliveryLagMonths: number;
    paymentDaysLate: number;
    isActive: boolean;
    exchangeRates?: Record<string, number>;
    bankAccounts?: BankAccount[];
}

/**
 * Tenant bank account rendered at the bottom of the Invoice XLSX export.
 * N per tenant — CRUD via the Org → Company → Bank Accounts panel.
 */
export interface BankAccount {
    id: string;
    label: string;
    accountName: string | null;
    accountNo: string | null;
    branchName: string | null;
    branchAddress: string | null;
    branchNo: string | null;
    swiftCode: string | null;
    sortOrder: number;
}

function toBankAccount(row: Record<string, unknown>): BankAccount {
    return {
        id:            row.id as string,
        label:         (row.label as string) ?? '',
        accountName:   (row.account_name as string | null) ?? null,
        accountNo:     (row.account_no as string | null) ?? null,
        branchName:    (row.branch_name as string | null) ?? null,
        branchAddress: (row.branch_address as string | null) ?? null,
        branchNo:      (row.branch_no as string | null) ?? null,
        swiftCode:     (row.swift_code as string | null) ?? null,
        sortOrder:     typeof row.sort_order === 'number' ? row.sort_order : Number(row.sort_order ?? 0),
    };
}

function toTenant(row: Record<string, unknown>): TenantSettings {
    const rawTax = row.tax_rate;
    const rawLag = row.avg_delivery_lag_months;
    const rawDays = row.avg_payment_days_late;
    return {
        id:                row.id as string,
        name:              row.name as string,
        slug:              row.slug as string,
        plan:              row.plan as string | null,
        logoPath:          (row.logo_path as string | null) ?? null,
        logoUrl:           (row.logo_url as string | null) ?? null,
        signatoryName:     (row.signatory_name as string | null) ?? null,
        signatoryTitle:    (row.signatory_title as string | null) ?? null,
        address:           (row.address as string | null) ?? null,
        phone:             (row.phone as string | null) ?? null,
        taxRate:           typeof rawTax === 'number' ? rawTax : rawTax != null ? Number(rawTax) : 0.20,
        deliveryLagMonths: typeof rawLag === 'number' ? rawLag : rawLag != null ? Number(rawLag) : 1,
        paymentDaysLate:   typeof rawDays === 'number' ? rawDays : rawDays != null ? Number(rawDays) : 0,
        isActive:          row.is_active as boolean,
        exchangeRates:     row.exchange_rates as Record<string, number> | undefined,
        bankAccounts:      Array.isArray(row.bank_accounts)
            ? (row.bank_accounts as Record<string, unknown>[]).map(toBankAccount)
            : undefined,
    };
}

export const tenantKeys = {
    all: ['tenant'] as const,
    current: () => [...tenantKeys.all, 'current'] as const,
};

export function useTenantSettings() {
    return useQuery<TenantSettings>({
        queryKey: tenantKeys.current(),
        queryFn: async () => {
            const { data: body } = await api.get('/tenant');
            return toTenant(body.data ?? body);
        },
        staleTime: 60_000,
    });
}

export function useTenantMutations() {
    const queryClient = useQueryClient();

    const updateTenant = useMutation({
        mutationFn: async (updates: {
            name?: string;
            slug?: string;
            signatory_name?: string | null;
            signatory_title?: string | null;
            address?: string | null;
            phone?: string | null;
            tax_rate?: number;
            avg_delivery_lag_months?: number;
            avg_payment_days_late?: number;
        }) => {
            const { data: body } = await api.put('/tenant', updates);
            return toTenant(body.data ?? body);
        },
        onSuccess: (data) => {
            queryClient.setQueryData(tenantKeys.current(), data);
        },
    });

    // Bank accounts (Org → Company → Bank Accounts panel) — separate CRUD
    // hooks so the form can mutate individual rows without re-saving the
    // entire tenant settings block.
    const createBankAccount = useMutation({
        mutationFn: async (payload: {
            label: string;
            account_name?: string | null;
            account_no?: string | null;
            branch_name?: string | null;
            branch_address?: string | null;
            branch_no?: string | null;
            swift_code?: string | null;
            sort_order?: number;
        }) => {
            const { data: body } = await api.post('/tenant/bank-accounts', payload);
            return toBankAccount(body.data ?? body);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: tenantKeys.current() });
        },
    });

    const updateBankAccount = useMutation({
        mutationFn: async ({ id, ...payload }: {
            id: string;
            label?: string;
            account_name?: string | null;
            account_no?: string | null;
            branch_name?: string | null;
            branch_address?: string | null;
            branch_no?: string | null;
            swift_code?: string | null;
            sort_order?: number;
        }) => {
            const { data: body } = await api.put(`/tenant/bank-accounts/${id}`, payload);
            return toBankAccount(body.data ?? body);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: tenantKeys.current() });
        },
    });

    const deleteBankAccount = useMutation({
        mutationFn: async (id: string) => {
            await api.delete(`/tenant/bank-accounts/${id}`);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: tenantKeys.current() });
        },
    });

    const updateExchangeRate = useMutation({
        mutationFn: async (payload: {
            from_currency: string;
            to_currency?: string;
            rate: number;
        }) => {
            const { data: body } = await api.put('/exchange-rates', payload);
            return body.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: tenantKeys.current() });
        },
    });

    // Multipart upload of the company logo. Used by Organization → Company.
    // Returns the refreshed tenant (with the new logoUrl) so the form can
    // swap the preview without a separate fetch.
    const uploadLogo = useMutation({
        mutationFn: async (file: File) => {
            const form = new FormData();
            form.append('logo', file);
            const { data: body } = await api.post('/tenant/logo', form, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            return toTenant(body.data ?? body);
        },
        onSuccess: (data) => {
            queryClient.setQueryData(tenantKeys.current(), data);
        },
    });

    const deleteLogo = useMutation({
        mutationFn: async () => {
            const { data: body } = await api.delete('/tenant/logo');
            return toTenant(body.data ?? body);
        },
        onSuccess: (data) => {
            queryClient.setQueryData(tenantKeys.current(), data);
        },
    });

    return {
        updateTenant,
        updateExchangeRate,
        uploadLogo,
        deleteLogo,
        createBankAccount,
        updateBankAccount,
        deleteBankAccount,
    };
}
