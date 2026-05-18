'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useQueries } from '@tanstack/react-query';
import { useBusinessStore } from '@/store/businessStore';
import { useTenantStore, type Currency } from '@/store/tenantStore';
import { useOrganizationSync } from '@/hooks/useOrganizationSync';
import { useDealList } from '@/lib/queries/deals';
import { useProjectList, fetchProjectTaskAssignments, projectKeys } from '@/lib/queries/projects';
import { useInvoiceList } from '@/lib/queries/invoices';
import { useTimeEntryList } from '@/lib/queries/timeEntries';
import { useContractList } from '@/lib/queries/contracts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Legend,
} from 'recharts';
import {
    AlertTriangle,
    ArrowUpRight,
    CheckCircle2,
    DollarSign,
    Eye,
    Flag,
    Percent,
    TrendingDown,
    TrendingUp,
} from 'lucide-react';
import { formatMoney, formatMoneyShort } from '@/lib/currency';
import type { Contract, Deal, Employee, Project, TimeEntry } from '@/types/business';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

type ProfitHealth = 'On Plan' | 'Watch' | 'At Risk';

type ProjectProfitRow = {
    id: string;
    name: string;
    client: string;
    planProfit: number;
    planProfitToDate: number;
    actualProfit: number;
    variance: number;
    plannedProgress: number;
    actualProgress: number;
    overtimeImpact: number;
    health: ProfitHealth;
};

type ProfitTaskAssignment = {
    totalHours: number;
    plannedStart?: string;
    plannedEnd?: string;
    actualStart?: string;
    actualEnd?: string;
    status?: string | null;
};

function clamp(value: number, min = 0, max = 1): number {
    if (!Number.isFinite(value)) return min;
    return Math.min(Math.max(value, min), max);
}

function positiveNumber(value: number | null | undefined): number {
    const num = Number(value ?? 0);
    return Number.isFinite(num) && num > 0 ? num : 0;
}

function numericValue(value: number | null | undefined): number | null {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
}

