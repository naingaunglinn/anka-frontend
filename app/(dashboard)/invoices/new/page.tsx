'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { ArrowLeft, Loader2, Plus, Trash2, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useProjectList } from '@/lib/queries/projects';
import { useContractList } from '@/lib/queries/contracts';
import { useInvoicePreview, useCreateInvoiceWithLineItems, type InvoiceLineItem } from '@/lib/queries/invoices';
import { useTenantStore, type Currency } from '@/store/tenantStore';
import { formatMoney } from '@/lib/currency';
import { normalizeError, firstFieldError } from '@/lib/errorHandler';

const VAT_RATE = 0.05;

/**
 * New Invoice form. Workflow:
 *   1. Pick a project (S-rank deals only — they're the only ones with Contracts)
 *   2. Pick a billing month (defaults to current month per spec OQ-6)
 *   3. Click "Load preview" → backend computes proposed line items from
 *      the deal's latest estimation
 *   4. Editable table: adjust labels/qty/cost; add or remove rows; the
 *      subtotal/VAT/total recalculate locally
 *   5. Save → POST /invoices with the locked line_items snapshot
 *
 * Currency stays as the tenant's currency (no $ conversion per spec).
 * VAT hardcoded 5%.
 */
export default function NewInvoicePage() {
    const t = useTranslations();
    const locale = useLocale();
    const router = useRouter();
    const searchParams = useSearchParams();
    const { currentTenant, activeTenantId, tenants } = useTenantStore();
    const currency = (currentTenant?.currency as Currency)
        ?? tenants.find((tenant) => tenant.id === activeTenantId)?.currency
        ?? 'MMK';

    const { data: projectsData, isLoading: projectsLoading } = useProjectList({ per_page: 500 });
    const { data: contractsData } = useContractList({ per_page: 500 });
    const preview = useInvoicePreview();
    const createInvoice = useCreateInvoiceWithLineItems();

    // Pre-select project from ?project=... when the URL has one.
    const preselectedProjectId = searchParams.get('project') ?? '';

    const [projectId, setProjectId] = useState<string>(preselectedProjectId);
    // Both dates are server-set on save and not user-editable. Initialise to
    // today + end-of-month so the read-only preview reflects what the backend
    // will actually persist.
    const [issueDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
    const [dueDate] = useState<string>(() => {
        const d = new Date();
        // End of current month: day 0 of next month = last day of current month
        const eom = new Date(d.getFullYear(), d.getMonth() + 1, 0);
        return eom.toISOString().slice(0, 10);
    });
    const [memo, setMemo] = useState<string>('Thank you for your order');
    const [lines, setLines] = useState<InvoiceLineItem[]>([]);

    // Billing period is locked to the current month per spec — operators
    // can't backfill or pre-bill. The backend also overwrites whatever the
    // client sends, so this label is purely a UI preview.
    const billingPeriodLabel = useMemo(() => {
        const d = new Date();
        return `Fee for ${d.toLocaleString(locale, { month: 'short', year: 'numeric' })}`;
    }, [locale]);

    const selectedProject = useMemo(
        () => projectsData?.data.find((p) => p.id === projectId),
        [projectsData, projectId],
    );

    // Filter: only projects whose contract's deal is won (the only legal
    // source for invoices). Projects only exist for won deals structurally,
    // so the filter is effectively "all projects" — but we keep it explicit.
    const projectOptions = useMemo(() => {
        const contractById = new Map((contractsData?.data ?? []).map((c) => [c.id, c]));
        return (projectsData?.data ?? []).filter((p) => {
            if (!p.contractId) return false;
            return contractById.has(p.contractId);
        });
    }, [projectsData, contractsData]);

    // Auto-load preview when project changes.
    useEffect(() => {
        if (!selectedProject?.contractId) {
            setLines([]);
            return;
        }
        preview.mutate(
            { contractId: selectedProject.contractId },
            {
                onSuccess: (data) => setLines(data.line_items),
                onError: (err) => toast.error(`Couldn't load preview: ${err.message}`),
            },
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedProject?.contractId]);

    const subTotal = useMemo(
        () => lines.reduce((s, l) => s + Number(l.amount || 0), 0),
        [lines],
    );
    const vatAmount = useMemo(() => Math.round(subTotal * VAT_RATE * 100) / 100, [subTotal]);
    const total = useMemo(() => Math.round((subTotal + vatAmount) * 100) / 100, [subTotal, vatAmount]);

    const updateLine = (index: number, patch: Partial<InvoiceLineItem>) => {
        setLines((prev) =>
            prev.map((l, i) => {
                if (i !== index) return l;
                const merged = { ...l, ...patch } as InvoiceLineItem;
                // Auto-recompute amount when qty or cost changes
                if (patch.quantity !== undefined || patch.cost !== undefined) {
                    merged.amount = Math.round((Number(merged.quantity) || 0) * (Number(merged.cost) || 0) * 100) / 100;
                }
                return merged;
            }),
        );
    };

    const removeLine = (index: number) => {
        setLines((prev) => prev.filter((_, i) => i !== index));
    };

    const addLine = (kind: 'resource' | 'overhead') => {
        setLines((prev) => [...prev, { kind, label: '', quantity: kind === 'overhead' ? 1 : 0, cost: 0, amount: 0 }]);
    };

    const handleSubmit = async () => {
        if (!selectedProject?.contractId) {
            toast.error('Pick a project first.');
            return;
        }
        if (lines.length === 0) {
            toast.error('Add at least one line item.');
            return;
        }
        if (lines.some((l) => !l.label.trim())) {
            toast.error('Every line item needs a label.');
            return;
        }
        try {
            const created = await createInvoice.mutateAsync({
                contract_id: selectedProject.contractId,
                issue_date: issueDate,
                due_date: dueDate || undefined,
                memo: memo.trim() || undefined,
                billing_period_label: billingPeriodLabel || undefined,
                line_items: lines,
            });
            toast.success(`Invoice ${created.invoiceNumber ?? ''} created.`);
            router.push(`/invoices/${created.id}`);
        } catch (err) {
            const normalized = normalizeError(err);
            toast.error(firstFieldError(normalized) ?? normalized.message);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3">
                <Button variant="ghost" size="sm" onClick={() => router.back()} className="gap-1">
                    <ArrowLeft className="h-3.5 w-3.5" /> Back
                </Button>
                <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text-default)]">New Invoice</h1>
            </div>

            <Card variant="plain">
                <CardHeader>
                    <CardTitle className="text-base">Source</CardTitle>
                    <CardDescription>
                        Pick the project to invoice. Line items will be pre-filled from the deal&apos;s latest estimation
                        — you can edit them below.
                    </CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-1.5 md:col-span-2">
                        <Label>Project</Label>
                        <Select value={projectId} onValueChange={setProjectId}>
                            <SelectTrigger>
                                <SelectValue placeholder={projectsLoading ? 'Loading…' : 'Select a project'} />
                            </SelectTrigger>
                            <SelectContent>
                                {projectOptions.map((p) => (
                                    <SelectItem key={p.id} value={p.id}>
                                        {p.name} {p.projectNumber ? `(${p.projectNumber})` : ''}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1.5">
                        <Label>Billing month</Label>
                        <div className="h-9 px-3 flex items-center rounded-md border border-slate-200 bg-slate-50 text-sm text-slate-700">
                            {billingPeriodLabel}
                        </div>
                        <p className="text-xs text-slate-500">
                            Locked to the current month. Invoices for past or future months aren&apos;t supported.
                        </p>
                    </div>
                </CardContent>
            </Card>

            <Card variant="plain">
                <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                        <CardTitle className="text-base">Line items</CardTitle>
                        <CardDescription>
                            Editable. Resources come from the estimation (hours ÷ 160 × monthly rate); overheads from
                            the deal&apos;s configured costs.
                        </CardDescription>
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => addLine('resource')} className="gap-1.5">
                            <Plus className="h-3.5 w-3.5" /> Resource
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => addLine('overhead')} className="gap-1.5">
                            <Plus className="h-3.5 w-3.5" /> Overhead
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    {preview.isPending ? (
                        <div className="flex items-center gap-2 p-6 text-sm text-slate-500">
                            <Loader2 className="h-4 w-4 animate-spin" /> Loading preview…
                        </div>
                    ) : lines.length === 0 ? (
                        <p className="p-6 text-sm text-slate-500">
                            {selectedProject ? 'No line items yet. Add one above.' : 'Pick a project to load proposed line items.'}
                        </p>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[120px]">Kind</TableHead>
                                    <TableHead>Description</TableHead>
                                    <TableHead className="w-[110px] text-right">Quantity</TableHead>
                                    <TableHead className="w-[140px] text-right">Cost ({currency})</TableHead>
                                    <TableHead className="w-[140px] text-right">Amount</TableHead>
                                    <TableHead className="w-[60px]"></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {lines.map((line, i) => (
                                    <TableRow key={i}>
                                        <TableCell className="text-xs">
                                            <span className={line.kind === 'overhead' ? 'text-amber-700' : 'text-slate-700'}>
                                                {line.kind}
                                            </span>
                                        </TableCell>
                                        <TableCell>
                                            <Input
                                                value={line.label}
                                                onChange={(e) => updateLine(i, { label: e.target.value })}
                                                className="bg-white"
                                            />
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Input
                                                type="number"
                                                step="0.5"
                                                min="0"
                                                value={line.quantity}
                                                onChange={(e) => updateLine(i, { quantity: Number(e.target.value) })}
                                                className="bg-white text-right"
                                            />
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Input
                                                type="number"
                                                step="0.01"
                                                value={line.cost}
                                                onChange={(e) => updateLine(i, { cost: Number(e.target.value) })}
                                                className="bg-white text-right"
                                            />
                                        </TableCell>
                                        <TableCell className="text-right font-medium">
                                            {formatMoney(line.amount, currency)}
                                        </TableCell>
                                        <TableCell>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => removeLine(i)}
                                                className="text-red-600 hover:text-red-700 hover:bg-red-50 h-8 w-8"
                                            >
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            <Card variant="plain">
                <CardContent className="p-6 space-y-3 max-w-md ml-auto">
                    <div className="flex justify-between text-sm">
                        <span className="text-slate-600">{currency} SUB TOTAL</span>
                        <span className="font-medium">{formatMoney(subTotal, currency)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                        <span className="text-slate-600">VAT 5%</span>
                        <span className="font-medium">{formatMoney(vatAmount, currency)}</span>
                    </div>
                    <div className="flex justify-between text-base border-t border-slate-200 pt-3">
                        <span className="font-semibold">{currency} TOTAL</span>
                        <span className="font-bold">{formatMoney(total, currency)}</span>
                    </div>
                </CardContent>
            </Card>

            <Card variant="plain">
                <CardHeader>
                    <CardTitle className="text-base">Invoice details</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                        <Label className="text-slate-500">Issue date</Label>
                        <p className="text-sm font-medium text-slate-800">{issueDate} <span className="text-xs text-slate-400">(today)</span></p>
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-slate-500">Payment deadline</Label>
                        <p className="text-sm font-medium text-slate-800">{dueDate} <span className="text-xs text-slate-400">(end of month)</span></p>
                    </div>
                    <div className="space-y-1.5 md:col-span-2">
                        <Label>Memo</Label>
                        <Textarea
                            value={memo}
                            onChange={(e) => setMemo(e.target.value)}
                            rows={2}
                            maxLength={2000}
                            placeholder="Thank you for your order"
                        />
                    </div>
                </CardContent>
            </Card>

            <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => router.back()}>Cancel</Button>
                <Button
                    onClick={handleSubmit}
                    disabled={createInvoice.isPending || !selectedProject || lines.length === 0}
                    className="gap-2"
                >
                    <Save className="h-3.5 w-3.5" />
                    {createInvoice.isPending ? 'Saving…' : 'Save invoice'}
                </Button>
            </div>
        </div>
    );
}
