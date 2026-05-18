'use client';

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, CheckCircle2, AlertTriangle, FileSignature, DollarSign, Calendar, ExternalLink, HandCoins, Send, Activity, Sparkles } from 'lucide-react';
import { useContractDetail, useContractMutations } from '@/lib/queries/contracts';
import { useInvoiceList, useInvoiceMutations } from '@/lib/queries/invoices';
import { useMilestoneList, useMilestoneMutations } from '@/lib/queries/milestones';
import { useProjectList } from '@/lib/queries/projects';
import { useDealList } from '@/lib/queries/deals';
import { useTenantStore, type Currency } from '@/store/tenantStore';
import { formatMoney } from '@/lib/currency';
import type { Contract, Invoice } from '@/types/business';
import { MILESTONES_INVOICES_ENABLED } from '@/lib/featureFlags';
import { WorkflowBar, type WorkflowStep } from '@/components/project-pipeline/WorkflowBar';

// Contract status translation keys (kept in CONTRACT_STATUS_KEY for both list & detail).
const CONTRACT_STATUS_KEY: Record<string, string> = {
    Draft:     'contract_status_draft',
    Signed:    'contract_status_signed',
    Active:    'contract_status_active',
    Completed: 'contract_status_completed',
    Cancelled: 'contract_status_cancelled',
};

