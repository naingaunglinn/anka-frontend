'use client';

import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
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
    TrendingUp, Briefcase, Calculator, ExternalLink,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { formatMoney } from '@/lib/currency';
import { useTenantCurrency } from '@/hooks/useTenantCurrency';
import { PermissionGuard } from '@/components/PermissionGuard';
import { usePermission } from '@/hooks/usePermission';
import { isContractEligible } from '@/lib/dealRanks';
import { useContractDrafts } from '@/lib/queries/contractDrafts';
import { Sparkles } from 'lucide-react';
import { RequirementsChecklist, formatOtSummary } from '@/components/project-pipeline/RequirementsChecklist';
import { WorkflowBar, type WorkflowStep } from '@/components/project-pipeline/WorkflowBar';
import { calculateOverhead, calculateRiskBuffer } from '@/lib/calculations';
import type { EstimationResource } from '@/types/business';

// Stage colors (label is resolved via translation: t(STAGE_LABEL_KEY[stage])).
const STAGE_COLOR: Record<string, string> = {
    lead:        'bg-slate-100 text-slate-700 border-slate-200',
    qualified:   'bg-blue-50 text-blue-700 border-blue-200',
    negotiation: 'bg-purple-50 text-purple-700 border-purple-200',
    won:         'bg-emerald-50 text-emerald-700 border-emerald-200',
    lost:        'bg-red-50 text-red-700 border-red-200',
};

const STAGE_LABEL_KEY: Record<string, string> = {
    lead:        'stage_lead',
    qualified:   'stage_qualified',
    negotiation: 'stage_negotiation',
    won:         'stage_won',
    lost:        'stage_lost',
};

