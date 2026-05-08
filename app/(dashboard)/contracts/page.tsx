'use client';

import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import { useDealList } from '@/lib/queries/deals';
import { useProjectList } from '@/lib/queries/projects';
import { useBusinessStore } from '@/store/businessStore';
import { useTenantStore, type Currency } from '@/store/tenantStore';
import { formatMoney } from '@/lib/currency';
import { useRouter } from 'next/navigation';

export default function ContractsPage() {
    const router = useRouter();
    const { activeTenantId, currentTenant, tenants } = useTenantStore();
    const currency = (currentTenant?.currency as Currency) ?? tenants.find((t) => t.id === activeTenantId)?.currency ?? 'MMK';
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
    const isLoading = contractsQuery.isLoading || invoicesQuery.isLoading;
    const isError = contractsQuery.isError || invoicesQuery.isError;
    const retry = () => {
        contractsQuery.refetch();
        invoicesQuery.refetch();
    };

    // ── Create Invoice state ────────────────────────────────────────────────
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
        setIsInvoiceOpen(false);
        setInvContractId('');
        setInvMilestoneId('');
        setInvAmount('');
        setInvTax('0');
        setInvNotes('');
        setInvErrors({});
    };

    // ── Create Milestone state ──────────────────────────────────────────────
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

    // ── Edit Contract state ────────────────────────────────────────────────
    const [editContract, setEditContract] = useState<{ id: string; status: string; notes: string } | null>(null);

    // ── Confirm dialog states ───────────────────────────────────────────────
    const [archiveOpen, setArchiveOpen] = useState(false);
    const [archivingContract, setArchivingContract] = useState<string | null>(null);
    const [deleteInvoiceOpen, setDeleteInvoiceOpen] = useState(false);
    const [deletingInvoiceId, setDeletingInvoiceId] = useState<string | null>(null);
    const [deleteMilestoneOpen, setDeleteMilestoneOpen] = useState(false);
    const [deletingMilestoneId, setDeletingMilestoneId] = useState<string | null>(null);

    const handleUpdateContract = async () => {
        if (!editContract) return;
        await updateContract.mutateAsync({ id: editContract.id, updates: { status: editContract.status as 'Active' | 'Completed' | 'Draft' | 'Cancelled', notes: editContract.notes } });
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
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900">Contracts & Billing</h1>
                    <p className="text-slate-500 mt-1">Manage active contracts, milestones, and client invoices.</p>
                </div>
                <Dialog open={isInvoiceOpen} onOpenChange={setIsInvoiceOpen}>
                    <DialogTrigger asChild>
                        <Button className="bg-slate-900 gap-2">
                            <Plus className="h-4 w-4" /> Create Invoice
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Create Invoice</DialogTitle>
                            <DialogDescription>Issue an invoice against an active contract.</DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-2">
                            <p className="text-xs text-muted-foreground">Fields marked <span className="text-destructive">*</span> are required.</p>
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
                                <label className="text-sm font-medium">Milestone <span className="text-muted-foreground text-xs font-normal">(optional)</span></label>
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
                                    <label className="text-sm font-medium">Due Date <span className="text-muted-foreground text-xs font-normal">(optional)</span></label>
                                    <Input type="date" value={invDueDate} onChange={e => setInvDueDate(e.target.value)} />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium">Amount ({currency}) <span className="text-destructive">*</span></label>
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
                                    <label className="text-sm font-medium">Tax ($) <span className="text-muted-foreground text-xs font-normal">(optional)</span></label>
                                    <Input type="number" min="0" step="0.01" value={invTax} onChange={e => setInvTax(e.target.value)} placeholder="0" />
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium">Notes <span className="text-muted-foreground text-xs font-normal">(optional)</span></label>
                                <Input value={invNotes} onChange={e => setInvNotes(e.target.value)} placeholder="e.g. Payment for Phase 1 delivery" />
                            </div>
                            <Button
                                className="w-full bg-slate-900"
                                onClick={handleCreateInvoice}
                                disabled={createInvoice.isPending}
                            >
                                {createInvoice.isPending ? 'Creating...' : 'Create Invoice'}
                            </Button>
                        </div>
                    </DialogContent>
                </Dialog>
            </div>

            {isLoading && (
                <Card className="h-40 animate-pulse border-slate-100 bg-slate-100 shadow-sm" />
            )}

            {isError && (
                <Card className="border-slate-100 shadow-sm">
                    <CardContent className="flex h-40 flex-col items-center justify-center gap-3">
                        <p className="text-sm text-slate-600">Could not load contracts or invoices.</p>
                        <Button variant="outline" onClick={retry}>Retry</Button>
                    </CardContent>
                </Card>
            )}

            {!isLoading && !isError && <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="shadow-sm border-slate-100">
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-slate-500">Active Contracts</p>
                            <FileText className="h-5 w-5 text-blue-500" />
                        </div>
                        <div className="mt-2 flex items-baseline gap-2">
                            <span className="text-3xl font-bold tracking-tight text-slate-900">{contracts.filter(c => c.status === 'Active').length}</span>
                        </div>
                    </CardContent>
                </Card>
                <Card className="shadow-sm border-slate-100">
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-slate-500">Total Contract Value</p>
                            <div className="h-8 w-8 rounded-full bg-emerald-100 flex items-center justify-center">
                                <span className="text-emerald-600 font-bold text-xs">{currency}</span>
                            </div>
                        </div>
                        <div className="mt-2 flex items-baseline gap-2">
                            <span className="text-3xl font-bold tracking-tight text-slate-900">{formatMoney(totalContractValue, currency)}</span>
                        </div>
                    </CardContent>
                </Card>
                <Card className="shadow-sm border-slate-100">
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-slate-500">Revenue Recognized</p>
                            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                        </div>
                        <div className="mt-2 flex items-baseline gap-2">
                            <span className="text-3xl font-bold tracking-tight text-emerald-600">{formatMoney(totalRecognized, currency)}</span>
                            <span className="text-sm font-medium text-slate-500">
                                ({totalContractValue > 0 ? Math.round((totalRecognized / totalContractValue) * 100) : 0}%)
                            </span>
                        </div>
                    </CardContent>
                </Card>
            </div>}

            {!isLoading && !isError && <Tabs defaultValue="contracts" className="space-y-6">
                <TabsList className="bg-slate-100/50 p-1 border border-slate-200/60">
                    <TabsTrigger value="contracts" className="data-[state=active]:bg-white data-[state=active]:shadow-sm">Active Contracts</TabsTrigger>
                    <TabsTrigger value="milestones" className="data-[state=active]:bg-white data-[state=active]:shadow-sm">Milestones</TabsTrigger>
                    <TabsTrigger value="invoices" className="data-[state=active]:bg-white data-[state=active]:shadow-sm">Invoices</TabsTrigger>
                </TabsList>

                <TabsContent value="contracts">
                    <Card className="shadow-sm border-slate-100">
                        <Table>
                            <TableHeader className="bg-slate-50">
                                <TableRow>
                                    <TableHead>Contract ID</TableHead>
                                    <TableHead>Client</TableHead>
                                    <TableHead>Source Deal</TableHead>
                                    <TableHead>Linked Project</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Total Value</TableHead>
                                    <TableHead className="text-right">Recognized</TableHead>
                                    <TableHead className="w-[50px]"></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {contracts.map((contract) => {
                                    const sourceDeal     = deals.find(d => d.id === contract.dealId);
                                    const linkedProject  = projects.find(p => p.contractId === contract.id);
                                    return (
                                        <TableRow key={contract.id}>
                                            <TableCell className="font-medium">{contract.contractNumber ?? contract.id}</TableCell>
                                            <TableCell>{contract.client}</TableCell>
                                            <TableCell>
                                                {sourceDeal ? (
                                                    <button
                                                        className="text-sm text-blue-600 hover:underline text-left"
                                                        onClick={() => router.push(`/crm/${sourceDeal.id}`)}
                                                    >
                                                        {sourceDeal.name}
                                                    </button>
                                                ) : (
                                                    <span className="text-slate-400 text-sm">—</span>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                {linkedProject ? (
                                                    <button
                                                        className="text-sm text-purple-600 hover:underline text-left"
                                                        onClick={() => router.push('/projects')}
                                                    >
                                                        {linkedProject.projectNumber ?? linkedProject.name}
                                                    </button>
                                                ) : (
                                                    <span className="text-slate-400 text-sm">—</span>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className={
                                                    contract.status === 'Active' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                                    contract.status === 'Completed' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                                        'bg-slate-100 text-slate-700 border-slate-200'
                                                }>
                                                    {contract.status}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right font-medium">{formatMoney(contract.totalValue, currency)}</TableCell>
                                            <TableCell className="text-right text-slate-600">{formatMoney(contract.revenueRecognized, currency)}</TableCell>
                                            <TableCell>
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" size="icon" className="h-8 w-8">
                                                            <MoreVertical className="h-4 w-4" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        {sourceDeal && (
                                                            <DropdownMenuItem onClick={() => router.push(`/crm/${sourceDeal.id}`)}>
                                                                View Source Deal
                                                            </DropdownMenuItem>
                                                        )}
                                                        {linkedProject && (
                                                            <DropdownMenuItem onClick={() => router.push('/projects')}>
                                                                View Linked Project
                                                            </DropdownMenuItem>
                                                        )}
                                                        <DropdownMenuItem onClick={() => setEditContract({ id: contract.id, status: contract.status, notes: contract.notes ?? '' })}>
                                                            Edit Contract
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
                                        <TableCell colSpan={8} className="text-center py-6 text-slate-500">No active contracts found. Win a deal in the CRM to auto-generate a contract.</TableCell>
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
                                    <p className="text-xs text-muted-foreground">Fields marked <span className="text-destructive">*</span> are required.</p>
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
                                            <label className="text-sm font-medium">Amount ($) <span className="text-destructive">*</span></label>
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
                                        className="w-full bg-slate-900"
                                        onClick={handleCreateMilestone}
                                        disabled={createMilestone.isPending}
                                    >
                                        {createMilestone.isPending ? 'Creating...' : 'Add Milestone'}
                                    </Button>
                                </div>
                            </DialogContent>
                        </Dialog>
                    </div>
                    <Card className="shadow-sm border-slate-100">
                        <Table>
                            <TableHeader className="bg-slate-50">
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
                                            <TableCell className="text-slate-600 text-sm">{contract?.contractNumber ?? ms.contractId.slice(0, 8)}</TableCell>
                                            <TableCell className="font-medium">{ms.name}</TableCell>
                                            <TableCell>{ms.dueDate}</TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className={
                                                    ms.status === 'Completed' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                                    ms.status === 'In Progress' ? 'bg-blue-50 text-blue-700 border-blue-200' :
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
                                        <TableCell colSpan={6} className="text-center py-6 text-slate-500">No milestones yet. Add milestones to track delivery phases.</TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </Card>
                </TabsContent>

                <TabsContent value="invoices">
                    <Card className="shadow-sm border-slate-100">
                        <Table>
                            <TableHeader className="bg-slate-50">
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
                                            <TableCell className="text-slate-600">{contract?.contractNumber ?? invoice.contractId.slice(0, 8)}</TableCell>
                                            <TableCell>{invoice.issueDate}</TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className={
                                                    invoice.status === 'Paid' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                                        invoice.status === 'Pending' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                                            invoice.status === 'Overdue' ? 'bg-red-50 text-red-700 border-red-200' :
                                                                'bg-slate-100 text-slate-700 border-slate-200'
                                                }>
                                                    {invoice.status}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right font-medium">{formatMoney(invoice.amount, currency)}</TableCell>
                                            <TableCell>
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" size="icon" className="h-8 w-8">
                                                            <MoreVertical className="h-4 w-4" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        <DropdownMenuItem><Download className="h-4 w-4 mr-2" /> Download PDF</DropdownMenuItem>
                                                        {invoice.status === 'Pending' || invoice.status === 'Overdue' ? (
                                                            <DropdownMenuItem onClick={() => payInvoice.mutate(invoice.id)}>
                                                                <CheckCircle2 className="h-4 w-4 mr-2" /> Mark as Paid
                                                            </DropdownMenuItem>
                                                        ) : null}
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
                                        <TableCell colSpan={6} className="text-center py-6 text-slate-500">No invoices yet. Use the Create Invoice button above.</TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </Card>
                </TabsContent>

            </Tabs>}

            {/* Edit Contract Dialog */}
            <Dialog open={!!editContract} onOpenChange={open => !open && setEditContract(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Edit Contract</DialogTitle>
                        <DialogDescription>Update contract status or notes.</DialogDescription>
                    </DialogHeader>
                    {editContract && (
                        <div className="space-y-4 py-2">
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Status</label>
                                <Select value={editContract.status} onValueChange={v => setEditContract({ ...editContract, status: v })}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Active">Active</SelectItem>
                                        <SelectItem value="Completed">Completed</SelectItem>
                                        <SelectItem value="Draft">Draft</SelectItem>
                                        <SelectItem value="Cancelled">Cancelled</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Notes</label>
                                <Input value={editContract.notes} onChange={e => setEditContract({ ...editContract, notes: e.target.value })} placeholder="Optional notes..." />
                            </div>
                            <Button
                                className="w-full bg-slate-900"
                                onClick={handleUpdateContract}
                                disabled={updateContract.isPending}
                            >
                                {updateContract.isPending ? 'Saving...' : 'Save Changes'}
                            </Button>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* ── Archive Contract Confirm Dialog ──────────────────────────────── */}
            <Dialog open={archiveOpen} onOpenChange={setArchiveOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Archive Contract</DialogTitle>
                    </DialogHeader>
                    <p className="text-sm text-slate-600">
                        Are you sure you want to archive this contract? This action cannot be undone.
                    </p>
                    <div className="flex justify-end gap-3 mt-4">
                        <Button variant="outline" onClick={() => setArchiveOpen(false)}>Cancel</Button>
                        <Button variant="destructive" onClick={handleArchive} disabled={deleteContract.isPending}>
                            {deleteContract.isPending ? 'Archiving...' : 'Archive'}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* ── Delete Invoice Confirm Dialog ────────────────────────────────── */}
            <Dialog open={deleteInvoiceOpen} onOpenChange={setDeleteInvoiceOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Delete Invoice</DialogTitle>
                    </DialogHeader>
                    <p className="text-sm text-slate-600">
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

            {/* ── Delete Milestone Confirm Dialog ───────────────────────────────── */}
            <Dialog open={deleteMilestoneOpen} onOpenChange={setDeleteMilestoneOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Delete Milestone</DialogTitle>
                    </DialogHeader>
                    <p className="text-sm text-slate-600">
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
        </div>
    );
}
