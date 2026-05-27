'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { Plus, FileDown, Loader2 } from 'lucide-react';
import { useTranslations, useLocale } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useInvoiceList, downloadInvoiceXlsx } from '@/lib/queries/invoices';
import { useContractList } from '@/lib/queries/contracts';
import { useProjectList } from '@/lib/queries/projects';
import { useTenantStore, type Currency } from '@/store/tenantStore';
import { formatMoney } from '@/lib/currency';
import toast from 'react-hot-toast';

/**
 * Invoice list view — entry point for the new Invoice menu. Shows every
 * invoice for the active tenant with its contract → project pairing,
 * billing period, amount, and status. The "Export XLSX" action on each
 * row downloads the rendered template-style invoice (Phase 2 service).
 *
 * "+ New Invoice" navigates to /invoices/new where the user picks a
 * project and previews the line items the backend computes from the
 * deal's latest estimation.
 */
export default function InvoicesListPage() {
    const t = useTranslations();
    const locale = useLocale();
    const { currentTenant, activeTenantId, tenants } = useTenantStore();
    const currency = (currentTenant?.currency as Currency)
        ?? tenants.find((tenant) => tenant.id === activeTenantId)?.currency
        ?? 'MMK';

    const { data: invoicesData, isLoading } = useInvoiceList({ per_page: 200 });
    const { data: contractsData } = useContractList({ per_page: 500 });
    const { data: projectsData } = useProjectList({ per_page: 500 });

    const contractById = useMemo(() => {
        const map = new Map<string, { clientName: string; contractNumber?: string }>();
        for (const c of contractsData?.data ?? []) {
            map.set(c.id, { clientName: c.client, contractNumber: c.contractNumber });
        }
        return map;
    }, [contractsData]);

    const projectByContractId = useMemo(() => {
        const map = new Map<string, string>();
        for (const p of projectsData?.data ?? []) {
            if (p.contractId) map.set(p.contractId, p.name);
        }
        return map;
    }, [projectsData]);

    const invoices = invoicesData?.data ?? [];

    const handleExport = async (invoiceId: string, invoiceNumber?: string) => {
        try {
            await downloadInvoiceXlsx(invoiceId, invoiceNumber);
            toast.success('Invoice XLSX downloaded.');
        } catch (err) {
            toast.error('Failed to download invoice XLSX.');
            console.error(err);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between bg-white p-6 rounded-xl shadow-sm border border-[var(--color-border-default)]">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text-default)]">{t('invoices')}</h1>
                    <p className="text-[var(--color-text-default)]/80 text-sm mt-1">
                        Invoice export for won projects. Pulls estimated employee + hours from the Estimation Page.
                    </p>
                </div>
                <Link href="/invoices/new">
                    <Button className="gap-2">
                        <Plus className="w-4 h-4" /> New Invoice
                    </Button>
                </Link>
            </div>

            <Card variant="plain">
                <CardHeader>
                    <CardTitle className="text-base">All invoices</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    {isLoading ? (
                        <div className="flex items-center gap-2 text-sm text-slate-500 p-6">
                            <Loader2 className="h-4 w-4 animate-spin" /> Loading invoices…
                        </div>
                    ) : invoices.length === 0 ? (
                        <p className="p-6 text-sm text-slate-500">
                            No invoices yet. Create one from a won project to get started.
                        </p>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Invoice #</TableHead>
                                    <TableHead>Project</TableHead>
                                    <TableHead>Client</TableHead>
                                    <TableHead>Period</TableHead>
                                    <TableHead className="text-right">Total</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="w-40 text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {invoices.map((inv) => {
                                    const c = inv.contractId ? contractById.get(inv.contractId) : undefined;
                                    const projectName = inv.contractId
                                        ? projectByContractId.get(inv.contractId)
                                        : undefined;
                                    return (
                                        <TableRow key={inv.id}>
                                            <TableCell className="font-mono text-xs">{inv.invoiceNumber ?? '—'}</TableCell>
                                            <TableCell>{projectName ?? c?.contractNumber ?? '—'}</TableCell>
                                            <TableCell>{c?.clientName ?? '—'}</TableCell>
                                            <TableCell className="text-xs text-slate-600">
                                                {inv.billingPeriodLabel ?? '—'}
                                            </TableCell>
                                            <TableCell className="text-right font-medium">
                                                {formatMoney(inv.total ?? (inv.amount + inv.tax), currency)}
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="outline">{inv.status}</Badge>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="inline-flex items-center gap-1">
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        onClick={() => handleExport(inv.id, inv.invoiceNumber)}
                                                        className="gap-1.5"
                                                    >
                                                        <FileDown className="h-3.5 w-3.5" />
                                                        XLSX
                                                    </Button>
                                                    <Link href={`/invoices/${inv.id}`}>
                                                        <Button size="sm" variant="outline">Open</Button>
                                                    </Link>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