export default function ContractDetailPage() {
    const t = useTranslations();
    const params = useParams<{ id: string }>();
    const router = useRouter();
    const contractId = params.id;

    const { currentTenant } = useTenantStore();
    const contractQuery = useContractDetail(contractId);
    const invoicesQuery = useInvoiceList({ contract_id: contractId });
    const milestonesQuery = useMilestoneList({ contract_id: contractId });
    const projectsQuery = useProjectList();
    const dealsQuery = useDealList();
    const { updateContract } = useContractMutations();
    const { payInvoice, updateInvoice, sendInvoice } = useInvoiceMutations();
    const { acceptMilestone } = useMilestoneMutations();

    const contract = contractQuery.data;
    const invoices = useMemo(() => invoicesQuery.data?.data ?? [], [invoicesQuery.data]);
    const milestones = useMemo(() => milestonesQuery.data?.data ?? [], [milestonesQuery.data]);
    const linkedProject = useMemo(
        () => projectsQuery.data?.data.find(p => p.contractId === contractId),
        [projectsQuery.data, contractId],
    );
    const sourceDeal = useMemo(
        () => contract?.dealId ? dealsQuery.data?.data.find(d => d.id === contract.dealId) : undefined,
        [contract?.dealId, dealsQuery.data],
    );

    const currency = (contract?.currency as Currency | undefined) ?? (currentTenant?.currency as Currency) ?? 'MMK';

    // ── Derived financial figures ─────────────────────────────────────────────
    const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

    const invoiceTotal = (inv: Invoice) => inv.total ?? (inv.amount + (inv.tax ?? 0));

    const { invoicedTotal, outstandingTotal, overdueTotal, paidInvoices, overdueInvoices, avgDaysToPay } = useMemo(() => {
        let invoicedSum = 0;
        let outstandingSum = 0;
        let overdueSum = 0;
        const paid: Invoice[] = [];
        const overdue: Invoice[] = [];
        const lagDays: number[] = [];

        invoices.forEach(inv => {
            const total = invoiceTotal(inv);
            if (inv.status !== 'Cancelled') invoicedSum += total;
            if (inv.status === 'Pending' || inv.status === 'Overdue') outstandingSum += total;
            const isOverdue = inv.status === 'Overdue' || (inv.status === 'Pending' && inv.dueDate && inv.dueDate < today);
            if (isOverdue) {
                overdueSum += total;
                overdue.push(inv);
            }
            if (inv.status === 'Paid') {
                paid.push(inv);
                if (inv.paidAt && inv.issueDate) {
                    const issued = new Date(inv.issueDate).getTime();
                    const paidTs = new Date(inv.paidAt).getTime();
                    const days = (paidTs - issued) / 86_400_000;
                    if (Number.isFinite(days) && days >= 0) lagDays.push(days);
                }
            }
        });

        const avg = lagDays.length > 0 ? lagDays.reduce((s, d) => s + d, 0) / lagDays.length : null;
        return {
            invoicedTotal: invoicedSum,
            outstandingTotal: outstandingSum,
            overdueTotal: overdueSum,
            paidInvoices: paid,
            overdueInvoices: overdue,
            avgDaysToPay: avg,
        };
    }, [invoices, today]);

    const totalValue = contract?.totalValue ?? 0;
    const recognized = contract?.revenueRecognized ?? 0;   // accrual: Σ accepted milestone amounts
    const cashCollected = contract?.cashCollected ?? 0;    // cash basis: Σ payments received
    const remainingToInvoice = Math.max(0, totalValue - invoicedTotal);
    const invoicedNotCollected = Math.max(0, invoicedTotal - cashCollected);
    const pctCashCollected      = totalValue > 0 ? (cashCollected / totalValue) * 100 : 0;
    const pctInvoicedNotCollected = totalValue > 0 ? (invoicedNotCollected / totalValue) * 100 : 0;
    const pctRemaining          = totalValue > 0 ? (remainingToInvoice / totalValue) * 100 : 0;
    const pctRecognized         = totalValue > 0 ? (recognized / totalValue) * 100 : 0;
    const pctNotRecognized      = totalValue > 0 ? Math.max(0, 100 - pctRecognized) : 0;

    // ── Activity timeline: derived from existing timestamps ───────────────────
    // No new schema — just folds in created_at, signed_at, milestone.accepted_at,
    // invoice.issued_at + paid_at into one reverse-chronological feed.
    type Event = { ts: string; icon: 'created' | 'signed' | 'accepted' | 'issued' | 'paid'; label: string };
    const activityEvents = useMemo<Event[]>(() => {
        const events: Event[] = [];
        if (contract?.createdAt) events.push({ ts: contract.createdAt, icon: 'created', label: 'Contract created' });
        if (contract?.signedAt)  events.push({ ts: contract.signedAt,  icon: 'signed',  label: 'Contract signed' });
        // Milestone + invoice events only contribute to the feed when the
        // billing surfaces are enabled. With the flag off the feed is
        // effectively a 2-event "created → signed" log; hidden entirely if
        // neither timestamp exists yet (the `activityEvents.length > 0`
        // guard at render time covers that case).
        if (MILESTONES_INVOICES_ENABLED) {
            milestones.forEach(m => {
                if (m.acceptedAt) {
                    events.push({
                        ts: m.acceptedAt,
                        icon: 'accepted',
                        label: `Milestone accepted: ${m.name}${m.acceptedByClient ? ` (${m.acceptedByClient})` : ''}`,
                    });
                }
            });
            invoices.forEach(inv => {
                const num = inv.invoiceNumber ?? inv.id.slice(0, 8);
                if (inv.issuedAt) events.push({ ts: inv.issuedAt, icon: 'issued', label: `Invoice ${num} issued to ${inv.sentToEmail ?? 'client'}` });
                if (inv.paidAt)   events.push({ ts: inv.paidAt,   icon: 'paid',   label: `Invoice ${num} paid in full` });
            });
        }
        return events.sort((a, b) => b.ts.localeCompare(a.ts)).slice(0, 12);
    }, [contract?.createdAt, contract?.signedAt, milestones, invoices]);

    // ── Next invoice prediction ───────────────────────────────────────────────
    const nextMilestone = useMemo(() => {
        const invoicedMilestoneIds = new Set(invoices.filter(i => i.milestoneId).map(i => i.milestoneId));
        return milestones
            .filter(m => m.status !== 'Completed' && !invoicedMilestoneIds.has(m.id))
            .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
    }, [milestones, invoices]);

    // ── Mark as Signed dialog ─────────────────────────────────────────────────
    const [signedOpen, setSignedOpen] = useState(false);
    const [signedDate, setSignedDate] = useState(() => new Date().toISOString().slice(0, 10));
    const [signedBy, setSignedBy] = useState('');

    const handleMarkSigned = async () => {
        if (!contract) return;
        await updateContract.mutateAsync({
            id: contract.id,
            updates: {
                status: 'Signed',
                signedAt: new Date(`${signedDate}T00:00:00Z`).toISOString(),
                billingContactName: signedBy || contract.billingContactName,
            },
        });
        setSignedOpen(false);
        setSignedBy('');
    };

    // Contract details (payment terms, billing, PO #, tax jurisdiction) are
    // now derived from the won deal — no inline editing on the contract page.
    // If you need to change those values, do it on the deal during the Mark
    // Contract Ready flow before win_deal() materializes the contract.

    const handleActivate = () => {
        if (!contract) return;
        updateContract.mutate({ id: contract.id, updates: { status: 'Active' } });
    };

    const handleComplete = () => {
        if (!contract) return;
        updateContract.mutate({ id: contract.id, updates: { status: 'Completed' } });
    };

    // ── Accept milestone dialog ───────────────────────────────────────────────
    const [acceptingMilestoneId, setAcceptingMilestoneId] = useState<string | null>(null);
    const [acceptedDate, setAcceptedDate] = useState(() => new Date().toISOString().slice(0, 10));
    const [acceptedByClient, setAcceptedByClient] = useState('');

    const openAcceptMilestone = (id: string) => {
        setAcceptingMilestoneId(id);
        setAcceptedDate(new Date().toISOString().slice(0, 10));
        setAcceptedByClient('');
    };

    const handleAcceptMilestone = async () => {
        if (!acceptingMilestoneId) return;
        await acceptMilestone.mutateAsync({
            id: acceptingMilestoneId,
            acceptedAt: new Date(`${acceptedDate}T00:00:00Z`).toISOString(),
            acceptedByClient: acceptedByClient || undefined,
        });
        setAcceptingMilestoneId(null);
    };

    // ── Record payment dialog (full or partial) ───────────────────────────────
    const [payingInvoice, setPayingInvoice] = useState<Invoice | null>(null);
    const [paymentAmount, setPaymentAmount] = useState('');

    const openPayment = (inv: Invoice) => {
        const total = invoiceTotal(inv);
        const remaining = Math.max(0, total - (inv.paidAmount ?? 0));
        setPayingInvoice(inv);
        setPaymentAmount(String(remaining));
    };

    const handleRecordPayment = async () => {
        if (!payingInvoice) return;
        const amount = Number(paymentAmount);
        if (!Number.isFinite(amount) || amount <= 0) return;
        await payInvoice.mutateAsync({ id: payingInvoice.id, amount });
        setPayingInvoice(null);
        setPaymentAmount('');
    };

    // ── Edit invoice dialog (Draft / Pending / Partially Paid only) ───────────
    const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
    const [editInvIssue, setEditInvIssue] = useState('');
    const [editInvDue, setEditInvDue] = useState('');
    const [editInvAmount, setEditInvAmount] = useState('');
    const [editInvTax, setEditInvTax] = useState('');
    const [editInvNotes, setEditInvNotes] = useState('');

    const openEditInvoice = (inv: Invoice) => {
        setEditingInvoice(inv);
        setEditInvIssue(inv.issueDate);
        setEditInvDue(inv.dueDate ?? '');
        setEditInvAmount(String(inv.amount));
        setEditInvTax(String(inv.tax));
        setEditInvNotes(inv.notes ?? '');
    };

    const handleSaveInvoice = async () => {
        if (!editingInvoice) return;
        await updateInvoice.mutateAsync({
            id: editingInvoice.id,
            updates: {
                issueDate: editInvIssue,
                dueDate: editInvDue || undefined,
                amount: Number(editInvAmount),
                tax: Number(editInvTax) || 0,
                notes: editInvNotes || undefined,
            },
        });
        setEditingInvoice(null);
    };

    // ── Render states ─────────────────────────────────────────────────────────
    if (contractQuery.isLoading) {
        return (
            <div className="p-6 space-y-6">
                <Card className="h-32 animate-pulse border-[#e6e9ee] bg-slate-100 shadow-sm" />
                <Card className="h-48 animate-pulse border-[#e6e9ee] bg-slate-100 shadow-sm" />
            </div>
        );
    }

    if (contractQuery.isError || !contract) {
        return (
            <div className="p-6">
                <Card className="border-[#e6e9ee] shadow-sm">
                    <CardContent className="flex h-40 flex-col items-center justify-center gap-3">
                        <p className="text-sm text-[#4a4a4a]">Could not load contract.</p>
                        <div className="flex gap-2">
                            <Button variant="outline" onClick={() => router.push('/contracts')}>Back to contracts</Button>
                            <Button variant="outline" onClick={() => contractQuery.refetch()}>Retry</Button>
                        </div>
                    </CardContent>
                </Card>
            </div>
        );
    }

    const statusBadgeClass = (s: Contract['status']) =>
        s === 'Active'    ? 'bg-[#00a7f4]/5 text-[#0086c4] border-[#00a7f4]/20' :
        s === 'Signed'    ? 'bg-violet-50 text-violet-700 border-violet-200' :
        s === 'Completed' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
        s === 'Cancelled' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                            'bg-slate-100 text-slate-700 border-slate-200';

    // Workflow bar steps — shared with /project-pipeline/[id]. The Deal step
    // is always done by the time a Contract exists. Contract is current.
    // Project is done iff we have a linked Project row.
    const workflowSteps: WorkflowStep[] = [
        {
            label: t('workflow_deal'),
            detail: sourceDeal ? sourceDeal.name : t('won'),
            active: false,
            done: true,
        },
        {
            label: t('workflow_contract'),
            detail: CONTRACT_STATUS_KEY[contract.status] ? t(CONTRACT_STATUS_KEY[contract.status]) : contract.status,
            active: true,
            done: contract.status === 'Active' || contract.status === 'Completed',
        },
        {
            label: t('workflow_project'),
            detail: linkedProject
                ? (linkedProject.projectNumber ?? linkedProject.name ?? t('created'))
                : t('not_started'),
            active: false,
            done: !!linkedProject,
        },
    ];

    return (
        <div className="p-6 space-y-6">
            {/* ── Header ─────────────────────────────────────────────────── */}
            <div className="flex items-start justify-between gap-4">
                <div>
                    <button
                        onClick={() => router.push('/contracts')}
                        className="flex items-center gap-1 text-sm text-[#4a4a4a] hover:text-[#171717] mb-2"
                    >
                        <ArrowLeft className="h-4 w-4" /> {t('back_to_contracts')}
                    </button>
                    <div className="flex items-center gap-3">
                        <h1 className="text-2xl font-bold tracking-tight text-[#171717]">
                            {contract.contractNumber ?? contract.id.slice(0, 8)}
                        </h1>
                        <Badge variant="outline" className={statusBadgeClass(contract.status)}>
                            {CONTRACT_STATUS_KEY[contract.status] ? t(CONTRACT_STATUS_KEY[contract.status]) : contract.status}
                        </Badge>
                    </div>
                    <p className="text-[#8a8a8a] mt-1">{contract.client}</p>
                </div>
                <div className="flex gap-2">
                    {contract.status === 'Draft' && (
                        <Button className="bg-violet-600 hover:bg-violet-700 gap-2" onClick={() => setSignedOpen(true)}>
                            <FileSignature className="h-4 w-4" /> {t('mark_as_signed')}
                        </Button>
                    )}
                    {contract.status === 'Signed' && (
                        <Button className="bg-[#00a7f4] hover:bg-[#0086c4] gap-2" onClick={handleActivate} disabled={updateContract.isPending}>
                            <CheckCircle2 className="h-4 w-4" /> {t('activate_contract_button')}
                        </Button>
                    )}
                    {contract.status === 'Active' && (
                        <Button variant="outline" className="gap-2" onClick={handleComplete} disabled={updateContract.isPending}>
                            <CheckCircle2 className="h-4 w-4" /> {t('mark_completed')}
                        </Button>
                    )}
                </div>
            </div>

            {/* ── Workflow bar (Deal → Contract → Project) ───────────────── */}
            <WorkflowBar steps={workflowSteps} />

            {/* The Draft setup checklist used to live here, but every item it
                tracked (payment terms, billing email, milestones, marking
                signed) is either filled by the won deal or already surfaced
                as a header button. Removed to avoid redundancy. */}

            {/* ── Contract metadata + financial summary ──────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card className="lg:col-span-2 shadow-sm border-[#e6e9ee]">
                    <CardContent className="p-6 space-y-4">
                        {/* Only deal-derived fields are shown here. Contract-
                            only fields (Payment Terms, PO #, Billing Email,
                            Billing Contact, Tax Jurisdiction) used to live in
                            this grid but had no entry path after the Edit
                            Details dialog was removed — they'll come back when
                            the deal flow captures them upstream. */}
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                            <MetaField icon={<Calendar className="h-4 w-4" />} label={t('start_date')} value={contract.startDate ?? '—'} />
                            <MetaField icon={<Calendar className="h-4 w-4" />} label={t('end_date')} value={contract.endDate ?? '—'} />
                            <MetaField
                                icon={<FileSignature className="h-4 w-4" />}
                                label={t('signed_at')}
                                value={contract.signedAt ? new Date(contract.signedAt).toISOString().slice(0, 10) : '—'}
                            />
                            <MetaField icon={<DollarSign className="h-4 w-4" />} label={t('currency_label')} value={contract.currency ?? t('tenant_default_currency', { currency })} />
                        </div>
                        {(sourceDeal || linkedProject) && (
                            <div className="border-t border-[#e6e9ee] pt-4 flex flex-wrap gap-3 text-sm">
                                {sourceDeal && (
                                    <button
                                        onClick={() => router.push(`/crm/${sourceDeal.id}`)}
                                        className="inline-flex items-center gap-1 text-[#00a7f4] hover:underline"
                                    >
                                        {t('source_deal_link', { name: sourceDeal.name })} <ExternalLink className="h-3 w-3" />
                                    </button>
                                )}
                                {linkedProject && (
                                    <button
                                        onClick={() => router.push(`/projects/${linkedProject.id}`)}
                                        className="inline-flex items-center gap-1 text-purple-600 hover:underline"
                                    >
                                        {t('project_link', { name: linkedProject.projectNumber ?? linkedProject.name })} <ExternalLink className="h-3 w-3" />
                                    </button>
                                )}
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card className="shadow-sm border-[#e6e9ee]">
                    <CardContent className="p-6 space-y-4">
                        <div>
                            <p className="text-xs font-medium text-[#8a8a8a] uppercase tracking-wide">{t('contract_value')}</p>
                            <p className="text-3xl font-bold tracking-tight text-[#171717]">{formatMoney(totalValue, currency)}</p>
                        </div>

                        {MILESTONES_INVOICES_ENABLED ? (
                            <>
                                {/* Money flow — what's been billed and collected */}
                                <div>
                                    <p className="text-[11px] font-semibold text-[#8a8a8a] uppercase tracking-wide mb-1">Money flow</p>
                                    <StackedBar
                                        segments={[
                                            { value: pctCashCollected,         color: 'bg-emerald-500', label: 'Cash collected' },
                                            { value: pctInvoicedNotCollected,  color: 'bg-amber-400',   label: 'Invoiced, not collected' },
                                            { value: pctRemaining,             color: 'bg-slate-200',   label: 'Not yet invoiced' },
                                        ]}
                                    />
                                    <div className="space-y-1 text-xs text-[#4a4a4a] pt-2">
                                        <LegendRow color="bg-emerald-500" label="Cash collected"          value={formatMoney(cashCollected, currency)} />
                                        <LegendRow color="bg-amber-400"   label="Invoiced, not collected" value={formatMoney(invoicedNotCollected, currency)} />
                                        <LegendRow color="bg-slate-200"   label="Not yet invoiced"        value={formatMoney(remainingToInvoice, currency)} />
                                    </div>
                                </div>

                                {/* Accrual revenue — earned, regardless of cash timing */}
                                <div className="pt-3 border-t border-[#e6e9ee]">
                                    <p className="text-[11px] font-semibold text-[#8a8a8a] uppercase tracking-wide mb-1">Revenue recognized <span className="font-normal lowercase text-[#8a8a8a]">(accrual)</span></p>
                                    <StackedBar
                                        segments={[
                                            { value: pctRecognized,    color: 'bg-violet-500', label: 'Recognized' },
                                            { value: pctNotRecognized, color: 'bg-slate-200',  label: 'Not yet earned' },
                                        ]}
                                    />
                                    <div className="flex items-center justify-between text-xs text-[#4a4a4a] pt-2">
                                        <span className="inline-flex items-center gap-2">
                                            <span className="h-2 w-2 rounded-full bg-violet-500" />
                                            Σ accepted milestones
                                        </span>
                                        <span className="font-medium text-[#171717]">{formatMoney(recognized, currency)}</span>
                                    </div>
                                </div>
                            </>
                        ) : (
                            <>
                                {/* Slimmer status block when billing surfaces are gated.
                                 * Source-of-truth for the contract draft + signed PDF is
                                 * /project-pipeline/{dealId} — link out to it instead of
                                 * duplicating that flow here. */}
                                <div className="pt-2 border-t border-[#e6e9ee] space-y-3">
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="text-[#8a8a8a]">{t('status')}</span>
                                        <Badge variant="outline" className={statusBadgeClass(contract.status)}>
                                            {CONTRACT_STATUS_KEY[contract.status] ? t(CONTRACT_STATUS_KEY[contract.status]) : contract.status}
                                        </Badge>
                                    </div>
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="text-[#8a8a8a]">{t('signed_at')}</span>
                                        <span className="font-medium text-[#171717]">
                                            {contract.signedAt ? new Date(contract.signedAt).toLocaleDateString() : t('not_signed_yet')}
                                        </span>
                                    </div>
                                    {contract.dealId && (
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="w-full gap-2"
                                            onClick={() => router.push(`/project-pipeline/${contract.dealId}`)}
                                        >
                                            <ExternalLink className="h-3.5 w-3.5" />
                                            {t('view_signed_contract_draft')}
                                        </Button>
                                    )}
                                </div>
                            </>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* ── KPI strip ──────────────────────────────────────────────── */}
            {MILESTONES_INVOICES_ENABLED && <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Kpi label="Invoiced"       value={formatMoney(invoicedTotal, currency)} hint={`${invoices.filter(i => i.status !== 'Cancelled').length} invoices`} />
                <Kpi label="Outstanding"    value={formatMoney(outstandingTotal, currency)} tone={outstandingTotal > 0 ? 'amber' : 'neutral'} />
                <Kpi label="Overdue"        value={formatMoney(overdueTotal, currency)}     tone={overdueTotal > 0 ? 'rose' : 'neutral'} hint={`${overdueInvoices.length} invoices`} />
                <Kpi label="Avg days-to-pay" value={avgDaysToPay !== null ? `${Math.round(avgDaysToPay)} d` : '—'} hint={`${paidInvoices.length} paid`} />
            </div>}

            {/* ── Milestone timeline ─────────────────────────────────────── */}
            {MILESTONES_INVOICES_ENABLED && <Card className="shadow-sm border-[#e6e9ee]">
                <CardContent className="p-6 space-y-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-semibold text-[#171717]">Milestone timeline</p>
                            {nextMilestone && (
                                <p className="text-xs text-[#8a8a8a] mt-1">
                                    Next: <span className="text-[#171717] font-medium">{nextMilestone.name}</span> due {nextMilestone.dueDate}
                                </p>
                            )}
                        </div>
                        <Button variant="outline" size="sm" onClick={() => router.push('/contracts')}>
                            Add milestone
                        </Button>
                    </div>

                    {milestones.length === 0 ? (
                        <div className="text-center py-8 text-sm text-[#8a8a8a]">
                            No milestones yet. Add a milestone from the Contracts list to enable milestone-based invoicing.
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {milestones
                                .slice()
                                .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
                                .map(m => {
                                    const linkedInvoices = invoices.filter(i => i.milestoneId === m.id);
                                    const invoicedAgainst = linkedInvoices.reduce((s, i) => s + invoiceTotal(i), 0);
                                    const isOverdue = m.status !== 'Completed' && m.dueDate < today;
                                    return (
                                        <div key={m.id} className="flex items-start gap-3 p-3 rounded-lg border border-[#e6e9ee]">
                                            <div className={`mt-1 h-2 w-2 rounded-full ${
                                                m.status === 'Accepted' ? 'bg-emerald-600' :
                                                m.status === 'Completed' ? 'bg-emerald-400' :
                                                m.status === 'In Progress' ? 'bg-[#00a7f4]' :
                                                isOverdue ? 'bg-rose-500' : 'bg-amber-400'
                                            }`} />
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between gap-2">
                                                    <div className="min-w-0">
                                                        <p className="font-medium text-[#171717] truncate">{m.name}</p>
                                                        {m.acceptanceCriteria && (
                                                            <p className="text-xs text-[#8a8a8a] mt-0.5 line-clamp-2">{m.acceptanceCriteria}</p>
                                                        )}
                                                    </div>
                                                    <span className="text-sm font-semibold text-[#171717] flex-shrink-0">{formatMoney(m.amount, currency)}</span>
                                                </div>
                                                <div className="flex items-center flex-wrap gap-2 mt-1.5 text-xs text-[#8a8a8a]">
                                                    <span className={isOverdue ? 'text-rose-600 font-medium' : ''}>Due {m.dueDate}</span>
                                                    <Badge variant="outline" className={
                                                        m.status === 'Accepted' ? 'bg-emerald-50 text-emerald-800 border-emerald-300' :
                                                        m.status === 'Completed' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                                        m.status === 'In Progress' ? 'bg-[#00a7f4]/5 text-[#0086c4] border-[#00a7f4]/20' :
                                                                                     'bg-amber-50 text-amber-700 border-amber-200'
                                                    }>
                                                        {m.status}
                                                    </Badge>
                                                    {m.acceptedAt && m.acceptedByClient && (
                                                        <span className="text-emerald-700">Accepted by {m.acceptedByClient}</span>
                                                    )}
                                                    {linkedInvoices.length > 0 ? (
                                                        <span>
                                                            Invoiced {formatMoney(invoicedAgainst, currency)} ({linkedInvoices.length} {linkedInvoices.length === 1 ? 'invoice' : 'invoices'})
                                                        </span>
                                                    ) : (
                                                        <span className="text-amber-700">Not yet invoiced</span>
                                                    )}
                                                </div>
                                            </div>
                                            {m.status !== 'Accepted' && (
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className="flex-shrink-0 gap-1.5"
                                                    onClick={() => openAcceptMilestone(m.id)}
                                                >
                                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                                    Accept
                                                </Button>
                                            )}
                                        </div>
                                    );
                                })}
                        </div>
                    )}
                </CardContent>
            </Card>}

            {/* ── Activity timeline ─────────────────────────────────────── */}
            {activityEvents.length > 0 && (
                <Card className="shadow-sm border-[#e6e9ee]">
                    <CardContent className="p-6">
                        <div className="flex items-center gap-2 mb-4">
                            <Activity className="h-4 w-4 text-[#8a8a8a]" />
                            <p className="text-sm font-semibold text-[#171717]">{t('activity')}</p>
                            <span className="text-xs text-[#8a8a8a]">— {t('last_n_events', { count: activityEvents.length })}</span>
                        </div>
                        <ol className="relative border-l border-[#e6e9ee] ml-2">
                            {activityEvents.map((ev, i) => {
                                const iconClass =
                                    ev.icon === 'paid'     ? 'bg-emerald-100 text-emerald-700' :
                                    ev.icon === 'accepted' ? 'bg-violet-100 text-violet-700' :
                                    ev.icon === 'signed'   ? 'bg-violet-100 text-violet-700' :
                                    ev.icon === 'issued'   ? 'bg-amber-100 text-amber-700' :
                                                             'bg-slate-100 text-slate-600';
                                const Icon =
                                    ev.icon === 'paid'     ? HandCoins :
                                    ev.icon === 'accepted' ? CheckCircle2 :
                                    ev.icon === 'signed'   ? FileSignature :
                                    ev.icon === 'issued'   ? Send :
                                                             Sparkles;
                                return (
                                    <li key={i} className="ml-4 pb-4 last:pb-0">
                                        <div className={`absolute -left-[9px] flex h-4 w-4 items-center justify-center rounded-full ${iconClass} ring-2 ring-white`}>
                                            <Icon className="h-2.5 w-2.5" />
                                        </div>
                                        <div className="flex items-baseline gap-3">
                                            <p className="text-sm text-[#171717]">{ev.label}</p>
                                            <p className="text-xs text-[#8a8a8a] flex-shrink-0">{new Date(ev.ts).toISOString().slice(0, 10)}</p>
                                        </div>
                                    </li>
                                );
                            })}
                        </ol>
                    </CardContent>
                </Card>
            )}

            {/* ── Invoice ledger ─────────────────────────────────────────── */}
            {MILESTONES_INVOICES_ENABLED && <Card className="shadow-sm border-[#e6e9ee]">
                <CardContent className="p-0">
                    <div className="px-6 py-4 border-b border-[#e6e9ee] flex items-center justify-between">
                        <div>
                            <p className="text-sm font-semibold text-[#171717]">Invoice ledger</p>
                            <p className="text-xs text-[#8a8a8a] mt-0.5">All invoices issued against this contract.</p>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => router.push('/contracts')}>
                            Create invoice
                        </Button>
                    </div>
                    <Table>
                        <TableHeader className="bg-white">
                            <TableRow>
                                <TableHead>Invoice #</TableHead>
                                <TableHead>Milestone</TableHead>
                                <TableHead>Issued</TableHead>
                                <TableHead>Due</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Amount</TableHead>
                                <TableHead className="text-right">Paid</TableHead>
                                <TableHead className="w-[120px]"></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {invoices.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={8} className="text-center py-6 text-[#8a8a8a]">
                                        No invoices yet. Use Create Invoice above to issue the first one.
                                    </TableCell>
                                </TableRow>
                            )}
                            {invoices
                                .slice()
                                .sort((a, b) => (b.issueDate ?? '').localeCompare(a.issueDate ?? ''))
                                .map(inv => {
                                    const total = invoiceTotal(inv);
                                    const paid = inv.paidAmount ?? 0;
                                    const isOverdue = inv.status === 'Overdue' || (inv.status === 'Pending' && inv.dueDate && inv.dueDate < today);
                                    const milestone = milestones.find(m => m.id === inv.milestoneId);
                                    const canEdit = inv.status === 'Draft' || inv.status === 'Pending' || inv.status === 'Overdue' || inv.status === 'Partially Paid';
                                    const canPay  = inv.status !== 'Paid' && inv.status !== 'Cancelled';
                                    return (
                                        <TableRow key={inv.id}>
                                            <TableCell className="font-medium">{inv.invoiceNumber ?? inv.id.slice(0, 8)}</TableCell>
                                            <TableCell className="text-[#4a4a4a] text-sm">{milestone?.name ?? '—'}</TableCell>
                                            <TableCell>{inv.issueDate}</TableCell>
                                            <TableCell className={isOverdue ? 'text-rose-600 font-medium' : ''}>{inv.dueDate ?? '—'}</TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className={
                                                    inv.status === 'Paid' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                                    inv.status === 'Partially Paid' ? 'bg-sky-50 text-sky-700 border-sky-200' :
                                                    isOverdue ? 'bg-rose-50 text-rose-700 border-rose-200' :
                                                    inv.status === 'Pending' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                                                               'bg-slate-100 text-slate-700 border-slate-200'
                                                }>
                                                    {isOverdue && inv.status === 'Pending' ? 'Overdue' : inv.status}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right font-medium">{formatMoney(total, currency)}</TableCell>
                                            <TableCell className="text-right text-[#4a4a4a]">
                                                {paid > 0 ? (
                                                    <span>
                                                        {formatMoney(paid, currency)}
                                                        {paid < total && <span className="text-[#8a8a8a]"> / {formatMoney(total, currency)}</span>}
                                                    </span>
                                                ) : '—'}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="inline-flex gap-1">
                                                    {(inv.status === 'Draft' || inv.status === 'Pending' || inv.status === 'Overdue') && (
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            className="gap-1.5"
                                                            onClick={() => sendInvoice.mutate({ id: inv.id })}
                                                            disabled={sendInvoice.isPending || (!contract.billingEmail && !inv.sentToEmail)}
                                                            title={!contract.billingEmail && !inv.sentToEmail ? 'Add a billing email on the contract first' : (inv.issuedAt ? 'Send reminder' : 'Send to client')}
                                                        >
                                                            <Send className="h-3.5 w-3.5" />
                                                            {inv.issuedAt ? 'Send reminder' : 'Send'}
                                                        </Button>
                                                    )}
                                                    {canPay && (
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            className="gap-1.5"
                                                            onClick={() => openPayment(inv)}
                                                            disabled={payInvoice.isPending}
                                                        >
                                                            <HandCoins className="h-3.5 w-3.5" />
                                                            Record payment
                                                        </Button>
                                                    )}
                                                    {canEdit && (
                                                        <Button size="sm" variant="ghost" onClick={() => openEditInvoice(inv)}>
                                                            Edit
                                                        </Button>
                                                    )}
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>}

            {/* ── Mark as Signed dialog ──────────────────────────────────── */}
            <Dialog open={signedOpen} onOpenChange={setSignedOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t('mark_contract_signed_title')}</DialogTitle>
                        <DialogDescription>
                            {t('mark_contract_signed_desc')}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="space-y-1.5">
                            <label className="text-sm font-medium">{t('signed_date')}</label>
                            <Input type="date" value={signedDate} onChange={e => setSignedDate(e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-sm font-medium">{t('client_signer_name')} <span className="text-[#4a4a4a] text-xs font-normal">{t('optional')}</span></label>
                            <Input
                                value={signedBy}
                                onChange={e => setSignedBy(e.target.value)}
                                placeholder={t('client_signer_placeholder')}
                            />
                        </div>
                        <Button
                            className="w-full bg-violet-600 hover:bg-violet-700"
                            onClick={handleMarkSigned}
                            disabled={updateContract.isPending}
                        >
                            {updateContract.isPending ? t('saving') : t('mark_as_signed')}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {MILESTONES_INVOICES_ENABLED && <>
            {/* ── Accept milestone dialog ─────────────────────────────────── */}
            <Dialog open={!!acceptingMilestoneId} onOpenChange={open => !open && setAcceptingMilestoneId(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Mark milestone as Accepted</DialogTitle>
                        <DialogDescription>
                            Records client sign-off — the legal trigger to invoice this milestone. Use Completed for internal delivery status.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="space-y-1.5">
                            <label className="text-sm font-medium">Acceptance date</label>
                            <Input type="date" value={acceptedDate} onChange={e => setAcceptedDate(e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-sm font-medium">Accepted by <span className="text-[#4a4a4a] text-xs font-normal">(optional)</span></label>
                            <Input
                                value={acceptedByClient}
                                onChange={e => setAcceptedByClient(e.target.value)}
                                placeholder="e.g. John Smith, Product Director"
                            />
                        </div>
                        <Button
                            className="w-full bg-emerald-600 hover:bg-emerald-700"
                            onClick={handleAcceptMilestone}
                            disabled={acceptMilestone.isPending}
                        >
                            {acceptMilestone.isPending ? 'Saving…' : 'Mark as Accepted'}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* ── Record payment dialog ───────────────────────────────────── */}
            <Dialog open={!!payingInvoice} onOpenChange={open => !open && setPayingInvoice(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Record payment</DialogTitle>
                        <DialogDescription>
                            {payingInvoice && (() => {
                                const total = invoiceTotal(payingInvoice);
                                const paidSoFar = payingInvoice.paidAmount ?? 0;
                                const remaining = Math.max(0, total - paidSoFar);
                                return (
                                    <>
                                        Invoice {payingInvoice.invoiceNumber ?? payingInvoice.id.slice(0, 8)} ·
                                        Total {formatMoney(total, currency)} ·
                                        Paid so far {formatMoney(paidSoFar, currency)} ·
                                        Remaining {formatMoney(remaining, currency)}
                                    </>
                                );
                            })()}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="space-y-1.5">
                            <label className="text-sm font-medium">Payment amount</label>
                            <Input
                                type="number"
                                min="0"
                                step="0.01"
                                value={paymentAmount}
                                onChange={e => setPaymentAmount(e.target.value)}
                            />
                            <p className="text-xs text-[#8a8a8a]">
                                Enter the full remaining balance to close out the invoice, or a partial amount to leave it Partially Paid.
                            </p>
                        </div>
                        <Button
                            className="w-full bg-emerald-600 hover:bg-emerald-700"
                            onClick={handleRecordPayment}
                            disabled={payInvoice.isPending || !paymentAmount || Number(paymentAmount) <= 0}
                        >
                            {payInvoice.isPending ? 'Recording…' : 'Record payment'}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* ── Edit invoice dialog ─────────────────────────────────────── */}
            <Dialog open={!!editingInvoice} onOpenChange={open => !open && setEditingInvoice(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Edit invoice</DialogTitle>
                        <DialogDescription>Correct invoice details before payment. Locked once fully Paid or Cancelled.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium">Issue date</label>
                                <Input type="date" value={editInvIssue} onChange={e => setEditInvIssue(e.target.value)} />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium">Due date</label>
                                <Input type="date" value={editInvDue} onChange={e => setEditInvDue(e.target.value)} />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium">Amount</label>
                                <Input type="number" min="0" step="0.01" value={editInvAmount} onChange={e => setEditInvAmount(e.target.value)} />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium">Tax</label>
                                <Input type="number" min="0" step="0.01" value={editInvTax} onChange={e => setEditInvTax(e.target.value)} />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-sm font-medium">Notes</label>
                            <Input value={editInvNotes} onChange={e => setEditInvNotes(e.target.value)} placeholder="e.g. Phase 1 delivery" />
                        </div>
                        <Button
                            className="w-full bg-[#171717] hover:bg-[#00a7f4]"
                            onClick={handleSaveInvoice}
                            disabled={updateInvoice.isPending || !editInvAmount}
                        >
                            {updateInvoice.isPending ? 'Saving…' : 'Save changes'}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
            </>}

        </div>
    );
}

// ─── Small subcomponents ───────────────────────────────────────────────────────

function ChecklistItem({ done, label }: { done: boolean; label: string }) {
    return (
        <div className="flex items-center gap-2">
            {done
                ? <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                : <div className="h-4 w-4 rounded-full border-2 border-violet-300 flex-shrink-0" />}
            <span className={done ? 'text-[#4a4a4a] line-through' : 'text-violet-900'}>{label}</span>
        </div>
    );
}

function MetaField({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
    return (
        <div>
            <div className="flex items-center gap-1.5 text-xs text-[#8a8a8a] mb-0.5">
                {icon}
                <span>{label}</span>
            </div>
            <p className="text-sm text-[#171717] truncate">{value}</p>
        </div>
    );
}

function StackedBar({ segments }: { segments: { value: number; color: string; label: string }[] }) {
    return (
        <div className="flex h-3 rounded-full overflow-hidden bg-slate-100">
            {segments.map((seg, i) => (
                seg.value > 0
                    ? <div key={i} className={seg.color} style={{ width: `${seg.value}%` }} title={`${seg.label}: ${seg.value.toFixed(1)}%`} />
                    : null
            ))}
        </div>
    );
}

function LegendRow({ color, label, value }: { color: string; label: string; value: string }) {
    return (
        <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${color}`} />
                <span>{label}</span>
            </div>
            <span className="font-medium text-[#171717]">{value}</span>
        </div>
    );
}

function Kpi({ label, value, hint, tone = 'neutral' }: { label: string; value: string; hint?: string; tone?: 'neutral' | 'amber' | 'rose' }) {
    const toneClass =
        tone === 'amber' ? 'text-amber-700' :
        tone === 'rose'  ? 'text-rose-700'  :
                           'text-[#171717]';
    const icon =
        tone === 'amber' ? <AlertTriangle className="h-4 w-4 text-amber-500" /> :
        tone === 'rose'  ? <AlertTriangle className="h-4 w-4 text-rose-500" /> :
                           null;
    return (
        <Card className="shadow-sm border-[#e6e9ee]">
            <CardContent className="p-5">
                <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-[#8a8a8a] uppercase tracking-wide">{label}</p>
                    {icon}
                </div>
                <p className={`text-2xl font-bold tracking-tight mt-1 ${toneClass}`}>{value}</p>
                {hint && <p className="text-xs text-[#8a8a8a] mt-1">{hint}</p>}
            </CardContent>
        </Card>
    );
}