export default function DealDetailPage() {
    const t = useTranslations();
    const params  = useParams();
    const router  = useRouter();
    const dealId  = params.id as string;
    const store   = useBusinessStore();
    const currency = useTenantCurrency();

    const dealQuery      = useDealDetail(dealId);
    // Win transition (A → S) fires when the customer's counter-signed PDF is
    // uploaded inside the contract draft wizard's mark-signed step.
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

    // Ghost-role labor cost — feeds the "Ghost Roles" table footer only.
    // `GhostRole.months` is the allocation PERCENTAGE (1–100), not a month count —
    // legacy naming. Convert to a fraction and multiply by the deal's actual
    // timelineMonths to get the lifetime labor cost (not just one month's worth).
    const ghostLaborCost = useMemo(() => {
        if (!dealToEdit?.ghostRoles) return 0;
        const months = dealToEdit.timelineMonths || 1;
        return dealToEdit.ghostRoles.reduce((sum, r) => {
            const avgSalary  = ((r.minMonthlySalary || 0) + (r.maxMonthlySalary || 0)) / 2;
            const allocFrac  = (r.months || 100) / 100;
            return sum + (r.quantity || 0) * allocFrac * months * avgSalary;
        }, 0);
    }, [dealToEdit]);

    // Live financial rollup driven by what the Estimation page persists onto the
    // deal: estimation_resources × per-role cost rate, plus deal_overheads, plus
    // company overhead %, plus risk buffer %. Mirrors EstimationSimulator's
    // costRateForResource → laborCost → companyOverhead → buffer → total math
    // so the Financial Summary card always agrees with the simulator. The
    // legacy deal.{base_labor_cost, overhead_cost, buffer_cost, total_estimated_cost,
    // estimated_gross_profit} columns are no longer read by this page.
    const estimationRollup = useMemo(() => {
        const resources = dealToEdit?.estimationResources ?? [];
        const overheads = dealToEdit?.projectOverheads ?? [];
        const clientBudget = dealToEdit?.clientBudget ?? 0;
        const { overheadPercentage, bufferPercentage, costToBillRatio, fallbackHourlyCost } = store.companySettings;

        const costRateForRole = (roleId: string): number => {
            const rates = store.employees
                .filter(e => e.jobRoleId === roleId && e.status === 'Active')
                .map(e => e.costPerHour)
                .filter((r): r is number => typeof r === 'number' && Number.isFinite(r) && r > 0);
            if (rates.length > 0) {
                const sorted = [...rates].sort((a, b) => a - b);
                const mid = Math.floor(sorted.length / 2);
                return sorted.length % 2 === 0
                    ? (sorted[mid - 1] + sorted[mid]) / 2
                    : sorted[mid];
            }
            const role = store.roles.find(r => r.id === roleId);
            if (role && role.rate > 0) return role.rate * costToBillRatio;
            return fallbackHourlyCost;
        };

        const costRateForResource = (res: EstimationResource): number => {
            if (res.employeeId) {
                const emp = store.employees.find(e => e.id === res.employeeId);
                if (emp && typeof emp.costPerHour === 'number' && Number.isFinite(emp.costPerHour) && emp.costPerHour > 0) {
                    return emp.costPerHour;
                }
            }
            return costRateForRole(res.roleId);
        };

        const laborCost = resources.reduce((sum, r) => sum + r.hours * costRateForResource(r), 0);
        const companyOverheadCost = calculateOverhead(laborCost, overheadPercentage || 0);
        const projectOverheadTotal = overheads.reduce((sum, o) => sum + o.cost, 0);
        const overheadCost = companyOverheadCost + projectOverheadTotal;
        const bufferCost = calculateRiskBuffer(laborCost, overheadCost, bufferPercentage || 0);
        const totalEstimatedCost = laborCost + overheadCost + bufferCost;
        const estimatedGrossProfit = clientBudget - totalEstimatedCost;
        const marginPct = clientBudget > 0 ? (estimatedGrossProfit / clientBudget) * 100 : undefined;

        return { laborCost, overheadCost, bufferCost, totalEstimatedCost, estimatedGrossProfit, marginPct };
    }, [dealToEdit, store.companySettings, store.employees, store.roles]);

    if (dealQuery.isLoading) {
        return (
            <div className="p-8 flex items-center justify-center">
                <p className="text-sm text-slate-500 animate-pulse">{t('loading_deal')}</p>
            </div>
        );
    }

    if (dealQuery.isError || !dealToEdit) {
        return (
            <div className="p-8 space-y-3">
                <p className="text-sm text-destructive">{t('could_not_load_deal')}</p>
                <Button variant="outline" onClick={() => dealQuery.refetch()}>{t('retry')}</Button>
            </div>
        );
    }

    const stage      = dealToEdit.status ?? 'lead';
    const stageColor = STAGE_COLOR[stage] ?? STAGE_COLOR.lead;
    const stageLabel = t(STAGE_LABEL_KEY[stage] ?? STAGE_LABEL_KEY.lead);
    const isWon      = stage === 'won';
    const isLost     = stage === 'lost';
    const isClosed   = isWon || isLost;

    const marginPct = estimationRollup.marginPct;
    // B-and-above gate for the Financial Summary right-rail card. Ranks: lead=C,
    // qualified=B, negotiation=A, won=S. C leads have no estimation yet → showing
    // an all-zero card is noise, so hide it entirely.
    const hasFinancials = stage === 'qualified' || stage === 'negotiation' || stage === 'won';

    const getMarginColor = (m: number) => {
        if (m < 0)  return 'text-red-500';
        if (m < 10) return 'text-yellow-500';
        return 'text-green-500';
    };

    // Workflow steps — lost deals never produce a contract or project, so
    // "Pending" is misleading. Show "N/A" instead so the row reads as terminal.
    const downstreamLabel = (current: string | undefined) => {
        if (isLost) return t('na_deal_lost');
        if (current) return current;
        return isWon ? t('created') : t('pending');
    };

    // Contract step surfaces the draft state when a contract record doesn't
    // exist yet — gives the salesperson visible feedback that we're mid-flow
    // (drafting / sent / awaiting countersign) instead of a flat "Pending".
    let contractDetail: string;
    if (isLost) {
        contractDetail = t('na_deal_lost');
    } else if (linkedContract) {
        contractDetail = `${linkedContract.contractNumber ?? linkedContract.id.slice(0, 8)} · ${linkedContract.status}`;
    } else if (activeDraft?.status === 'sent_to_customer') {
        contractDetail = t('draft_sent_awaiting_signature', { version: activeDraft.version });
    } else if (activeDraft?.status === 'signed') {
        contractDetail = t('draft_signed_creating_contract', { version: activeDraft.version });
    } else if (activeDraft?.status === 'draft') {
        contractDetail = t('draft_in_progress', { version: activeDraft.version });
    } else {
        contractDetail = isWon ? t('created') : t('pending');
    }

    const workflowSteps: WorkflowStep[] = [
        {
            label: t('workflow_deal'),
            detail: stageLabel,
            done:   isWon,
            active: !isClosed,
        },
        {
            label: t('workflow_contract'),
            detail: contractDetail,
            done:   !!linkedContract,
            active: !isClosed && (!!activeDraft || (isWon && !linkedContract)),
        },
        {
            label: t('workflow_project'),
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
                    <Button variant="ghost" size="icon" onClick={() => router.push('/project-pipeline')} className="hover:bg-slate-100">
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{dealToEdit.name}</h1>
                        <p className="text-slate-500 mt-0.5">
                            {dealToEdit.client && <span>{dealToEdit.client} · </span>}
                            <Badge variant="outline" className={stageColor}>{stageLabel}</Badge>
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap justify-end">
                    {/* Generate Contract Draft shows once the deal reaches rank A
                        (Estimation auto-advances B → A after the handoff fields
                        land). If a draft already exists, surface "Open draft"
                        instead so users don't generate duplicates. */}
                    {stage === 'negotiation' && activeDraft ? (
                        <Button
                            variant="outline"
                            className="gap-2 border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                            onClick={() => router.push(`/project-pipeline/${dealId}/contract-draft/${activeDraft.id}`)}
                        >
                            <FileText className="h-4 w-4" /> {t('open_contract_draft')}
                            {activeDraft.todo_count > 0 && (
                                <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 text-[10px]">
                                    {activeDraft.todo_count} {t('todo_short')}
                                </Badge>
                            )}
                        </Button>
                    ) : (
                        canGenerateDraft && (
                            <PermissionGuard permission="manage_crm">
                                <Button
                                    className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white"
                                    onClick={() => router.push(`/project-pipeline/${dealId}/contract-draft/new`)}
                                >
                                    <Sparkles className="h-4 w-4" /> {t('generate_contract_draft')}
                                </Button>
                            </PermissionGuard>
                        )
                    )}
                    <Button
                        variant="outline"
                        className="gap-2"
                        onClick={() => router.push(`/estimation?dealId=${dealId}`)}
                    >
                        <Calculator className="h-4 w-4" /> {t('estimation')}
                    </Button>
                    <PermissionGuard permission="manage_crm">
                        <Button variant="outline" className="gap-2" onClick={() => router.push(`/project-pipeline/edit/${dealId}`)}>
                            <Edit3 className="h-4 w-4" /> {t('edit_deal_button')}
                        </Button>
                    </PermissionGuard>
                    <PermissionGuard permission="manage_crm">
                        <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
                            {t('delete')}
                        </Button>
                    </PermissionGuard>
                </div>
            </div>

            {/* Workflow status bar */}
            <WorkflowBar steps={workflowSteps} />

            {/* KPI cards — hidden on C leads where there's no estimation yet,
                so an all-zero "Est. Total Cost / Gross Profit" strip doesn't
                show. Same gate as the right-rail Financial Summary card. */}
            {hasFinancials && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card className="shadow-sm border-slate-100">
                    <CardContent className="p-5">
                        <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-slate-500">{t('client_budget')}</p>
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
                            <p className="text-sm font-medium text-slate-500">{t('est_total_cost')}</p>
                            <TrendingUp className="h-4 w-4 text-slate-400" />
                        </div>
                        <div className="mt-1 text-2xl font-bold text-slate-900">
                            {formatMoney(estimationRollup.totalEstimatedCost, currency)}
                        </div>
                    </CardContent>
                </Card>
                <Card className="shadow-sm border-slate-100">
                    <CardContent className="p-5">
                        <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-slate-500">{t('gross_profit')}</p>
                            <DollarSign className="h-4 w-4 text-blue-500" />
                        </div>
                        <div className="mt-1 text-2xl font-bold">
                            <span className={marginPct !== undefined ? getMarginColor(marginPct) : 'text-slate-900'}>
                                {formatMoney(estimationRollup.estimatedGrossProfit, currency)}
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
                            <p className="text-sm font-medium text-slate-500">{t('win_probability')}</p>
                            <Target className="h-4 w-4 text-purple-500" />
                        </div>
                        <div className="mt-1 text-2xl font-bold text-slate-900">
                            {dealToEdit.winProbability ?? 0}%
                        </div>
                    </CardContent>
                </Card>
            </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-2 space-y-6">
                    {/* Deal Overview */}
                    <Card className="shadow-sm border-slate-100">
                        <CardHeader className="border-b bg-slate-50/50">
                            <CardTitle className="text-lg">{t('deal_overview')}</CardTitle>
                        </CardHeader>
                        <CardContent className="p-6">
                            <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                                <div>
                                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">{t('deal_name')}</p>
                                    <p className="text-sm font-medium mt-1">{dealToEdit.name}</p>
                                </div>
                                <div>
                                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">{t('client')}</p>
                                    <p className="text-sm font-medium mt-1">{dealToEdit.client || '—'}</p>
                                </div>
                                {dealToEdit.contactName && (
                                    <div>
                                        <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">{t('contact')}</p>
                                        <p className="text-sm font-medium mt-1">{dealToEdit.contactName}</p>
                                        {dealToEdit.contactEmail && (
                                            <p className="text-xs text-slate-400">{dealToEdit.contactEmail}</p>
                                        )}
                                    </div>
                                )}
                                <div>
                                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">{t('timeline')}</p>
                                    <p className="text-sm font-medium mt-1 flex items-center gap-1.5">
                                        <Calendar className="h-3.5 w-3.5 text-slate-400" />
                                        {t('months', { count: dealToEdit.timelineMonths ?? 0 })}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">{t('workload')}</p>
                                    <p className="text-sm font-medium mt-1 flex items-center gap-1.5">
                                        <Clock className="h-3.5 w-3.5 text-slate-400" />
                                        {t('workload_hours', { hours: dealToEdit.workloadHours ?? 0 })}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">{t('expected_start_date')}</p>
                                    <p className="text-sm font-medium mt-1 flex items-center gap-1.5">
                                        <Calendar className="h-3.5 w-3.5 text-slate-400" />
                                        {dealToEdit.expectedCloseDate ?? '—'}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">{t('ot_condition')}</p>
                                    <p className="text-sm font-medium mt-1">
                                        {dealToEdit.otPolicyModel ? formatOtSummary(dealToEdit) : '—'}
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* chg-011: Customer Requirements checklist — see what's
                        captured / missing at a glance. ④ Estimation reads
                        these when pricing; ⑤ contract drafting renders them
                        as clauses. Includes a "✓ N / M captured" summary so
                        the salesperson knows when the deal is ready for the
                        contract drafting wizard. */}
                    <RequirementsChecklist deal={dealToEdit} dealId={dealId} canEdit={canManageCrm} />

                    {/* Ghost Roles */}
                    <Card className="shadow-sm border-slate-100">
                        <CardHeader className="border-b bg-slate-50/50">
                            <CardTitle className="text-lg">{t('ghost_roles_staffing')}</CardTitle>
                            <CardDescription>{t('estimated_team_composition')}</CardDescription>
                        </CardHeader>
                        <CardContent className="p-0">
                            {dealToEdit.ghostRoles && dealToEdit.ghostRoles.length > 0 ? (
                                <Table>
                                    <TableHeader className="bg-slate-50">
                                        <TableRow>
                                            <TableHead>{t('role')}</TableHead>
                                            <TableHead className="text-right">{t('quantity')}</TableHead>
                                            <TableHead className="text-right">{t('alloc_pct')}</TableHead>
                                            <TableHead className="text-right">{t('monthly_salary')}</TableHead>
                                            <TableHead className="text-right">{t('subtotal')}</TableHead>
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
                                            <TableCell>{t('total_labor_cost')}</TableCell>
                                            <TableCell /><TableCell /><TableCell />
                                            <TableCell className="text-right">{formatMoney(ghostLaborCost, currency)}</TableCell>
                                        </TableRow>
                                    </TableBody>
                                </Table>
                            ) : (
                                <div className="p-8 text-center text-sm text-slate-500">
                                    {t('no_ghost_roles')}
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Linked Records — only show if we have any */}
                    {(linkedContract || linkedProject) && (
                        <Card className="shadow-sm border-slate-100">
                            <CardHeader className="border-b bg-slate-50/50">
                                <CardTitle className="text-lg">{t('linked_records')}</CardTitle>
                                <CardDescription>{t('auto_created_when_won')}</CardDescription>
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
                                                <p className="text-xs text-slate-500">{t('contract')}</p>
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
                                                <p className="text-xs text-slate-500">{t('project')}</p>
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
                    {hasFinancials && (
                        <Card className="shadow-sm border-slate-100 sticky top-6">
                            <CardHeader className="bg-slate-50/80 pb-4 border-b border-slate-100">
                                <CardTitle className="text-lg">{t('financial_summary')}</CardTitle>
                                <CardDescription>{t('live_from_estimation')}</CardDescription>
                            </CardHeader>
                            <CardContent className="pt-5 space-y-4">
                                <div className="space-y-3">
                                    <div className="flex justify-between text-sm">
                                        <span className="text-slate-500">{t('client_budget')}</span>
                                        <span className="font-medium text-slate-700">{formatMoney(dealToEdit.clientBudget ?? 0, currency)}</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-slate-500">{t('base_labor_cost')}</span>
                                        <span className="font-medium text-slate-700">{formatMoney(estimationRollup.laborCost, currency)}</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-slate-500">{t('overhead')}</span>
                                        <span className="font-medium text-red-500/80">-{formatMoney(estimationRollup.overheadCost, currency)}</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-slate-500">{t('risk_buffer')}</span>
                                        <span className="font-medium text-red-500/80">-{formatMoney(estimationRollup.bufferCost, currency)}</span>
                                    </div>
                                </div>
                                <div className="border-t border-slate-100 pt-4">
                                    <div className="flex justify-between font-bold text-slate-800 mb-2">
                                        <span>{t('est_total_cost')}</span>
                                        <span>{formatMoney(estimationRollup.totalEstimatedCost, currency)}</span>
                                    </div>
                                    <div className="flex justify-between items-center bg-slate-50 p-3 rounded-lg border border-slate-100">
                                        <span className="font-bold text-slate-800">{t('gross_profit')}</span>
                                        <div className="flex flex-col items-end">
                                            <span className={`font-bold text-lg ${marginPct !== undefined ? getMarginColor(marginPct) : 'text-slate-900'}`}>
                                                {formatMoney(estimationRollup.estimatedGrossProfit, currency)}
                                            </span>
                                            {marginPct !== undefined && (
                                                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full mt-1 ${getMarginColor(marginPct)}`}>
                                                    {t('margin_pct_label', { pct: marginPct.toFixed(1) })}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </div>
            </div>

            {/* Delete Dialog */}
            <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>{t('delete_deal')}</DialogTitle>
                    </DialogHeader>
                    <p className="text-sm text-slate-600">
                        {t('delete_deal_confirm')}
                    </p>
                    <div className="flex justify-end gap-3 mt-4">
                        <Button variant="outline" onClick={() => setDeleteOpen(false)}>{t('cancel')}</Button>
                        <Button variant="destructive" onClick={async () => {
                            await deleteDeal.mutateAsync(dealId);
                            toast.success(t('deal_deleted_toast', { name: dealToEdit.name }));
                            setDeleteOpen(false);
                            router.push('/project-pipeline');
                        }} disabled={deleteDeal.isPending}>
                            {deleteDeal.isPending ? t('deleting') : t('delete')}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
