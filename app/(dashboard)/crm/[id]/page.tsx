'use client';

import { useParams, useRouter } from 'next/navigation';
import { useBusinessStore } from '@/store/businessStore';
import { useDealDetail, useDealMutations } from '@/lib/queries/deals';
import { useContractList } from '@/lib/queries/contracts';
import { useProjectList } from '@/lib/queries/projects';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
    ArrowLeft, Edit3, Users, FileText, DollarSign, Target, Calendar, Clock,
    TrendingUp, Briefcase, Trophy, ChevronRight, Calculator, ExternalLink,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { formatMoney } from '@/lib/currency';
import { useTenantCurrency } from '@/hooks/useTenantCurrency';
import { PermissionGuard } from '@/components/PermissionGuard';
import { ContractDocumentUploader } from '@/components/crm/ContractDocumentUploader';
import { usePermission } from '@/hooks/usePermission';
import { isContractEligible } from '@/lib/dealRanks';
import { useContractDrafts } from '@/lib/queries/contractDrafts';
import { Sparkles } from 'lucide-react';

// Rank labels (lead → C, qualified → B, negotiation → A, won → S, lost → D).
// The old "Proposal" stage was merged into Qualified — see
// 2026_05_12_000001_collapse_proposal_into_qualified.php.
const STAGE_CONFIG: Record<string, { label: string; color: string }> = {
    lead:        { label: 'C — Lead',        color: 'bg-slate-100 text-slate-700 border-slate-200' },
    qualified:   { label: 'B — Qualified',   color: 'bg-blue-50 text-blue-700 border-blue-200' },
    negotiation: { label: 'A — Negotiation', color: 'bg-purple-50 text-purple-700 border-purple-200' },
    won:         { label: 'S — Won',         color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    lost:        { label: 'D — Lost',        color: 'bg-red-50 text-red-700 border-red-200' },
};

// ── Workflow status bar ───────────────────────────────────────────────────────

interface WorkflowStep {
    label: string;
    detail: string;
    active: boolean;
    done: boolean;
}

function WorkflowBar({ steps }: { steps: WorkflowStep[] }) {
    return (
        <div className="flex items-center gap-0 rounded-lg border border-slate-200 bg-white overflow-hidden">
            {steps.map((step, i) => (
                <div key={step.label} className="flex items-center flex-1">
                    <div className={`flex-1 px-4 py-3 ${step.done ? 'bg-emerald-50' : step.active ? 'bg-blue-50' : 'bg-slate-50'}`}>
                        <p className={`text-xs font-semibold uppercase tracking-wide ${step.done ? 'text-emerald-700' : step.active ? 'text-blue-700' : 'text-slate-400'}`}>
                            {step.label}
                        </p>
                        <p className={`text-xs mt-0.5 ${step.done ? 'text-emerald-600' : step.active ? 'text-blue-600' : 'text-slate-400'}`}>
                            {step.detail}
                        </p>
                    </div>
                    {i < steps.length - 1 && (
                        <ChevronRight className={`h-4 w-4 flex-shrink-0 ${step.done ? 'text-emerald-400' : 'text-slate-300'}`} />
                    )}
                </div>
            ))}
        </div>
    );
}

export default function DealDetailPage() {
    const params  = useParams();
    const router  = useRouter();
    const dealId  = params.id as string;
    const store   = useBusinessStore();
    const currency = useTenantCurrency();

    const dealQuery      = useDealDetail(dealId);
    // winDeal is no longer triggered from this page — the only path to S/won
    // is uploading an AI-approved contract document (ContractDocumentUploader).
    const { deleteDeal } = useDealMutations();
    const contractsQuery = useContractList();
    const projectsQuery  = useProjectList();

    const dealToEdit = dealQuery.data ?? store.deals.find(d => d.id === dealId);
    const contracts  = useMemo(() => contractsQuery.data?.data ?? [], [contractsQuery.data]);
    const projects   = useMemo(() => projectsQuery.data?.data  ?? [], [projectsQuery.data]);

    const [deleteOpen, setDeleteOpen] = useState(false);
    const { allowed: canManageCrm } = usePermission('manage_crm');

    // chg-011 Phase C: AI contract drafting button + "open existing draft" link.
    const draftsQuery = useContractDrafts(dealId);
    const activeDraft = useMemo(() => {
        const drafts = draftsQuery.data ?? [];
        return drafts.find(d => d.status !== 'superseded') ?? null;
    }, [draftsQuery.data]);
    const canGenerateDraft = !!dealToEdit && isContractEligible(dealToEdit);

    // ── Use proper foreign-key matching ───────────────────────────────────────
    const linkedContract = useMemo(
        () => contracts.find(c => c.dealId === dealToEdit?.id),
        [contracts, dealToEdit]
    );

    const linkedProject = useMemo(
        () => linkedContract
            ? projects.find(p => p.contractId === linkedContract.id)
            : undefined,
        [projects, linkedContract]
    );

    const baseLaborCost = useMemo(() => {
        if (!dealToEdit?.ghostRoles) return 0;
        // `GhostRole.months` is the allocation PERCENTAGE (1–100), not a month count —
        // legacy naming. Convert to a fraction and multiply by the deal's actual
        // timelineMonths to get the lifetime labor cost (not just one month's worth).
        const months = dealToEdit.timelineMonths || 1;
        return dealToEdit.ghostRoles.reduce((sum, r) => {
            const avgSalary  = ((r.minMonthlySalary || 0) + (r.maxMonthlySalary || 0)) / 2;
            const allocFrac  = (r.months || 100) / 100;
            return sum + (r.quantity || 0) * allocFrac * months * avgSalary;
        }, 0);
    }, [dealToEdit]);

    if (dealQuery.isLoading) {
        return (
            <div className="p-8 flex items-center justify-center">
                <p className="text-sm text-slate-500 animate-pulse">Loading deal...</p>
            </div>
        );
    }

    if (dealQuery.isError || !dealToEdit) {
        return (
            <div className="p-8 space-y-3">
                <p className="text-sm text-destructive">Could not load this deal.</p>
                <Button variant="outline" onClick={() => dealQuery.refetch()}>Retry</Button>
            </div>
        );
    }

    const stage     = dealToEdit.status ?? 'lead';
    const stageInfo = STAGE_CONFIG[stage] ?? STAGE_CONFIG.lead;
    const isWon     = stage === 'won';
    const isLost    = stage === 'lost';
    const isClosed  = isWon || isLost;

    const marginPct = dealToEdit.clientBudget && dealToEdit.clientBudget > 0 && dealToEdit.estimatedGrossProfit !== undefined
        ? (dealToEdit.estimatedGrossProfit / dealToEdit.clientBudget) * 100
        : undefined;

    const getMarginColor = (m: number) => {
        if (m < 0)  return 'text-red-500';
        if (m < 10) return 'text-yellow-500';
        return 'text-green-500';
    };

    // Workflow steps — lost deals never produce a contract or project, so
    // "Pending" is misleading. Show "N/A" instead so the row reads as terminal.
    const downstreamLabel = (current: string | undefined) => {
        if (isLost) return 'N/A — Deal Lost';
        if (current) return current;
        return isWon ? 'Created' : 'Pending';
    };
    const workflowSteps: WorkflowStep[] = [
        {
            label: 'Deal',
            detail: stageInfo.label,
            done:   isWon,
            active: !isClosed,
        },
        {
            label: 'Contract',
            detail: downstreamLabel(
                linkedContract
                    ? `${linkedContract.contractNumber ?? linkedContract.id.slice(0, 8)} · ${linkedContract.status}`
                    : undefined,
            ),
            done:   !!linkedContract,
            active: isWon && !linkedContract,
        },
        {
            label: 'Project',
            detail: downstreamLabel(
                linkedProject
                    ? `${linkedProject.projectNumber ?? linkedProject.id.slice(0, 8)} · ${linkedProject.status}`
                    : undefined,
            ),
            done:   !!linkedProject,
            active: !!linkedContract && !linkedProject,
        },
    ];

    return (
        <div className="container mx-auto p-6 max-w-6xl space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => router.push('/crm')} className="hover:bg-slate-100">
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{dealToEdit.name}</h1>
                        <p className="text-slate-500 mt-0.5">
                            {dealToEdit.client && <span>{dealToEdit.client} · </span>}
                            <Badge variant="outline" className={stageInfo.color}>{stageInfo.label}</Badge>
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap justify-end">
                    {/* chg-011 Phase C: Generate Contract Draft (B → A trigger)
                        when Estimation has handed off all required final_*
                        fields. If a draft already exists, surface "Open draft"
                        instead so users don't generate duplicates. */}
                    {activeDraft ? (
                        <Button
                            variant="outline"
                            className="gap-2 border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                            onClick={() => router.push(`/crm/${dealId}/contract-draft/${activeDraft.id}`)}
                        >
                            <FileText className="h-4 w-4" /> Open contract draft
                            {activeDraft.todo_count > 0 && (
                                <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 text-[10px]">
                                    {activeDraft.todo_count} TODO
                                </Badge>
                            )}
                        </Button>
                    ) : (
                        canGenerateDraft && (
                            <PermissionGuard permission="manage_crm">
                                <Button
                                    className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white"
                                    onClick={() => router.push(`/crm/${dealId}/contract-draft/new`)}
                                >
                                    <Sparkles className="h-4 w-4" /> Generate Contract Draft
                                </Button>
                            </PermissionGuard>
                        )
                    )}
                    {/* Manual "Win Deal" was replaced by the contract-document upload
                        flow — the deal auto-transitions to Won (S) once Claude
                        approves the uploaded contract. The button below only shows
                        in the Negotiation (A) stage and scrolls to the uploader. */}
                    {stage === 'negotiation' && (
                        <PermissionGuard permission="manage_crm">
                            <Button
                                className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                                onClick={() => {
                                    const el = document.getElementById('contract-document');
                                    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                }}
                            >
                                <Trophy className="h-4 w-4" /> Upload Contract → Win
                            </Button>
                        </PermissionGuard>
                    )}
                    <Button
                        variant="outline"
                        className="gap-2"
                        onClick={() => router.push(`/estimation?dealId=${dealId}`)}
                    >
                        <Calculator className="h-4 w-4" /> Estimation
                    </Button>
                    <PermissionGuard permission="manage_crm">
                        <Button variant="outline" className="gap-2" onClick={() => router.push(`/crm/edit/${dealId}`)}>
                            <Edit3 className="h-4 w-4" /> Edit Deal
                        </Button>
                    </PermissionGuard>
                    <PermissionGuard permission="manage_crm">
                        <Button variant="outline" className="gap-2" onClick={() => router.push(`/crm/${dealId}/staffing`)}>
                            <Users className="h-4 w-4" /> Hard Booking
                        </Button>
                    </PermissionGuard>
                    <PermissionGuard permission="manage_crm">
                        <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
                            Delete
                        </Button>
                    </PermissionGuard>
                </div>
            </div>

            {/* Workflow status bar */}
            <WorkflowBar steps={workflowSteps} />

            {/* Contract document uploader — visible in Negotiation (A) stage.
                Approved uploads auto-fire win_deal() server-side. The id is the
                scroll target for the "Upload Contract → Win" header button and
                the Kanban dropdown's deep link. */}
            <div id="contract-document">
                <ContractDocumentUploader
                    dealId={dealToEdit.id}
                    canManage={canManageCrm}
                    enabled={stage === 'negotiation'}
                />
            </div>

            {/* KPI cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card className="shadow-sm border-slate-100">
                    <CardContent className="p-5">
                        <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-slate-500">Client Budget</p>
                            <DollarSign className="h-4 w-4 text-emerald-500" />
                        </div>
                        <div className="mt-1 text-2xl font-bold text-slate-900">
                            {formatMoney(dealToEdit.clientBudget ?? 0, currency)}
                        </div>
                    </CardContent>
                </Card>
                <Card className="shadow-sm border-slate-100">
                    <CardContent className="p-5">
                        <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-slate-500">Est. Total Cost</p>
                            <TrendingUp className="h-4 w-4 text-slate-400" />
                        </div>
                        <div className="mt-1 text-2xl font-bold text-slate-900">
                            {formatMoney(dealToEdit.totalEstimatedCost ?? 0, currency)}
                        </div>
                    </CardContent>
                </Card>
                <Card className="shadow-sm border-slate-100">
                    <CardContent className="p-5">
                        <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-slate-500">Gross Profit</p>
                            <DollarSign className="h-4 w-4 text-blue-500" />
                        </div>
                        <div className="mt-1 text-2xl font-bold">
                            <span className={marginPct !== undefined ? getMarginColor(marginPct) : 'text-slate-900'}>
                                {formatMoney(dealToEdit.estimatedGrossProfit ?? 0, currency)}
                            </span>
                            {marginPct !== undefined && (
                                <span className={`ml-2 text-sm font-semibold ${getMarginColor(marginPct)}`}>
                                    ({marginPct.toFixed(1)}%)
                                </span>
                            )}
                        </div>
                    </CardContent>
                </Card>
                <Card className="shadow-sm border-slate-100">
                    <CardContent className="p-5">
                        <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-slate-500">Win Probability</p>
                            <Target className="h-4 w-4 text-purple-500" />
                        </div>
                        <div className="mt-1 text-2xl font-bold text-slate-900">
                            {dealToEdit.winProbability ?? 0}%
                        </div>
                    </CardContent>
                </Card>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-2 space-y-6">
                    {/* Deal Overview */}
                    <Card className="shadow-sm border-slate-100">
                        <CardHeader className="border-b bg-slate-50/50">
                            <CardTitle className="text-lg">Deal Overview</CardTitle>
                        </CardHeader>
                        <CardContent className="p-6">
                            <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                                <div>
                                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Deal Name</p>
                                    <p className="text-sm font-medium mt-1">{dealToEdit.name}</p>
                                </div>
                                <div>
                                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Client</p>
                                    <p className="text-sm font-medium mt-1">{dealToEdit.client || '—'}</p>
                                </div>
                                {dealToEdit.contactName && (
                                    <div>
                                        <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Contact</p>
                                        <p className="text-sm font-medium mt-1">{dealToEdit.contactName}</p>
                                        {dealToEdit.contactEmail && (
                                            <p className="text-xs text-slate-400">{dealToEdit.contactEmail}</p>
                                        )}
                                    </div>
                                )}
                                <div>
                                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Timeline</p>
                                    <p className="text-sm font-medium mt-1 flex items-center gap-1.5">
                                        <Calendar className="h-3.5 w-3.5 text-slate-400" />
                                        {dealToEdit.timelineMonths ?? 0} month{(dealToEdit.timelineMonths ?? 0) !== 1 ? 's' : ''}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Workload</p>
                                    <p className="text-sm font-medium mt-1 flex items-center gap-1.5">
                                        <Clock className="h-3.5 w-3.5 text-slate-400" />
                                        {dealToEdit.workloadHours ?? 0} hours
                                    </p>
                                </div>
                            </div>
                            {dealToEdit.workloadDescription && (
                                <div className="mt-5 pt-5 border-t border-slate-100">
                                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Scope Description</p>
                                    <p className="text-sm text-slate-700 whitespace-pre-wrap">{dealToEdit.workloadDescription}</p>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Ghost Roles */}
                    <Card className="shadow-sm border-slate-100">
                        <CardHeader className="border-b bg-slate-50/50">
                            <CardTitle className="text-lg">Ghost Roles and Staffing</CardTitle>
                            <CardDescription>Estimated team composition for delivery</CardDescription>
                        </CardHeader>
                        <CardContent className="p-0">
                            {dealToEdit.ghostRoles && dealToEdit.ghostRoles.length > 0 ? (
                                <Table>
                                    <TableHeader className="bg-slate-50">
                                        <TableRow>
                                            <TableHead>Role</TableHead>
                                            <TableHead className="text-right">Quantity</TableHead>
                                            <TableHead className="text-right">Alloc %</TableHead>
                                            <TableHead className="text-right">Monthly Salary</TableHead>
                                            <TableHead className="text-right">Subtotal</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {dealToEdit.ghostRoles.map((role, i) => {
                                            const avgSalary = ((role.minMonthlySalary || 0) + (role.maxMonthlySalary || 0)) / 2;
                                            const allocFrac = (role.months || 100) / 100;
                                            const tlMonths  = dealToEdit.timelineMonths || 1;
                                            return (
                                                <TableRow key={role.id ?? i}>
                                                    <TableCell className="font-medium capitalize">{role.roleType}</TableCell>
                                                    <TableCell className="text-right">{role.quantity}</TableCell>
                                                    <TableCell className="text-right">{role.months}%</TableCell>
                                                    <TableCell className="text-right">
                                                        {formatMoney(role.minMonthlySalary ?? 0, currency)} – {formatMoney(role.maxMonthlySalary ?? 0, currency)}
                                                    </TableCell>
                                                    <TableCell className="text-right font-medium">
                                                        {formatMoney(role.quantity * allocFrac * tlMonths * avgSalary, currency)}
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                        <TableRow className="bg-slate-50/50 font-bold">
                                            <TableCell>Total Labor Cost</TableCell>
                                            <TableCell /><TableCell /><TableCell />
                                            <TableCell className="text-right">{formatMoney(baseLaborCost, currency)}</TableCell>
                                        </TableRow>
                                    </TableBody>
                                </Table>
                            ) : (
                                <div className="p-8 text-center text-sm text-slate-500">
                                    No ghost roles defined. Edit the deal to add staffing estimates.
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Linked Records — only show if we have any */}
                    {(linkedContract || linkedProject) && (
                        <Card className="shadow-sm border-slate-100">
                            <CardHeader className="border-b bg-slate-50/50">
                                <CardTitle className="text-lg">Linked Records</CardTitle>
                                <CardDescription>Auto-created when this deal was won</CardDescription>
                            </CardHeader>
                            <CardContent className="p-4 space-y-3">
                                {linkedContract && (
                                    <button
                                        className="w-full flex items-center justify-between p-3 rounded-lg border border-slate-100 bg-slate-50 hover:bg-blue-50 hover:border-blue-200 transition-colors text-left"
                                        onClick={() => router.push('/contracts')}
                                    >
                                        <div className="flex items-center gap-3">
                                            <FileText className="h-4 w-4 text-blue-500 flex-shrink-0" />
                                            <div>
                                                <p className="text-xs text-slate-500">Contract</p>
                                                <p className="text-sm font-medium">
                                                    {linkedContract.contractNumber ?? linkedContract.id.slice(0, 8)}
                                                    {' · '}
                                                    <span className="text-slate-600">{linkedContract.status}</span>
                                                    {' · '}
                                                    <span className="text-slate-600">{formatMoney(linkedContract.totalValue, currency)}</span>
                                                </p>
                                            </div>
                                        </div>
                                        <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
                                    </button>
                                )}
                                {linkedProject && (
                                    <button
                                        className="w-full flex items-center justify-between p-3 rounded-lg border border-slate-100 bg-slate-50 hover:bg-purple-50 hover:border-purple-200 transition-colors text-left"
                                        onClick={() => router.push('/projects')}
                                    >
                                        <div className="flex items-center gap-3">
                                            <Briefcase className="h-4 w-4 text-purple-500 flex-shrink-0" />
                                            <div>
                                                <p className="text-xs text-slate-500">Project</p>
                                                <p className="text-sm font-medium">
                                                    {linkedProject.name}
                                                    {' · '}
                                                    <span className="text-slate-600">{linkedProject.status}</span>
                                                    {linkedProject.projectNumber && (
                                                        <span className="text-slate-400"> ({linkedProject.projectNumber})</span>
                                                    )}
                                                </p>
                                            </div>
                                        </div>
                                        <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
                                    </button>
                                )}
                            </CardContent>
                        </Card>
                    )}
                </div>

                {/* Sidebar */}
                <div className="space-y-6">
                    <Card className="shadow-sm border-slate-100 sticky top-6">
                        <CardHeader className="bg-slate-50/80 pb-4 border-b border-slate-100">
                            <CardTitle className="text-lg">Financial Summary</CardTitle>
                        </CardHeader>
                        <CardContent className="pt-5 space-y-4">
                            <div className="space-y-3">
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">Client Budget</span>
                                    <span className="font-medium text-slate-700">{formatMoney(dealToEdit.clientBudget ?? 0, currency)}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">Base Labor Cost</span>
                                    <span className="font-medium text-slate-700">{formatMoney(baseLaborCost, currency)}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">Overhead</span>
                                    <span className="font-medium text-red-500/80">-{formatMoney(dealToEdit.overheadCost ?? 0, currency)}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">Risk Buffer</span>
                                    <span className="font-medium text-red-500/80">-{formatMoney(dealToEdit.bufferCost ?? 0, currency)}</span>
                                </div>
                            </div>
                            <div className="border-t border-slate-100 pt-4">
                                <div className="flex justify-between font-bold text-slate-800 mb-2">
                                    <span>Total Est. Cost</span>
                                    <span>{formatMoney(dealToEdit.totalEstimatedCost ?? 0, currency)}</span>
                                </div>
                                <div className="flex justify-between items-center bg-slate-50 p-3 rounded-lg border border-slate-100">
                                    <span className="font-bold text-slate-800">Gross Profit</span>
                                    <div className="flex flex-col items-end">
                                        <span className={`font-bold text-lg ${marginPct !== undefined ? getMarginColor(marginPct) : 'text-slate-900'}`}>
                                            {formatMoney(dealToEdit.estimatedGrossProfit ?? 0, currency)}
                                        </span>
                                        {marginPct !== undefined && (
                                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full mt-1 ${getMarginColor(marginPct)}`}>
                                                {marginPct.toFixed(1)}% Margin
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* Delete Dialog */}
            <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Delete Deal</DialogTitle>
                    </DialogHeader>
                    <p className="text-sm text-slate-600">
                        Are you sure you want to delete this deal? This action cannot be undone.
                    </p>
                    <div className="flex justify-end gap-3 mt-4">
                        <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
                        <Button variant="destructive" onClick={async () => {
                            await deleteDeal.mutateAsync(dealId);
                            setDeleteOpen(false);
                            router.push('/crm');
                        }} disabled={deleteDeal.isPending}>
                            {deleteDeal.isPending ? 'Deleting...' : 'Delete'}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
