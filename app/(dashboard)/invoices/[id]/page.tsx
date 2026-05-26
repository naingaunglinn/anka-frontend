'use client';

import { use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ArrowLeft, FileDown, Loader2, Mail, CreditCard } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useInvoiceDetail, useInvoiceMutations, downloadInvoiceXlsx } from '@/lib/queries/invoices';
import { useContractList } from '@/lib/queries/contracts';
import { useProjectList } from '@/lib/queries/projects';
import { useTenantStore, type Currency } from '@/store/tenantStore';
import { formatMoney } from '@/lib/currency';

/**
 * Invoice detail view. Renders the snapshotted line_items + totals from
 * the time the invoice was saved (or computes them on the fly via the
 * builder fallback for legacy invoices). Primary action is "Export XLSX"
 * which streams the template-style file. Send + Pay actions reuse the
 * existing controller endpoints from the older Contracts surface.
 */
export default function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const router = useRouter();
    const t = useTranslations();
    const { currentTenant, activeTenantId, tenants } = useTenantStore();
    const currency = (currentTenant?.currency as Currency)
        ?? tenants.find((tenant) => tenant.id === activeTenantId)?.currency
        ?? 'MMK';

    const { data: invoice, isLoading } = useInvoiceDetail(id);
    const { data: contractsData } = useContractList({ per_page: 500 });
    const { data: projectsData } = useProjectList({ per_page: 500 });
    const { sendInvoice, payInvoice } = useInvoiceMutations();

    const contract = invoice && contractsData?.data.find((c) => c.id === invoice.contractId);
    const project = invoice && projectsData?.data.find((p) => p.contractId === invoice.contractId);

    const handleExport = async () => {
        if (!invoice) return;
        try {
            await downloadInvoiceXlsx(invoice.id, invoice.invoiceNumber);
            toast.success('Invoice XLSX downloaded.');
        } catch {
            toast.error('Failed to download invoice XLSX.');
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center gap-2 text-sm text-slate-500 p-6">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading invoice…
            </div>
        );
    }

    if (!invoice) {
        return (
            <Card className="border-red-200 bg-red-50/30 max-w-md">
                <CardContent className="p-6 space-y-2">
                    <p className="text-sm text-red-700">Invoice not found.</p>
                    <Link href="/invoices">
                        <Button variant="outline" size="sm">Back to list</Button>
                    </Link>
                </CardContent>
            </Card>
        );
    }

    const subTotal = invoice.amount;
    const vat = invoice.tax;
    const total = invoice.total ?? (invoice.amount + invoice.tax);
    const lineItems = invoice.lineItems ?? [];

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Button variant="ghost" size="sm" onClick={() => router.back()} className="gap-1">
                        <ArrowLeft className="h-3.5 w-3.5" /> Back
                    </Button>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text-default)]">
                            {invoice.invoiceNumber ?? 'Invoice'}
                        </h1>
                        <p className="text-xs text-slate-500 mt-0.5">
                            {project?.name ?? contract?.contractNumber ?? '—'} · {contract?.client ?? '—'}
                        </p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <Badge variant="outline">{invoice.status}</Badge>
                    <Button onClick={handleExport} className="gap-2">
                        <FileDown className="h-4 w-4" /> Export XLSX
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <Card variant="plain" className="md:col-span-2">
                    <CardHeader>
                        <CardTitle className="text-base">Line items</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        {lineItems.length === 0 ? (
                            <p className="p-6 text-sm text-slate-500">
                                No snapshotted line items. The XLSX export rebuilds them on demand from the deal&apos;s estimation.
                            </p>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Kind</TableHead>
                                        <TableHead>Description</TableHead>
                                        <TableHead className="text-right">Qty</TableHead>
                                        <TableHead className="text-right">Cost</TableHead>
                                        <TableHead className="text-right">Amount</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {lineItems.map((line, i) => (
                                        <TableRow key={i}>
                                            <TableCell className="text-xs text-slate-600">{line.kind}</TableCell>
                                            <TableCell>{line.label}</TableCell>
                                            <TableCell className="text-right">{line.quantity}</TableCell>
                                            <TableCell className="text-right">{formatMoney(line.cost, currency)}</TableCell>
                                            <TableCell className="text-right font-medium">{formatMoney(line.amount, currency)}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </CardContent>
                </Card>

                <div className="space-y-5">
                    <Card variant="plain">
                        <CardContent className="p-6 space-y-3">
                            <div className="flex justify-between text-sm">
                                <span className="text-slate-600">{currency} SUB TOTAL</span>
                                <span className="font-medium">{formatMoney(subTotal, currency)}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-slate-600">VAT 5%</span>
                                <span className="font-medium">{formatMoney(vat, currency)}</span>
                            </div>
                            <div className="flex justify-between text-base border-t border-slate-200 pt-3">
                                <span className="font-semibold">{currency} TOTAL</span>
                                <span className="font-bold">{formatMoney(total, currency)}</span>
                            </div>
                            {(invoice.paidAmount ?? 0) > 0 && (
                                <div className="flex justify-between text-xs text-emerald-700 pt-2">
                                    <span>Paid</span>
                                    <span>{formatMoney(invoice.paidAmount ?? 0, currency)}</span>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    <Card variant="plain">
                        <CardHeader>
                            <CardTitle className="text-sm">Details</CardTitle>
                        </CardHeader>
                        <CardContent className="text-sm space-y-2">
                            <Row label="Issue date" value={invoice.issueDate} />
                            <Row label="Due date" value={invoice.dueDate ?? '—'} />
                            <Row label="Period" value={invoice.billingPeriodLabel ?? '—'} />
                            {invoice.memo && <Row label="Memo" value={invoice.memo} />}
                            {invoice.sentToEmail && <Row label="Sent to" value={invoice.sentToEmail} />}
                        </CardContent>
                    </Card>

                    <Card variant="plain">
                        <CardHeader>
                            <CardTitle className="text-sm">Actions</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => sendInvoice.mutate({ id: invoice.id })}
                                disabled={sendInvoice.isPending || invoice.status === 'Paid' || invoice.status === 'Cancelled'}
                                className="w-full gap-2 justify-start"
                            >
                                <Mail className="h-3.5 w-3.5" />
                                {sendInvoice.isPending ? 'Sending…' : (invoice.issuedAt ? 'Resend invoice' : 'Send to client')}
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => payInvoice.mutate(invoice.id)}
                                disabled={payInvoice.isPending || invoice.status === 'Paid' || invoice.status === 'Cancelled'}
                                className="w-full gap-2 justify-start"
                            >
                                <CreditCard className="h-3.5 w-3.5" />
                                {payInvoice.isPending ? 'Recording…' : 'Mark as paid'}
                            </Button>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}

function Row({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex justify-between gap-3">
            <span className="text-slate-500">{label}</span>
            <span className="text-slate-800 text-right">{value}</span>
        </div>
    );
}