function parseDate(value?: string | null): Date | null {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

function addMonths(base: Date, months: number): Date {
    const next = new Date(base);
    next.setMonth(next.getMonth() + months);
    return next;
}

function diffDays(start: Date, end: Date): number {
    return Math.max(1, Math.ceil((end.getTime() - start.getTime()) / MS_PER_DAY));
}

function getEarlierDate(...dates: Array<Date | null>): Date | null {
    return dates.filter((date): date is Date => date instanceof Date).sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
}

function getLaterDate(...dates: Array<Date | null>): Date | null {
    const filtered = dates.filter((date): date is Date => date instanceof Date).sort((a, b) => b.getTime() - a.getTime());
    return filtered[0] ?? null;
}

function estimateProjectRevenue(contract?: Contract, deal?: Deal): number {
    const contractValue = positiveNumber(contract?.totalValue);
    if (contractValue > 0) return contractValue;

    const feeRevenue = positiveNumber(deal?.finalMonthlyFee) * positiveNumber(deal?.finalContractMonths);
    const installation = positiveNumber(deal?.finalInstallationFee);
    if (feeRevenue + installation > 0) return feeRevenue + installation;

    const clientBudget = positiveNumber(deal?.clientBudget);
    if (clientBudget > 0) return clientBudget;

    return positiveNumber(deal?.estimatedValue);
}

function estimateProjectCost(planRevenue: number, deal?: Deal): number {
    const totalEstimatedCost = positiveNumber(deal?.totalEstimatedCost);
    if (totalEstimatedCost > 0) return totalEstimatedCost;

    const estimatedGrossProfit = numericValue(deal?.estimatedGrossProfit);
    if (planRevenue > 0 && estimatedGrossProfit != null) {
        return planRevenue - estimatedGrossProfit;
    }

    const baseLabor = positiveNumber(deal?.baseLaborCost);
    const overhead = positiveNumber(deal?.overheadCost);
    const buffer = positiveNumber(deal?.bufferCost);
    if (baseLabor + overhead + buffer > 0) return baseLabor + overhead + buffer;

    return 0;
}

function getTaskProgress(task: ProfitTaskAssignment, today: Date): number {
    const status = (task.status ?? '').trim();
    if (status === '完了' || status.toLowerCase() === 'completed' || !!task.actualEnd) {
        return 1;
    }

    const started = status === '進行中' || status.toLowerCase() === 'in progress' || !!task.actualStart;
    if (!started) return 0;

    const start = parseDate(task.actualStart) ?? parseDate(task.plannedStart);
    const end = parseDate(task.actualEnd) ?? parseDate(task.plannedEnd);
    if (start && end) {
        const totalDays = diffDays(start, end);
        const elapsedDays = diffDays(start, today < end ? today : end);
        return clamp(elapsedDays / totalDays, 0.1, 0.95);
    }

    return 0.5;
}

function getActualProgress(project: Project, tasks: ProfitTaskAssignment[], actualHours: number, today: Date): number {
    if (tasks.length > 0) {
        const totalWeight = tasks.reduce((sum, task) => sum + Math.max(task.totalHours, 1), 0);
        if (totalWeight > 0) {
            const completedWeight = tasks.reduce((sum, task) => {
                const weight = Math.max(task.totalHours, 1);
                return sum + (getTaskProgress(task, today) * weight);
            }, 0);
            return clamp(completedWeight / totalWeight);
        }
    }

    const budgetHours = positiveNumber(project.budgetHours);
    if (budgetHours > 0) {
        return clamp(actualHours / budgetHours);
    }

    return 0;
}

function getPlannedTimeline(project: Project, deal?: Deal, tasks: ProfitTaskAssignment[] = []): { plannedStart: Date | null; plannedEnd: Date | null } {
    const taskPlannedStart = getEarlierDate(...tasks.map((task) => parseDate(task.plannedStart)));
    const taskPlannedEnd = getLaterDate(...tasks.map((task) => parseDate(task.plannedEnd)));
    const projectStart = parseDate(project.kickoffDate) ?? parseDate(project.startDate);
    const projectEnd = parseDate(project.endDate);

    const plannedStart = projectStart ?? taskPlannedStart;
    const timelineMonths = positiveNumber(deal?.timelineMonths || deal?.finalContractMonths);
    const plannedEnd = projectEnd ?? taskPlannedEnd ?? (plannedStart && timelineMonths > 0 ? addMonths(plannedStart, timelineMonths) : null);

    return { plannedStart, plannedEnd };
}

function getActualStart(project: Project, tasks: ProfitTaskAssignment[], projectEntries: TimeEntry[]): Date | null {
    const taskActualStart = getEarlierDate(...tasks.map((task) => parseDate(task.actualStart)));
    const firstEntryDate = getEarlierDate(...projectEntries.map((entry) => parseDate(entry.date)));
    const kickoff = parseDate(project.kickoffDate) ?? parseDate(project.startDate);
    return taskActualStart ?? firstEntryDate ?? kickoff;
}

function getOvertimeMetrics(
    deal: Deal | undefined,
    overtimeHours: number,
    overtimeCost: number,
    runningMonths: number,
): { overtimeImpact: number; overtimeRevenue: number } {
    const policy = deal?.otPolicyModel ?? '';
    const rate = positiveNumber(deal?.otRatePerHour);

    if (policy === 'customer_pays_per_hour') {
        const recoverable = overtimeHours * (rate > 0 ? rate : overtimeCost / Math.max(overtimeHours, 1));
        return { overtimeImpact: 0, overtimeRevenue: recoverable };
    }

    if (policy === 'capped_then_customer_pays') {
        const included = positiveNumber(deal?.otIncludedHoursPerMonth) * Math.max(1, runningMonths);
        const billableHours = Math.max(0, overtimeHours - included);
        const recoverable = billableHours * (rate > 0 ? rate : overtimeCost / Math.max(overtimeHours, 1));
        return { overtimeImpact: 0, overtimeRevenue: recoverable };
    }

    return { overtimeImpact: -overtimeCost, overtimeRevenue: 0 };
}

function getHealth(variance: number, progressDelta: number): ProfitHealth {
    if (variance >= 0 && progressDelta >= -0.05) return 'On Plan';
    if (variance >= -5000 && progressDelta >= -0.12) return 'Watch';
    return 'At Risk';
}

function healthClass(health: ProfitHealth): string {
    if (health === 'On Plan') return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-800';
    if (health === 'Watch') return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-400 dark:border-amber-800';
    return 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-400 dark:border-rose-800';
}

function HealthIcon({ health }: { health: ProfitHealth }) {
    if (health === 'On Plan') return <CheckCircle2 className="h-3 w-3" />;
    if (health === 'Watch') return <Eye className="h-3 w-3" />;
    return <AlertTriangle className="h-3 w-3" />;
}

// Map the internal ProfitHealth enum (kept in English for stable comparisons
// throughout the calculation pipeline) to its translation key.
const HEALTH_LABEL_KEY: Record<ProfitHealth, string> = {
    'On Plan': 'on_plan',
    'Watch': 'watch',
    'At Risk': 'at_risk',
};

export default function DashboardPage() {
    const t = useTranslations();
    const store = useBusinessStore();
    const { activeTenantId, currentTenant, tenants } = useTenantStore();
    const currency = (currentTenant?.currency as Currency) ?? tenants.find((tenant) => tenant.id === activeTenantId)?.currency ?? 'MMK';
    const today = useMemo(() => new Date(), []);

    useOrganizationSync();
    useDealList({ per_page: 500 });
    useProjectList({ per_page: 500 });
    useContractList({ per_page: 500 });
    useInvoiceList({ per_page: 1000 });
    useTimeEntryList({ per_page: 1000 });

    const taskAssignmentQueries = useQueries({
        queries: store.projects.map((project) => ({
            queryKey: projectKeys.taskAssignments(project.id),
            queryFn: () => fetchProjectTaskAssignments(project.id),
            enabled: !!project.id,
            staleTime: 10_000,
        })),
    });

    const taskAssignmentsByProject = useMemo(() => {
        const map = new Map<string, ProfitTaskAssignment[]>();
        store.projects.forEach((project, index) => {
            map.set(project.id, (taskAssignmentQueries[index]?.data?.data ?? []) as ProfitTaskAssignment[]);
        });
        return map;
    }, [store.projects, taskAssignmentQueries]);

    const pnlData = useMemo(() => store.getFinancialPnL(), [store]);

    const projectProfitRows = useMemo<ProjectProfitRow[]>(() => {
        const contractsById = new Map(store.contracts.map((contract) => [contract.id, contract]));
        const dealsById = new Map(store.deals.map((deal) => [deal.id, deal]));
        const employeesById = new Map(store.employees.map((employee) => [employee.id, employee]));
        const approvedTimeEntries = store.timeEntries.filter((entry) => entry.status === 'Approved');

        return store.projects
            .map((project) => {
                const contract = contractsById.get(project.contractId);
                const deal = contract ? dealsById.get(contract.dealId) : undefined;
                const tasks = taskAssignmentsByProject.get(project.id) ?? [];
                const projectEntries = approvedTimeEntries.filter((entry) => entry.projectId === project.id);

                const planRevenue = estimateProjectRevenue(contract, deal);
                const planCost = estimateProjectCost(planRevenue, deal);
                const estimatedGrossProfit = numericValue(deal?.estimatedGrossProfit);
                const planProfit = estimatedGrossProfit ?? (planRevenue - planCost);

                const { plannedStart, plannedEnd } = getPlannedTimeline(project, deal, tasks);
                const actualStart = getActualStart(project, tasks, projectEntries) ?? plannedStart;
                const plannedDurationDays = plannedStart && plannedEnd
                    ? diffDays(plannedStart, plannedEnd)
                    : Math.max(30, positiveNumber(deal?.timelineMonths || deal?.finalContractMonths) * 30 || 180);
                const elapsedDays = actualStart ? diffDays(actualStart, today) : 0;
                const plannedProgress = plannedStart ? clamp(elapsedDays / plannedDurationDays) : 0;

                const actualHours = projectEntries.reduce((sum, entry) => sum + positiveNumber(entry.hours), 0);
                const actualLaborCost = projectEntries.reduce((sum, entry) => {
                    const employee = employeesById.get(entry.employeeId) as Employee | undefined;
                    const hourlyCost = positiveNumber(employee?.costPerHour)
                        || (positiveNumber(employee?.monthlySalary) / Math.max(positiveNumber(employee?.workableHours), 1));
                    return sum + (positiveNumber(entry.hours) * hourlyCost);
                }, 0);

                const actualProgress = getActualProgress(project, tasks, actualHours, today);
                const actualRevenue = planRevenue * actualProgress;
                const plannedProfitToDate = planProfit * plannedProgress;

                const plannedHoursToDate = positiveNumber(project.budgetHours) * plannedProgress;
                const overtimeHours = Math.max(0, actualHours - plannedHoursToDate);
                const averageActualCostPerHour = actualHours > 0
                    ? actualLaborCost / actualHours
                    : positiveNumber(store.companySettings.fallbackHourlyCost);
                const overtimeCost = overtimeHours * averageActualCostPerHour;
                const runningMonths = Math.max(1, Math.ceil(elapsedDays / 30));
                const { overtimeImpact, overtimeRevenue } = getOvertimeMetrics(deal, overtimeHours, overtimeCost, runningMonths);

                const actualProfit = actualRevenue + overtimeRevenue - actualLaborCost;
                const variance = actualProfit - plannedProfitToDate;
                const progressDelta = actualProgress - plannedProgress;

                return {
                    id: project.id,
                    name: project.name,
                    client: project.client,
                    planProfit,
                    planProfitToDate: plannedProfitToDate,
                    actualProfit,
                    variance,
                    plannedProgress,
                    actualProgress,
                    overtimeImpact,
                    health: getHealth(variance, progressDelta),
                };
            })
            .filter((row) => row.planProfit !== 0 || row.actualProfit !== 0)
            .sort((a, b) => a.variance - b.variance);
    }, [
        store.contracts,
        store.deals,
        store.employees,
        store.projects,
        store.timeEntries,
        store.companySettings.fallbackHourlyCost,
        taskAssignmentsByProject,
        today,
    ]);

    const projectSummary = useMemo(() => {
        const totals = projectProfitRows.reduce((acc, row) => {
            acc.actualProfit += row.actualProfit;
            acc.planProfitToDate += row.planProfitToDate;
            acc.variance += row.variance;
            acc.atRisk += row.health === 'At Risk' ? 1 : 0;
            acc.watch += row.health === 'Watch' ? 1 : 0;
            return acc;
        }, { actualProfit: 0, planProfitToDate: 0, variance: 0, atRisk: 0, watch: 0 });

        return {
            ...totals,
            annualInitialBudget: positiveNumber(store.companySettings.annualInitialBudget) || 1_000_000_000,
        };
    }, [projectProfitRows, store.companySettings.annualInitialBudget]);

    const annualTargetGap = projectSummary.actualProfit - projectSummary.annualInitialBudget;
    const annualTargetCoverage = projectSummary.annualInitialBudget > 0
        ? clamp(projectSummary.actualProfit / projectSummary.annualInitialBudget, 0, 1.25)
        : 0;

    const ytdSummary = useMemo(() => {
        let revenue = 0;
        let operatingProfit = 0;
        pnlData.forEach((row) => {
            revenue += row.revenue;
            operatingProfit += row.operatingProfit;
        });
        const profitMargin = revenue > 0 ? (operatingProfit / revenue) * 100 : 0;
        return { revenue, operatingProfit, profitMargin };
    }, [pnlData]);

    const openDeals = useMemo(
        () => store.deals.filter((deal) => deal.status !== 'won' && deal.status !== 'lost' && deal.lifecycleStatus !== 'dropped'),
        [store.deals],
    );

    const weightedPipelineValue = useMemo(() => {
        return openDeals.reduce((sum, deal) => {
            const base = positiveNumber(deal.estimatedValue) || positiveNumber(deal.clientBudget);
            const probability = positiveNumber(deal.winProbability) / 100;
            return sum + (base * probability);
        }, 0);
    }, [openDeals]);

    const pipelineDeals = useMemo(() => {
        return openDeals
            .map((deal) => ({
                name: deal.name,
                weightedValue: (positiveNumber(deal.estimatedValue) || positiveNumber(deal.clientBudget)) * (positiveNumber(deal.winProbability) / 100),
                rawTarget: positiveNumber(deal.estimatedValue) || positiveNumber(deal.clientBudget),
            }))
            .sort((a, b) => b.weightedValue - a.weightedValue)
            .slice(0, 8);
    }, [openDeals]);

    const activeProjectsCount = store.projects.filter((project) => project.status === 'On Track' || project.status === 'At Risk' || project.status === 'Over Budget').length;

    const attentionProjects = projectProfitRows.filter((row) => row.health !== 'On Plan').slice(0, 5);
    const strongestProjects = [...projectProfitRows].sort((a, b) => b.actualProfit - a.actualProfit).slice(0, 5);

    return (
        <div className="mx-auto max-w-7xl space-y-8 p-6">
            <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground">{t('dashboard')}</h1>
                    <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                        {t('dashboard_description')}
                    </p>
                </div>
                <Badge variant="outline" className={annualTargetGap >= 0 ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-800' : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-400 dark:border-amber-800'}>
                    {annualTargetGap >= 0 ? t('above_annual_target') : t('below_annual_target')}
                </Badge>
            </section>


            <section className="grid gap-6 xl:grid-cols-[1.35fr,1fr]">
                <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
                    <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                        <div className="space-y-2">
                            <p className="text-sm font-medium text-muted-foreground">{t('current_realized_project_profit')}</p>
                            <div className={`text-4xl font-bold tracking-tight ${projectSummary.actualProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                {formatMoney(projectSummary.actualProfit, currency)}
                            </div>
                            <p className="max-w-xl text-sm text-muted-foreground">
                                {t('realized_profit_description')}
                            </p>
                        </div>
                        <div className="min-w-[240px] rounded-lg border border-border bg-muted/50 p-4">
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('annual_initial_budget')}</p>
                            <div className="mt-2 text-2xl font-bold text-foreground">{formatMoney(projectSummary.annualInitialBudget, currency)}</div>
                            <div className="mt-3 flex items-center justify-between text-sm">
                                <span className="text-muted-foreground">{t('gap_to_target')}</span>
                                <span className={annualTargetGap >= 0 ? 'font-semibold text-emerald-600 dark:text-emerald-400' : 'font-semibold text-rose-600 dark:text-rose-400'}>
                                    {annualTargetGap >= 0 ? '+' : '-'}{formatMoney(Math.abs(annualTargetGap), currency)}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="mt-6 space-y-3">
                        <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">{t('target_coverage')}</span>
                            <span className="font-semibold text-foreground">{(annualTargetCoverage * 100).toFixed(1)}%</span>
                        </div>
                        <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                            <div
                                className={`h-full rounded-full transition-all duration-500 ${annualTargetGap >= 0 ? 'bg-gradient-to-r from-emerald-400 to-emerald-600' : 'bg-gradient-to-r from-[#00a7f4] to-blue-500'}`}
                                style={{ width: `${Math.min(annualTargetCoverage * 100, 100)}%` }}
                            />
                        </div>
                        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                            <span className="inline-flex items-center gap-1"><ArrowUpRight className="h-3.5 w-3.5 text-[#00a7f4]" /> {t('plan_to_date')} {formatMoney(projectSummary.planProfitToDate, currency)}</span>
                            <span className={`inline-flex items-center gap-1 ${projectSummary.variance >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                {projectSummary.variance >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />} {t('variance')} {formatMoney(projectSummary.variance, currency)}
                            </span>
                            <span className="inline-flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5 text-amber-500" /> {t('at_risk_watch_summary', { atRisk: projectSummary.atRisk, watch: projectSummary.watch })}</span>
                        </div>
                    </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-2">
                    <Card className="border-slate-200 shadow-sm">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">{t('ytd_revenue')}</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-center justify-between">
                                <div className="text-2xl font-bold text-foreground">{formatMoney(ytdSummary.revenue, currency)}</div>
                                <DollarSign className="h-4 w-4 text-emerald-500" />
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="border-slate-200 shadow-sm">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">{t('operating_profit_ytd')}</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-center justify-between">
                                <div className={`text-2xl font-bold ${ytdSummary.operatingProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                    {formatMoney(ytdSummary.operatingProfit, currency)}
                                </div>
                                <TrendingUp className="h-4 w-4 text-[#00a7f4]" />
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="border-slate-200 shadow-sm">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">{t('weighted_pipeline')}</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-center justify-between">
                                <div className="text-2xl font-bold text-foreground">{formatMoney(weightedPipelineValue, currency)}</div>
                                <Flag className="h-4 w-4 text-violet-500" />
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="border-slate-200 shadow-sm">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">{t('profit_margin')}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            <div className="flex items-center justify-between">
                                <div className={`text-2xl font-bold ${ytdSummary.profitMargin >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                    {ytdSummary.profitMargin.toFixed(1)}%
                                </div>
                                <Percent className="h-4 w-4 text-[#00a7f4]" />
                            </div>
                            <div className="text-sm text-muted-foreground">
                                {t('active_projects_count', { count: activeProjectsCount })}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </section>

            <section className="grid gap-6 lg:grid-cols-2">
                <Card className="border-slate-200 shadow-sm">
                    <CardHeader>
                        <CardTitle>{t('projects_needing_attention')}</CardTitle>
                        <CardDescription>{t('attention_description')}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {attentionProjects.length > 0 ? attentionProjects.map((project) => (
                            <div key={project.id} className="flex items-start justify-between gap-4 rounded-lg border border-border p-4 transition-shadow hover:shadow-md">
                                <div className="min-w-0 flex-1">
                                    <div className="truncate font-semibold text-foreground">{project.name}</div>
                                    <div className="mt-0.5 text-xs text-muted-foreground">{project.client}</div>
                                    <div className="mt-2 space-y-1">
                                        <div className="flex items-center gap-2">
                                            <span className="w-10 text-xs text-muted-foreground">{t('plan')}</span>
                                            <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                                                <div className="h-full rounded-full bg-slate-400 dark:bg-slate-500" style={{ width: `${Math.round(project.plannedProgress * 100)}%` }} />
                                            </div>
                                            <span className="w-8 text-right text-xs text-muted-foreground">{Math.round(project.plannedProgress * 100)}%</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="w-10 text-xs text-muted-foreground">{t('actual')}</span>
                                            <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                                                <div className="h-full rounded-full bg-[#00a7f4]" style={{ width: `${Math.round(project.actualProgress * 100)}%` }} />
                                            </div>
                                            <span className="w-8 text-right text-xs text-muted-foreground">{Math.round(project.actualProgress * 100)}%</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="shrink-0 text-right">
                                    <Badge variant="outline" className={`inline-flex items-center gap-1 ${healthClass(project.health)}`}>
                                        <HealthIcon health={project.health} />{t(HEALTH_LABEL_KEY[project.health])}
                                    </Badge>
                                    <div className={`mt-2 text-sm font-semibold ${project.variance >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                        {project.variance >= 0 ? '+' : ''}{formatMoney(project.variance, currency)}
                                    </div>
                                </div>
                            </div>
                        )) : (
                            <div className="rounded-lg border border-border bg-muted/50 p-4 text-sm text-muted-foreground">
                                {t('no_attention_projects')}
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card className="border-slate-200 shadow-sm">
                    <CardHeader>
                        <CardTitle>{t('strongest_profit_contributors')}</CardTitle>
                        <CardDescription>{t('strongest_contributors_description')}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {strongestProjects.length > 0 ? strongestProjects.map((project) => (
                            <div key={project.id} className="flex items-start justify-between gap-4 rounded-lg border border-border p-4 transition-shadow hover:shadow-md">
                                <div className="min-w-0 flex-1">
                                    <div className="truncate font-semibold text-foreground">{project.name}</div>
                                    <div className="mt-0.5 text-xs text-muted-foreground">{project.client}</div>
                                    <div className="mt-2 space-y-1">
                                        <div className="flex items-center gap-2">
                                            <span className="w-10 text-xs text-muted-foreground">{t('plan')}</span>
                                            <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                                                <div className="h-full rounded-full bg-slate-400 dark:bg-slate-500" style={{ width: `${Math.round(project.plannedProgress * 100)}%` }} />
                                            </div>
                                            <span className="w-8 text-right text-xs text-muted-foreground">{Math.round(project.plannedProgress * 100)}%</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="w-10 text-xs text-muted-foreground">{t('actual')}</span>
                                            <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                                                <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.round(project.actualProgress * 100)}%` }} />
                                            </div>
                                            <span className="w-8 text-right text-xs text-muted-foreground">{Math.round(project.actualProgress * 100)}%</span>
                                        </div>
                                    </div>
                                    {project.overtimeImpact !== 0 && (
                                        <div className="mt-1 text-xs text-muted-foreground">
                                            {t('ot_impact')} {formatMoney(project.overtimeImpact, currency)}
                                        </div>
                                    )}
                                </div>
                                <div className="shrink-0 text-right">
                                    <Badge variant="outline" className={`inline-flex items-center gap-1 ${healthClass(project.health)}`}>
                                        <HealthIcon health={project.health} />{t(HEALTH_LABEL_KEY[project.health])}
                                    </Badge>
                                    <div className={`mt-2 text-sm font-semibold ${project.actualProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                        {formatMoney(project.actualProfit, currency)}
                                    </div>
                                </div>
                            </div>
                        )) : (
                            <div className="rounded-lg border border-border bg-muted/50 p-4 text-sm text-muted-foreground">
                                {t('no_realized_profit')}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </section>

            <section className="grid gap-6 lg:grid-cols-2">
                <Card className="border-slate-200 shadow-sm">
                    <CardHeader>
                        <CardTitle>{t('monthly_pnl_trend')}</CardTitle>
                        <CardDescription>{t('revenue_vs_operating_profit')}</CardDescription>
                    </CardHeader>
                    <CardContent className="h-[360px]">
                        {pnlData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={pnlData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                    <XAxis dataKey="month" tickLine={false} axisLine={false} />
                                    <YAxis tickFormatter={(value) => formatMoneyShort(Number(value), currency)} tickLine={false} axisLine={false} />
                                    <Tooltip formatter={(value) => formatMoney(Number(value ?? 0), currency)} />
                                    <Legend />
                                    <Bar name={t('revenue')} dataKey="revenue" fill="#10B981" radius={[6, 6, 0, 0]} />
                                    <Bar name={t('op_profit')} dataKey="operatingProfit" fill="#00a7f4" radius={[6, 6, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="flex h-full items-center justify-center text-sm text-slate-500">
                                {t('no_financial_data_yet')}
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card className="border-slate-200 shadow-sm">
                    <CardHeader>
                        <CardTitle>{t('top_pipeline_deals')}</CardTitle>
                        <CardDescription>{t('top_pipeline_description')}</CardDescription>
                    </CardHeader>
                    <CardContent className="h-[360px]">
                        {pipelineDeals.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={pipelineDeals} layout="vertical" margin={{ top: 5, right: 20, left: 90, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                                    <XAxis type="number" tickFormatter={(value) => formatMoneyShort(Number(value), currency)} tickLine={false} axisLine={false} />
                                    <YAxis type="category" dataKey="name" width={110} tickLine={false} axisLine={false} />
                                    <Tooltip formatter={(value) => formatMoney(Number(value ?? 0), currency)} />
                                    <Legend />
                                    <Bar name={t('weighted_value')} dataKey="weightedValue" fill="#8B5CF6" radius={[0, 6, 6, 0]} />
                                    <Bar name={t('target_value')} dataKey="rawTarget" fill="#CBD5E1" radius={[0, 6, 6, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="flex h-full items-center justify-center text-sm text-slate-500">
                                {t('no_active_pipeline')}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </section>
        </div>
    );
}
