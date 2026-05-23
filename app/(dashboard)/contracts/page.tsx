'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Chip } from '@/components/ui/chip';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { MoreVertical, FileText, CheckCircle2, Download, Plus, Trash2 } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useContractList, useContractMutations } from '@/lib/queries/contracts';
import { useInvoiceList, useInvoiceMutations } from '@/lib/queries/invoices';
import { useMilestoneList, useMilestoneMutations } from '@/lib/queries/milestones';
import { MILESTONES_INVOICES_ENABLED } from '@/lib/featureFlags';
import { useDealList } from '@/lib/queries/deals';
import { useProjectList } from '@/lib/queries/projects';
import { useBusinessStore } from '@/store/businessStore';
import { useTenantStore, type Currency } from '@/store/tenantStore';
import { formatMoney } from '@/lib/currency';
import { CURRENCY_CONFIG } from '@/lib/currencyConfig';
import { useRouter } from 'next/navigation';

// Map contract status enum (kept English internally) to translation keys.
const CONTRACT_STATUS_KEY: Record<string, string> = {
    Draft:     'contract_status_draft',
    Signed:    'contract_status_signed',
    Active:    'contract_status_active',
    Completed: 'contract_status_completed',
    Cancelled: 'contract_status_cancelled',
};

export default function ContractsPage() {
    const t = useTranslations();
    const router = useRouter();
    const { activeTenantId, currentTenant, tenants } = useTenantStore();
    const currency = (currentTenant?.currency as Currency) ?? tenants.find((tenant) => tenant.id === activeTenantId)?.currency ?? 'MMK';
    const contractsQuery = useContractList();
    const invoicesQuery = useInvoiceList();
    const milestonesQuery = useMilestoneList();
    const dealsQuery = useDealList();
    const projectsQuery = useProjectList();
    const storeContracts = useBusinessStore(state => state.contracts);
    const { payInvoice, createInvoice, deleteInvoice } = useInvoiceMutations();
    const { updateContract, deleteContract } = useContractMutations();
    const { createMilestone, deleteMilestone } = useMilestoneMutations();

    // Merge API results with Zustand store so contracts from recently-won deals
    // appear immediately even if the TanStack Query cache hasn't refetched yet.
    const contracts = useMemo(() => {
        const apiContracts = contractsQuery.data?.data ?? [];
        const map = new Map(apiContracts.map(c => [c.id, c]));
        storeContracts.forEach(c => map.set(c.id, c));
        return Array.from(map.values()).sort((a, b) => {
            const numA = a.contractNumber ? parseInt(a.contractNumber.replace(/\D/g, ''), 10) : 0;
            const numB = b.contractNumber ? parseInt(b.contractNumber.replace(/\D/g, ''), 10) : 0;
            return numB - numA;
        });
    }, [contractsQuery.data, storeContracts]);
    const invoices = useMemo(() => invoicesQuery.data?.data ?? [], [invoicesQuery.data]);
    const milestones = useMemo(() => milestonesQuery.data?.data ?? [], [milestonesQuery.data]);
    const deals = useMemo(() => dealsQuery.data?.data ?? [], [dealsQuery.data]);
    const projects = useMemo(() => projectsQuery.data?.data ?? [], [projectsQuery.data]);

    const totalContractValue = contracts.reduce((sum, c) => sum + c.totalValue, 0);
    const totalRecognized = contracts.reduce((sum, c) => sum + c.revenueRecognized, 0);

    // "Signed This Month" KPI replaces "Revenue Recognized" while billing
    // features are gated. Uses contract.signedAt so contracts that became
    // signed (regardless of current status) all count for the calendar month.
    const signedThisMonth = useMemo(() => {
        const now = new Date();
        const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        return contracts.filter(c => c.signedAt && c.signedAt.startsWith(ym)).length;
    }, [contracts]);

    // Per-contract invoice rollup: powers the Invoiced / Outstanding / Overdue columns
    // without an extra round-trip — uses the invoices already loaded for the Invoices tab.
    const invoiceStatsByContract = useMemo(() => {
        const today = new Date().toISOString().slice(0, 10);
        const stats = new Map<string, { invoiced: number; outstanding: number; overdue: number }>();
        invoices.forEach(inv => {
            const total = inv.total ?? (inv.amount + (inv.tax ?? 0));
            const s = stats.get(inv.contractId) ?? { invoiced: 0, outstanding: 0, overdue: 0 };
            if (inv.status !== 'Cancelled') s.invoiced += total;
            if (inv.status === 'Pending' || inv.status === 'Overdue') s.outstanding += total;
            const isOverdue = inv.status === 'Overdue' || (inv.status === 'Pending' && inv.dueDate && inv.dueDate < today);
            if (isOverdue) s.overdue += total;
            stats.set(inv.contractId, s);
        });
        return stats;
    }, [invoices]);
    const isLoading = contractsQuery.isLoading || invoicesQuery.isLoading;
    const isError = contractsQuery.isError || invoicesQuery.isError;
    const retry = () => {
        contractsQuery.refetch();
        invoicesQuery.refetch();
    };

    // -- Create Invoice state ------------------------------------------------
    const [isInvoiceOpen, setIsInvoiceOpen] = useState(false);
    const [invContractId, setInvContractId] = useState('');
    const [invMilestoneId, setInvMilestoneId] = useState('');
    const [invIssueDate, setInvIssueDate] = useState(() => new Date().toISOString().split('T')[0]);
    const [invDueDate, setInvDueDate] = useState('');
    const [invAmount, setInvAmount] = useState('');
    const [invTax, setInvTax] = useState('0');
    const [invNotes, setInvNotes] = useState('');
    const [invErrors, setInvErrors] = useState<{ contractId?: string; amount?: string }>({});

    const handleCreateInvoice = async () => {
        const errs: typeof invErrors = {};
        if (!invContractId) errs.contractId = 'Please select a contract.';
        if (!invAmount) errs.amount = 'Please enter an invoice amount.';
        else if (Number(invAmount) <= 0) errs.amount = 'Amount must be greater than zero.';
        setInvErrors(errs);
        if (Object.keys(errs).length > 0) return;
        try {
            await createInvoice.mutateAsync({
                contractId: invContractId,
                milestoneId: invMilestoneId || undefined,
                issueDate: invIssueDate,
                dueDate: invDueDate || undefined,
                amount: Number(invAmount),
                tax: Number(invTax) || 0,
                notes: invNotes || undefined,
                status: 'Pending' as const,
            } as Parameters<typeof createInvoice.mutateAsync>[0]);
        } catch {
            // toast already shown by businessStore.addInvoice — keep modal open
            // so the user can fix the inputs and retry.
            return;
        }
        setIsInvoiceOpen(false);
        setInvContractId('');
        setInvMilestoneId('');
        setInvAmount('');
        setInvTax('0');
        setInvNotes('');
        setInvErrors({});
    };

    // -- Create Milestone state ----------------------------------------------
    const [isMilestoneOpen, setIsMilestoneOpen] = useState(false);
    const [msContractId, setMsContractId] = useState('');
    const [msName, setMsName] = useState('');
    const [msDueDate, setMsDueDate] = useState('');
    const [msAmount, setMsAmount] = useState('');
    const [msErrors, setMsErrors] = useState<{ contractId?: string; name?: string; dueDate?: string; amount?: string }>({});

    const handleCreateMilestone = async () => {
        const errs: typeof msErrors = {};
        if (!msContractId) errs.contractId = 'Please select a contract.';
        if (!msName.trim()) errs.name = 'Please enter a milestone name.';
        if (!msDueDate) errs.dueDate = 'Please select a due date.';
        if (!msAmount) errs.amount = 'Please enter a milestone amount.';
        else if (Number(msAmount) <= 0) errs.amount = 'Amount must be greater than zero.';
        setMsErrors(errs);
        if (Object.keys(errs).length > 0) return;
        await createMilestone.mutateAsync({
            contractId: msContractId,
            name: msName,
            dueDate: msDueDate,
            amount: Number(msAmount),
            status: 'Pending',
        });
        setIsMilestoneOpen(false);
        setMsContractId('');
        setMsName('');
        setMsDueDate('');
        setMsAmount('');
        setMsErrors({});
    };

    // -- Edit Contract state ------------------------------------------------
    const [editContract, setEditContract] = useState<{ id: string; status: string; notes: string } | null>(null);

    // -- Confirm dialog states -----------------------------------------------
    const [archiveOpen, setArchiveOpen] = useState(false);
    const [archivingContract, setArchivingContract] = useState<string | null>(null);
    const [deleteInvoiceOpen, setDeleteInvoiceOpen] = useState(false);
    const [deletingInvoiceId, setDeletingInvoiceId] = useState<string | null>(null);
    const [deleteMilestoneOpen, setDeleteMilestoneOpen] = useState(false);
    const [deletingMilestoneId, setDeletingMilestoneId] = useState<string | null>(null);

    const handleUpdateContract = async () => {
        if (!editContract) return;
        await updateContract.mutateAsync({ id: editContract.id, updates: { status: editContract.status as 'Draft' | 'Signed' | 'Active' | 'Completed' | 'Cancelled', notes: editContract.notes } });
        setEditContract(null);
    };

    const openArchive = (contractId: string) => {
        setArchivingContract(contractId);
        setArchiveOpen(true);
    };

    const handleArchive = async () => {
        if (!archivingContract) return;
        await deleteContract.mutateAsync(archivingContract);
        setArchiveOpen(false);
        setArchivingContract(null);
    };

    const openDeleteInvoice = (invoiceId: string) => {
        setDeletingInvoiceId(invoiceId);
        setDeleteInvoiceOpen(true);
    };

    const handleDeleteInvoice = async () => {
        if (!deletingInvoiceId) return;
        await deleteInvoice.mutateAsync(deletingInvoiceId);
        setDeleteInvoiceOpen(false);
        setDeletingInvoiceId(null);
    };

    const handleDeleteMilestone = async () => {
        if (!deletingMilestoneId) return;
        await deleteMilestone.mutateAsync(deletingMilestoneId);
        setDeleteMilestoneOpen(false);
        setDeletingMilestoneId(null);
    };

    return (
        <div className="p-6 space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-[#171717]">{MILESTONES_INVOICES_ENABLED ? t('contracts_amp_billing') : t('contracts_title')}</h1>
                    <p className="text-[var(--color-text-muted)] mt-1">
                        {MILESTONES_INVOICES_ENABLED
                            ? t('contracts_subtitle_enabled')
                            : t('contracts_subtitle_disabled')}
                    </p>
                </div>
                {MILESTONES_INVOICES_ENABLED && <Dialog open={isInvoiceOpen} onOpenChange={setIsInvoiceOpen}>
                    <DialogTrigger asChild>
                        <Button className="bg-[#171717] hover:bg-[#00a7f4] gap-2">
                            <Plus className="h-4 w-4" /> {t('create_invoice_button')}
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>{t('create_invoice_button')}</DialogTitle>
                            <DialogDescription>{t('create_invoice_dialog_desc')}</DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-2">
                            <p className="text-xs text-[var(--color-text-subtle)]">Fields marked <span className="text-destructive">*</span> are required.</p>
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium">Contract <span className="text-destructive">*</span></label>
                                <Select value={invContractId} onValueChange={(v) => { setInvContractId(v); setInvMilestoneId(''); if (invErrors.contractId) setInvErrors(p => ({ ...p, contractId: undefined })); }}>
                                    <SelectTrigger aria-invalid={!!invErrors.contractId}><SelectValue placeholder="Select contract..." /></SelectTrigger>
                                    <SelectContent>
                                        {contracts.map(c => (
                                            <SelectItem key={c.id} value={c.id}>
                                                {c.contractNumber ?? c.id.slice(0, 8)} — {c.client}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                {invErrors.contractId && <p className="text-xs text-destructive">{invErrors.contractId}</p>}
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium">Milestone <span className="text-[var(--color-text-subtle)] text-xs font-normal">(optional)</span></label>
                                <Select value={invMilestoneId} onValueChange={setInvMilestoneId}>
                                    <SelectTrigger><SelectValue placeholder="Select milestone..." /></SelectTrigger>
                                    <SelectContent>
                                        {milestones.filter(m => m.contractId === invContractId).map(ms => (
                                            <SelectItem key={ms.id} value={ms.id}>
                                                {ms.name} — {formatMoney(ms.amount, currency)}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium">Issue Date <span className="text-destructive">*</span></label>
                                    <Input type="date" value={invIssueDate} onChange={e => setInvIssueDate(e.target.value)} />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium">Due Date <span className="text-[var(--color-text-subtle)] text-xs font-normal">(optional)</span></label>
                                    <Input type="date" value={invDueDate} onChange={e => setInvDueDate(e.target.value)} />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                            <label className="text-sm font-medium">Amount ({CURRENCY_CONFIG[currency].symbol}) <span className="text-destructive">*</span></label>
                                    <Input
                                        type="number" min="0" step="0.01"
                                        value={invAmount}
                                        onChange={e => { setInvAmount(e.target.value); if (invErrors.amount) setInvErrors(p => ({ ...p, amount: undefined })); }}
                                        onBlur={() => { if (!invAmount || Number(invAmount) <= 0) setInvErrors(p => ({ ...p, amount: 'Enter a valid amount.' })); }}
                                        placeholder="10000"
                                        aria-invalid={!!invErrors.amount}
                                    />
                                    {invErrors.amount && <p className="text-xs text-destructive">{invErrors.amount}</p>}
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium">Tax ({CURRENCY_CONFIG[currency].symbol}) <span className="text-[var(--color-text-subtle)] text-xs font-normal">(optional)</span></label>
                                    <Input type="number" min="0" step="0.01" value={invTax} onChange={e => setInvTax(e.target.value)} placeholder="0" />
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium">Notes <span className="text-[var(--color-text-subtle)] text-xs font-normal">(optional)</span></label>
                                <Input value={invNotes} onChange={e => setInvNotes(e.target.value)} placeholder="e.g. Payment for Phase 1 delivery" />
                            </div>
                            <Button
                                className="w-full bg-[#171717] hover:bg-[#00a7f4]"
                                onClick={handleCreateInvoice}
                                disabled={createInvoice.isPending}
                            >
                                {createInvoice.isPending ? 'Creating...' : 'Create Invoice'}
                            </Button>
                        </div>
                    </DialogContent>
                </Dialog>}
            </div>

            {isLoading && (
                <Card variant="plain" className="h-40 animate-pulse bg-slate-100" />
            )}

            {isError && (
                <Card variant="plain">
                    <CardContent className="flex h-40 flex-col items-center justify-center gap-3">
                        <p className="text-sm text-[var(--color-text-subtle)]">{t('could_not_load_contracts')}</p>
                        <Button variant="outline" onClick={retry}>{t('retry')}</Button>
                    </CardContent>
                </Card>
            )}

            {!isLoading && !isError && <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card variant="plain">
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-[var(--color-text-muted)]">{t('active_contracts_kpi')}</p>
                            <FileText className="h-5 w-5 text-[#00a7f4]" />
                        </div>
                        <div className="mt-2 flex items-baseline gap-2">
                            <span className="text-3xl font-bold tracking-tight text-[#171717]">{contracts.filter(c => c.status === 'Active').length}</span>
                        </div>
                    </CardContent>
                </Card>
                <Card variant="plain">
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-[var(--color-text-muted)]">{t('total_contract_value')}</p>
                            <div className="h-8 w-8 rounded-full bg-emerald-100 flex items-center justify-center">
                                <span className="text-emerald-600 font-bold text-xs">{currency}</span>
                            </div>
                        </div>
                        <div className="mt-2 flex items-baseline gap-2">
                            <span className="text-3xl font-bold tracking-tight text-[#171717]">{formatMoney(totalContractValue, currency)}</span>
                        </div>
                    </CardContent>
                </Card>
                {MILESTONES_INVOICES_ENABLED ? (
                    <Card variant="plain">
                        <CardContent className="p-6">
                            <div className="flex items-center justify-between">
                                <p className="text-sm font-medium text-[var(--color-text-muted)]">{t('revenue_recognized')}</p>
                                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                            </div>
                            <div className="mt-2 flex items-baseline gap-2">
                                <span className="text-3xl font-bold tracking-tight text-emerald-600">{formatMoney(totalRecognized, currency)}</span>
                                <span className="text-sm font-medium text-[var(--color-text-muted)]">
                                    ({totalContractValue > 0 ? Math.round((totalRecognized / totalContractValue) * 100) : 0}%)
                                </span>
                            </div>
                        </CardContent>
                    </Card>
                ) : (
                    <Card variant="plain">
                        <CardContent className="p-6">
                            <div className="flex items-center justify-between">
                                <p className="text-sm font-medium text-[var(--color-text-muted)]">{t('signed_this_month')}</p>
                                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                            </div>
                            <div className="mt-2 flex items-baseline gap-2">
                                <span className="text-3xl font-bold tracking-tight text-[#171717]">{signedThisMonth}</span>
                                <span className="text-sm font-medium text-[var(--color-text-muted)]">{t('contracts_count', { count: signedThisMonth })}</span>
                            </div>
                        </CardContent>
                    </Card>
                )}
            </div>}

            {!isLoading && !isError && (MILESTONES_INVOICES_ENABLED ? <Tabs defaultValue="contracts" className="space-y-6">
                <TabsList className="bg-slate-100/50 p-1 border border-slate-200/60">
                    <TabsTrigger value="contracts" className="data-[state=active]:bg-white data-[state=active]:shadow-sm">{t('active_contracts_tab')}</TabsTrigger>
                    <TabsTrigger value="milestones" className="data-[state=active]:bg-white data-[state=active]:shadow-sm">{t('milestones_tab')}</TabsTrigger>
                    <TabsTrigger value="invoices" className="data-[state=active]:bg-white data-[state=active]:shadow-sm">{t('invoices_tab')}</TabsTrigger>
                </TabsList>

                <TabsContent value="contracts">
                    <Card variant="plain">
                        <Table>
                            <TableHeader className="bg-white">
                                <TableRow>
                                    <TableHead>{t('contract_id')}</TableHead>
                                    <TableHead>{t('client')}</TableHead>
                                    <TableHead>{t('source_deal')}</TableHead>
                                    <TableHead>{t('linked_project')}</TableHead>
                                    <TableHead>{t('status')}</TableHead>
                                    <TableHead className="text-right">{t('total_value_col')}</TableHead>
                                    <TableHead className="text-right">{t('invoiced')}</TableHead>
                                    <TableHead className="text-right">{t('outstanding')}</TableHead>
                                    <TableHead className="text-right">{t('overdue')}</TableHead>
                                    <TableHead className="text-right">{t('recognized')}</TableHead>
                                    <TableHead className="w-[50px]"></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {contracts.map((contract) => {
                                    const sourceDeal     = deals.find(d => d.id === contract.dealId);
                                    const linkedProject  = projects.find(p => p.contractId === contract.id);
                                    const stats          = invoiceStatsByContract.get(contract.id) ?? { invoiced: 0, outstanding: 0, overdue: 0 };
                                    return (
                                        <TableRow key={contract.id}>
                                            <TableCell className="font-medium">
                                                <button
                                                    className="text-[var(--color-brand-500)] hover:underline text-left"
                                                    onClick={() => router.push(`/contracts/${contract.id}`)}
                                                >
                                                    {contract.contractNumber ?? contract.id}
                                                </button>
                                            </TableCell>
                                            <TableCell>{contract.client}</TableCell>
                                            <TableCell>
                                                {sourceDeal ? (
                                                    <button
                                                        className="text-sm text-[var(--color-brand-500)] hover:underline text-left"
                                                        onClick={() => router.push(`/crm/${sourceDeal.id}`)}
                                                    >
                                                        {sourceDeal.name}
                                                    </button>
                                                ) : (
                                                    <span className="text-[var(--color-text-muted)] text-sm">—</span>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                {linkedProject ? (
                                                    <button
                                                        className="text-sm text-[var(--color-info-700)] hover:underline text-left"
                                                        onClick={() => router.push(`/projects/${linkedProject.id}`)}
                                                    >
                                                        {linkedProject.projectNumber ?? linkedProject.name}
                                                    </button>
                                                ) : (
                                                    <span className="text-[var(--color-text-muted)] text-sm">—</span>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <Chip variant={
                                                    contract.status === 'Active' ? 'brand' :
                                                    contract.status === 'Signed' ? 'info' :
                                                    contract.status === 'Completed' ? 'success' :
                                                    contract.status === 'Cancelled' ? 'error' :
                                                        'default'
                                                }>
                                                    {CONTRACT_STATUS_KEY[contract.status] ? t(CONTRACT_STATUS_KEY[contract.status]) : contract.status}
                                                </Chip>
                                            </TableCell>
                                            <TableCell className="text-right font-medium">{formatMoney(contract.totalValue, currency)}</TableCell>
                                            <TableCell className="text-right text-[var(--color-text-subtle)]">{formatMoney(stats.invoiced, currency)}</TableCell>
                                            <TableCell className={`text-right ${stats.outstanding > 0 ? 'text-amber-700 font-medium' : 'text-[var(--color-text-muted)]'}`}>
                                                {stats.outstanding > 0 ? formatMoney(stats.outstanding, currency) : '—'}
                                            </TableCell>
                                            <TableCell className={`text-right ${stats.overdue > 0 ? 'text-rose-700 font-semibold' : 'text-[var(--color-text-muted)]'}`}>
                                                {stats.overdue > 0 ? formatMoney(stats.overdue, currency) : '—'}
                                            </TableCell>
                                            <TableCell className="text-right text-[var(--color-text-subtle)]">{formatMoney(contract.revenueRecognized, currency)}</TableCell>
                                            <TableCell>
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" size="icon" className="h-8 w-8">
                                                            <MoreVertical className="h-4 w-4" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        <DropdownMenuItem onClick={() => router.push(`/contracts/${contract.id}`)}>
                                                            Open Contract
                                                        </DropdownMenuItem>
                                                        {sourceDeal && (
                                                            <DropdownMenuItem onClick={() => router.push(`/crm/${sourceDeal.id}`)}>
                                                                View Source Deal
                                                            </DropdownMenuItem>
                                                        )}
                                                        {linkedProject && (
                                                            <DropdownMenuItem onClick={() => router.push(`/projects/${linkedProject.id}`)}>
                                                                View Linked Project
                                                            </DropdownMenuItem>
                                                        )}
                                                        <DropdownMenuItem onClick={() => setEditContract({ id: contract.id, status: contract.status, notes: contract.notes ?? '' })}>
                                                            Edit Status / Notes
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem
                                                            className="text-rose-600"
                                                            onClick={() => openArchive(contract.id)}
                                                        >
                                                            Archive
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                                {contracts.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={11} className="text-center py-6 text-[var(--color-text-muted)]">No active contracts found. Win a deal in the CRM to auto-generate a contract.</TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </Card>
                </TabsContent>

                <TabsContent value="milestones">
                    <div className="flex justify-end mb-4">
                        <Dialog open={isMilestoneOpen} onOpenChange={setIsMilestoneOpen}>
                            <DialogTrigger asChild>
                                <Button variant="outline" className="gap-2">
                                    <Plus className="h-4 w-4" /> Add Milestone
                                </Button>
                            </DialogTrigger>
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>Add Milestone</DialogTitle>
                                    <DialogDescription>Create a billing milestone for a contract.</DialogDescription>
                                </DialogHeader>
                                <div className="space-y-4 py-2">
                                    <p className="text-xs text-[var(--color-text-subtle)]">Fields marked <span className="text-destructive">*</span> are required.</p>
                                    <div className="space-y-1.5">
                                        <label className="text-sm font-medium">Contract <span className="text-destructive">*</span></label>
                                        <Select value={msContractId} onValueChange={v => { setMsContractId(v); if (msErrors.contractId) setMsErrors(p => ({ ...p, contractId: undefined })); }}>
                                            <SelectTrigger aria-invalid={!!msErrors.contractId}><SelectValue placeholder="Please select" /></SelectTrigger>
                                            <SelectContent>
                                                {contracts.map(c => (
                                                    <SelectItem key={c.id} value={c.id}>
                                                        {c.contractNumber ?? c.id.slice(0, 8)} — {c.client}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        {msErrors.contractId && <p className="text-xs text-destructive">{msErrors.contractId}</p>}
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-sm font-medium">Milestone Name <span className="text-destructive">*</span></label>
                                        <Input
                                            value={msName}
                                            onChange={e => { setMsName(e.target.value); if (msErrors.name) setMsErrors(p => ({ ...p, name: undefined })); }}
                                            onBlur={() => { if (!msName.trim()) setMsErrors(p => ({ ...p, name: 'Please enter a milestone name.' })); }}
                                            placeholder="e.g. Phase 1 Delivery"
                                            aria-invalid={!!msErrors.name}
                                        />
                                        {msErrors.name && <p className="text-xs text-destructive">{msErrors.name}</p>}
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1.5">
                                            <label className="text-sm font-medium">Due Date <span className="text-destructive">*</span></label>
                                            <Input
                                                type="date"
                                                value={msDueDate}
                                                onChange={e => { setMsDueDate(e.target.value); if (msErrors.dueDate) setMsErrors(p => ({ ...p, dueDate: undefined })); }}
                                                aria-invalid={!!msErrors.dueDate}
                                            />
                                            {msErrors.dueDate && <p className="text-xs text-destructive">{msErrors.dueDate}</p>}
                                        </div>
                                        <div className="space-y-1.5">
                                    <label className="text-sm font-medium">Amount ({CURRENCY_CONFIG[currency].symbol}) <span className="text-destructive">*</span></label>
                                            <Input
                                                type="number" min="0"
                                                value={msAmount}
                                                onChange={e => { setMsAmount(e.target.value); if (msErrors.amount) setMsErrors(p => ({ ...p, amount: undefined })); }}
                                                onBlur={() => { if (!msAmount || Number(msAmount) <= 0) setMsErrors(p => ({ ...p, amount: 'Enter a valid amount.' })); }}
                                                placeholder="5000"
                                                aria-invalid={!!msErrors.amount}
                                            />
                                            {msErrors.amount && <p className="text-xs text-destructive">{msErrors.amount}</p>}
                                        </div>
                                    </div>
                                    <Button
                                        className="w-full bg-[#171717] hover:bg-[#00a7f4]"
                                        onClick={handleCreateMilestone}
                                        disabled={createMilestone.isPending}
                                    >
                                        {createMilestone.isPending ? 'Creating...' : 'Add Milestone'}
                                    </Button>
                                </div>
                            </DialogContent>
                        </Dialog>
                    </div>
                    <Card variant="plain">
                        <Table>
                            <TableHeader className="bg-white">
                                <TableRow>
                                    <TableHead>Contract</TableHead>
                                    <TableHead>Milestone Name</TableHead>
                                    <TableHead>Due Date</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Amount</TableHead>
                                    <TableHead className="w-[50px]"></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {milestones.map(ms => {
                                    const contract = contracts.find(c => c.id === ms.contractId);
                                    return (
                                        <TableRow key={ms.id}>
                                            <TableCell className="text-[var(--color-text-subtle)] text-sm">{contract?.contractNumber ?? ms.contractId.slice(0, 8)}</TableCell>
                                            <TableCell className="font-medium">{ms.name}</TableCell>
                                            <TableCell>{ms.dueDate}</TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className={
                                                    ms.status === 'Completed' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                                    ms.status === 'In Progress' ? 'bg-[#00a7f4]/5 text-[#0086c4] border-[#00a7f4]/20' :
                                                        'bg-amber-50 text-amber-700 border-amber-200'
                                                }>
                                                    {ms.status}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right font-medium">{formatMoney(ms.amount, currency)}</TableCell>
                                            <TableCell>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 text-rose-500 hover:text-rose-600"
                                                    onClick={() => {
                                                        setDeletingMilestoneId(ms.id);
                                                        setDeleteMilestoneOpen(true);
                                                    }}
                                                    disabled={deleteMilestone.isPending}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                                {milestones.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={6} className="text-center py-6 text-[var(--color-text-muted)]">No milestones yet. Add milestones to track delivery phases.</TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </Card>
                </TabsContent>

                <TabsContent value="invoices">
                    <Card variant="plain">
                        <Table>
                            <TableHeader className="bg-white">
                                <TableRow>
                                    <TableHead>Invoice #</TableHead>
                                    <TableHead>Contract</TableHead>
                                    <TableHead>Issue Date</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Amount</TableHead>
                                    <TableHead className="w-[50px]"></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {invoices.map((invoice) => {
                                    const contract = contracts.find(c => c.id === invoice.contractId);
                                    return (
                                        <TableRow key={invoice.id}>
                                            <TableCell className="font-medium">{invoice.invoiceNumber ?? invoice.id.slice(0, 8)}</TableCell>
                                            <TableCell className="text-[var(--color-text-subtle)]">{contract?.contractNumber ?? invoice.contractId.slice(0, 8)}</TableCell>
                                            <TableCell>{invoice.issueDate}</TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className={
                                                    invoice.status === 'Paid' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                                        invoice.status === 'Partially Paid' ? 'bg-sky-50 text-sky-700 border-sky-200' :
                                                            invoice.status === 'Pending' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                                                invoice.status === 'Overdue' ? 'bg-red-50 text-red-700 border-red-200' :
                                                                    'bg-slate-100 text-slate-700 border-slate-200'
                                                }>
                                                    {invoice.status}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right font-medium">
                                                {formatMoney(invoice.amount, currency)}
                                                {(invoice.paidAmount ?? 0) > 0 && invoice.status !== 'Paid' && (
                                                    <div className="text-xs text-[var(--color-text-muted)] font-normal">paid {formatMoney(invoice.paidAmount ?? 0, currency)}</div>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" size="icon" className="h-8 w-8">
                                                            <MoreVertical className="h-4 w-4" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        <DropdownMenuItem onClick={() => router.push(`/contracts/${invoice.contractId}`)}>
                                                            Open contract
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem><Download className="h-4 w-4 mr-2" /> Download PDF</DropdownMenuItem>
                                                        {invoice.status !== 'Paid' && invoice.status !== 'Cancelled' && (
                                                            <DropdownMenuItem onClick={() => payInvoice.mutate(invoice.id)}>
                                                                <CheckCircle2 className="h-4 w-4 mr-2" /> Mark fully paid
                                                            </DropdownMenuItem>
                                                        )}
                                                        <DropdownMenuItem
                                                            className="text-rose-600"
                                                            onClick={() => openDeleteInvoice(invoice.id)}
                                                        >
                                                            <Trash2 className="h-4 w-4 mr-2" /> Delete
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                                {invoices.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={6} className="text-center py-6 text-[var(--color-text-muted)]">No invoices yet. Use the Create Invoice button above.</TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </Card>
                </TabsContent>

            </Tabs> : (
                /* Flag-off rendering: no tabs, no invoice-derived columns, just
                 * the contracts list. Milestone + Invoice tabs come back when
                 * MILESTONES_INVOICES_ENABLED flips to true. */
                <Card variant="plain">
                    <Table>
                        <TableHeader className="bg-white">
                            <TableRow>
                                <TableHead>{t('contract_id')}</TableHead>
                                <TableHead>{t('client')}</TableHead>
                                <TableHead>{t('source_deal')}</TableHead>
                                <TableHead>{t('linked_project')}</TableHead>
                                <TableHead>{t('status')}</TableHead>
                                <TableHead className="text-right">{t('total_value_col')}</TableHead>
                                <TableHead className="w-[50px]"></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {contracts.map((contract) => {
                                const sourceDeal    = deals.find(d => d.id === contract.dealId);
                                const linkedProject = projects.find(p => p.contractId === contract.id);
                                return (
                                    <TableRow key={contract.id}>
                                        <TableCell className="font-medium">
                                            <button
                                                className="text-[var(--color-brand-500)] hover:underline text-left"
                                                onClick={() => router.push(`/contracts/${contract.id}`)}
                                            >
                                                {contract.contractNumber ?? contract.id}
                                            </button>
                                        </TableCell>
                                        <TableCell>{contract.client}</TableCell>
                                        <TableCell>
                                            {sourceDeal ? (
                                                <button
                                                    className="text-sm text-[var(--color-brand-500)] hover:underline text-left"
                                                    onClick={() => router.push(`/crm/${sourceDeal.id}`)}
                                                >
                                                    {sourceDeal.name}
                                                </button>
                                            ) : (
                                                <span className="text-[var(--color-text-muted)] text-sm">—</span>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            {linkedProject ? (
                                                <button
                                                    className="text-sm text-[var(--color-info-700)] hover:underline text-left"
                                                    onClick={() => router.push(`/projects/${linkedProject.id}`)}
                                                >
                                                    {linkedProject.projectNumber ?? linkedProject.name}
                                                </button>
                                            ) : (
                                                <span className="text-[var(--color-text-muted)] text-sm">—</span>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="outline" className={
                                                contract.status === 'Active' ? 'bg-[#00a7f4]/5 text-[#0086c4] border-[#00a7f4]/20' :
                                                contract.status === 'Signed' ? 'bg-violet-50 text-violet-700 border-violet-200' :
                                                contract.status === 'Completed' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                                contract.status === 'Cancelled' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                                                    'bg-slate-100 text-slate-700 border-slate-200'
                                            }>
                                                {contract.status}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right font-medium">{formatMoney(contract.totalValue, currency)}</TableCell>
                                        <TableCell>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8">
                                                        <MoreVertical className="h-4 w-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuItem onClick={() => router.push(`/contracts/${contract.id}`)}>
                                                        {t('open_contract_menu')}
                                                    </DropdownMenuItem>
                                                    {sourceDeal && (
                                                        <DropdownMenuItem onClick={() => router.push(`/crm/${sourceDeal.id}`)}>
                                                            {t('view_source_deal')}
                                                        </DropdownMenuItem>
                                                    )}
                                                    {linkedProject && (
                                                        <DropdownMenuItem onClick={() => router.push(`/projects/${linkedProject.id}`)}>
                                                            {t('view_linked_project')}
                                                        </DropdownMenuItem>
                                                    )}
                                                    <DropdownMenuItem onClick={() => setEditContract({ id: contract.id, status: contract.status, notes: contract.notes ?? '' })}>
                                                        {t('edit_status_notes')}
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem
                                                        className="text-rose-600"
                                                        onClick={() => openArchive(contract.id)}
                                                    >
                                                        {t('archive')}
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                            {contracts.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={7} className="text-center py-6 text-[var(--color-text-muted)]">{t('no_active_contracts_found')}</TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </Card>
            ))}

            {/* Edit Contract Dialog */}
            <Dialog open={!!editContract} onOpenChange={open => !open && setEditContract(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t('edit_contract')}</DialogTitle>
                        <DialogDescription>{t('edit_contract_desc')}</DialogDescription>
                    </DialogHeader>
                    {editContract && (
                        <div className="space-y-4 py-2">
                            <div className="space-y-2">
                                <label className="text-sm font-medium">{t('status')}</label>
                                <Select value={editContract.status} onValueChange={v => setEditContract({ ...editContract, status: v })}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Draft">{t('contract_status_draft')}</SelectItem>
                                        <SelectItem value="Signed">{t('contract_status_signed')}</SelectItem>
                                        <SelectItem value="Active">{t('contract_status_active')}</SelectItem>
                                        <SelectItem value="Completed">{t('contract_status_completed')}</SelectItem>
                                        <SelectItem value="Cancelled">{t('contract_status_cancelled')}</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium">{t('notes')}</label>
                                <Input value={editContract.notes} onChange={e => setEditContract({ ...editContract, notes: e.target.value })} placeholder={t('optional_notes_placeholder')} />
                            </div>
                            <Button
                                className="w-full bg-[#171717] hover:bg-[#00a7f4]"
                                onClick={handleUpdateContract}
                                disabled={updateContract.isPending}
                            >
                                {updateContract.isPending ? t('saving') : t('save_changes')}
                            </Button>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* -- Archive Contract Confirm Dialog -------------------------------- */}
            <Dialog open={archiveOpen} onOpenChange={setArchiveOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>{t('archive_contract')}</DialogTitle>
                    </DialogHeader>
                    <p className="text-sm text-[var(--color-text-subtle)]">
                        {t('archive_contract_confirm')}
                    </p>
                    <div className="flex justify-end gap-3 mt-4">
                        <Button variant="outline" onClick={() => setArchiveOpen(false)}>{t('cancel')}</Button>
                        <Button variant="destructive" onClick={handleArchive} disabled={deleteContract.isPending}>
                            {deleteContract.isPending ? t('archiving') : t('archive')}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {MILESTONES_INVOICES_ENABLED && <>
                {/* -- Delete Invoice Confirm Dialog ---------------------------------- */}
                <Dialog open={deleteInvoiceOpen} onOpenChange={setDeleteInvoiceOpen}>
                    <DialogContent className="sm:max-w-md">
                        <DialogHeader>
                            <DialogTitle>Delete Invoice</DialogTitle>
                        </DialogHeader>
                        <p className="text-sm text-[var(--color-text-subtle)]">
                            Are you sure you want to delete this invoice? This action cannot be undone.
                        </p>
                        <div className="flex justify-end gap-3 mt-4">
                            <Button variant="outline" onClick={() => setDeleteInvoiceOpen(false)}>Cancel</Button>
                            <Button variant="destructive" onClick={handleDeleteInvoice} disabled={deleteInvoice.isPending}>
                                {deleteInvoice.isPending ? 'Deleting...' : 'Delete'}
                            </Button>
                        </div>
                    </DialogContent>
                </Dialog>

                {/* -- Delete Milestone Confirm Dialog --------------------------------- */}
                <Dialog open={deleteMilestoneOpen} onOpenChange={setDeleteMilestoneOpen}>
                    <DialogContent className="sm:max-w-md">
                        <DialogHeader>
                            <DialogTitle>Delete Milestone</DialogTitle>
                        </DialogHeader>
                        <p className="text-sm text-[var(--color-text-subtle)]">
                            Are you sure you want to delete this milestone? This action cannot be undone.
                        </p>
                        <div className="flex justify-end gap-3 mt-4">
                            <Button variant="outline" onClick={() => setDeleteMilestoneOpen(false)}>Cancel</Button>
                            <Button variant="destructive" onClick={handleDeleteMilestone} disabled={deleteMilestone.isPending}>
                                {deleteMilestone.isPending ? 'Deleting...' : 'Delete'}
                            </Button>
                        </div>
                    </DialogContent>
                </Dialog>
            </>}
        </div>
    );
}
