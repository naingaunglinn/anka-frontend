'use client';

import { useMemo, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Download, AlertTriangle, DollarSign, Info, TrendingDown, TrendingUp } from 'lucide-react';
import { ResponsiveContainer, Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts';
import { Badge } from '@/components/ui/badge';
import { useBusinessStore } from '@/store/businessStore';
import { useTenantStore, type Currency } from '@/store/tenantStore';
import { formatMoney } from '@/lib/currency';
import { useInvoiceList } from '@/lib/queries/invoices';
import { useTimeEntryList } from '@/lib/queries/timeEntries';
import { useOrganizationSync } from '@/hooks/useOrganizationSync';
import { useContractList } from '@/lib/queries/contracts';
import { useDealList } from '@/lib/queries/deals';
import { fetchProjectTaskAssignments, projectKeys, useProjectList } from '@/lib/queries/projects';
import type { Contract, Deal, Employee, Project, ProjectTaskAssignment, TimeEntry } from '@/types/business';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
type ProfitHealth = 'On Plan' | 'Watch' | 'At Risk';

interface ProjectProfitRow {
    id: string;
    name: string;
    client: string;
    rank: string;
    planProfit: number;
    planProfitToDate: number;
    actualProfit: number;
    variance: number;
    planRevenue: number;
    actualRevenue: number;
    plannedCostToDate: number;
    actualLaborCost: number;
    overtimeImpact: number;
    overtimeHours: number;
    plannedProgress: number;
    actualProgress: number;
    progressDelta: number;
    actualHours: number;
    health: ProfitHealth;
    healthReason: string;
    otPolicy: string;
}

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

function getTaskProgress(task: ProjectTaskAssignment, today: Date): number {
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

function getActualProgress(project: Project, tasks: ProjectTaskAssignment[], actualHours: number, today: Date): number {
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

function getPlannedTimeline(project: Project, deal?: Deal, tasks: ProjectTaskAssignment[] = []): { plannedStart: Date | null; plannedEnd: Date | null } {
    const taskPlannedStart = getEarlierDate(...tasks.map((task) => parseDate(task.plannedStart)));
    const taskPlannedEnd = getLaterDate(...tasks.map((task) => parseDate(task.plannedEnd)));
    const projectStart = parseDate(project.kickoffDate) ?? parseDate(project.startDate);
    const projectEnd = parseDate(project.endDate);

    const plannedStart = projectStart ?? taskPlannedStart;
    const timelineMonths = positiveNumber(deal?.timelineMonths || deal?.finalContractMonths);
    const plannedEnd = projectEnd ?? taskPlannedEnd ?? (plannedStart && timelineMonths > 0 ? addMonths(plannedStart, timelineMonths) : null);

    return { plannedStart, plannedEnd };
}

function getActualStart(project: Project, tasks: ProjectTaskAssignment[], projectEntries: TimeEntry[]): Date | null {
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

function getHealth(variance: number, progressDelta: number): { health: ProfitHealth; reason: string } {
    if (variance >= 0 && progressDelta >= -0.05) {
        return { health: 'On Plan', reason: 'Profit and delivery are tracking close to plan.' };
    }

    if (variance >= -5000 && progressDelta >= -0.12) {
        return { health: 'Watch', reason: 'Small drift is showing; worth watching before it becomes margin loss.' };
    }

    if (progressDelta < -0.12) {
        return { health: 'At Risk', reason: 'Delivery progress is behind the planned running pace.' };
    }

    return { health: 'At Risk', reason: 'Actual profit is trailing the planned profit baseline.' };
}

function getHealthClasses(health: ProfitHealth): string {
    if (health === 'On Plan') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    if (health === 'Watch') return 'bg-amber-50 text-amber-700 border-amber-200';
    return 'bg-rose-50 text-rose-700 border-rose-200';
}

export default function FinancialPage() {
    const store = useBusinessStore();
    const { activeTenantId, currentTenant, tenants } = useTenantStore();
    const currency = (currentTenant?.currency as Currency) ?? tenants.find((t) => t.id === activeTenantId)?.currency ?? 'MMK';
    const taxRate = currentTenant?.taxRate ?? 0.20;
    const today = useMemo(() => new Date(), []);

    useInvoiceList();
    useTimeEntryList();
    useOrganizationSync();
    useDealList({ per_page: 500 });
    useContractList({ per_page: 500 });
    useProjectList({ per_page: 500 });

    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');

    const allPnlData = store.getFinancialPnL();

    const projects = store.projects;
    const deals = store.deals;
    const contracts = store.contracts;
    const employees = store.employees;
    const approvedTimeEntries = useMemo(
        () => store.timeEntries.filter((entry) => entry.status === 'Approved'),
        [store.timeEntries],
    );

    const taskAssignmentQueries = useQueries({
        queries: projects.map((project) => ({
            queryKey: projectKeys.taskAssignments(project.id),
            queryFn: () => fetchProjectTaskAssignments(project.id),
            enabled: !!project.id,
            staleTime: 10_000,
        })),
    });

    const taskAssignmentsByProject = useMemo(() => {
        const map = new Map<string, ProjectTaskAssignment[]>();
        projects.forEach((project, index) => {
            map.set(project.id, taskAssignmentQueries[index]?.data ?? []);
        });
        return map;
    }, [projects, taskAssignmentQueries]);

    const parseMonthKey = (displayMonth: string): string => {
        const d = new Date(`${displayMonth} 01`);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        return `${y}-${m}`;
    };

    const pnlData = useMemo(() => {
        if (!dateFrom && !dateTo) return allPnlData;
        return allPnlData.filter((row) => {
            const rowKey = parseMonthKey(row.month);
            if (dateFrom && rowKey < dateFrom) return false;
            if (dateTo && rowKey > dateTo) return false;
            return true;
        });
    }, [allPnlData, dateFrom, dateTo]);

    const monthlySummary = useMemo(() => {
        let totalRev = 0;
        let totalCost = 0;
        let totalProfit = 0;

        pnlData.forEach((month) => {
            totalRev += month.revenue;
            totalCost += month.directLabor + month.overhead;
            totalProfit += month.operatingProfit;
        });

        const overallMargin = totalRev > 0 ? (totalProfit / totalRev) * 100 : 0;
        return { totalRev, totalCost, totalProfit, overallMargin };
    }, [pnlData]);

    const projectProfitRows = useMemo<ProjectProfitRow[]>(() => {
        const contractsById = new Map(contracts.map((contract) => [contract.id, contract]));
        const dealsById = new Map(deals.map((deal) => [deal.id, deal]));
        const employeesById = new Map(employees.map((employee) => [employee.id, employee]));

        return projects
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
                const plannedDurationDays = plannedStart && plannedEnd ? diffDays(plannedStart, plannedEnd) : Math.max(30, positiveNumber(deal?.timelineMonths || deal?.finalContractMonths) * 30 || 180);
                const elapsedDays = actualStart ? diffDays(actualStart, today) : 0;
                const plannedProgress = plannedStart ? clamp(elapsedDays / plannedDurationDays) : 0;

                const actualHours = projectEntries.reduce((sum, entry) => sum + positiveNumber(entry.hours), 0);
                const actualLaborCost = projectEntries.reduce((sum, entry) => {
                    const employee = employeesById.get(entry.employeeId) as Employee | undefined;
                    const hourlyCost = positiveNumber(employee?.costPerHour) || (positiveNumber(employee?.monthlySalary) / Math.max(positiveNumber(employee?.workableHours), 1));
                    return sum + (positiveNumber(entry.hours) * hourlyCost);
                }, 0);

                const actualProgress = getActualProgress(project, tasks, actualHours, today);
                const actualRevenue = planRevenue * actualProgress;

                const plannedCostToDate = planCost * plannedProgress;
                const plannedProfitToDate = planProfit * plannedProgress;

                const plannedHoursToDate = positiveNumber(project.budgetHours) * plannedProgress;
                const overtimeHours = Math.max(0, actualHours - plannedHoursToDate);
                const averageActualCostPerHour = actualHours > 0 ? actualLaborCost / actualHours : positiveNumber(store.companySettings.fallbackHourlyCost);
                const overtimeCost = overtimeHours * averageActualCostPerHour;
                const runningMonths = Math.max(1, Math.ceil(elapsedDays / 30));
                const { overtimeImpact, overtimeRevenue } = getOvertimeMetrics(deal, overtimeHours, overtimeCost, runningMonths);

                const actualProfit = actualRevenue + overtimeRevenue - actualLaborCost;
                const variance = actualProfit - plannedProfitToDate;
                const progressDelta = actualProgress - plannedProgress;
                const { health, reason } = getHealth(variance, progressDelta);

                return {
                    id: project.id,
                    name: project.name,
                    client: project.client,
                    rank: deal?.status === 'won' ? 'S' : deal?.status === 'negotiation' ? 'A' : deal?.status === 'qualified' ? 'B' : 'C',
                    planProfit,
                    planProfitToDate: plannedProfitToDate,
                    actualProfit,
                    variance,
                    planRevenue,
                    actualRevenue,
                    plannedCostToDate,
                    actualLaborCost,
                    overtimeImpact,
                    overtimeHours,
                    plannedProgress,
                    actualProgress,
                    progressDelta,
                    actualHours,
                    health,
                    healthReason: reason,
                    otPolicy: deal?.otPolicyModel ?? 'not_set',
                };
            })
            .filter((row) => row.planRevenue > 0 || row.actualLaborCost > 0 || row.planProfit !== 0)
            .sort((a, b) => a.variance - b.variance);
    }, [
        approvedTimeEntries,
        contracts,
        deals,
        employees,
        projects,
        store.companySettings.fallbackHourlyCost,
        taskAssignmentsByProject,
        today,
    ]);

    const projectSummary = useMemo(() => {
        const totals = projectProfitRows.reduce((acc, row) => {
            acc.planProfit += row.planProfit;
            acc.planProfitToDate += row.planProfitToDate;
            acc.actualProfit += row.actualProfit;
            acc.variance += row.variance;
            acc.atRisk += row.health === 'At Risk' ? 1 : 0;
            acc.watch += row.health === 'Watch' ? 1 : 0;
            return acc;
        }, { planProfit: 0, planProfitToDate: 0, actualProfit: 0, variance: 0, atRisk: 0, watch: 0 });

        return {
            ...totals,
            statusLabel: totals.actualProfit >= 0 ? 'Company profit is positive' : 'Company profit is negative',
        };
    }, [projectProfitRows]);

    const companyChartData = useMemo(() => ([
        { name: 'Plan To Date', amount: projectSummary.planProfitToDate },
        { name: 'Actual Profit', amount: projectSummary.actualProfit },
    ]), [projectSummary.actualProfit, projectSummary.planProfitToDate]);

    const handleCsvExport = () => {
        const headers = ['Month', 'Revenue', 'Direct Labor', 'Overhead', 'Gross Profit', 'Operating Profit', 'Net Profit'];
        const rows = pnlData.map((row) => [
            row.month,
            row.revenue,
            row.directLabor,
            row.overhead,
            row.grossProfit,
            row.operatingProfit,
            row.netProfit,
        ]);

        const csvContent = 'data:text/csv;charset=utf-8,'
            + headers.join(',') + '\n'
            + rows.map((row) => row.join(',')).join('\n');

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', 'pnl_statement.csv');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="p-6 space-y-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-[#171717]">Financial Performance</h1>
                    <p className="mt-1 text-[#8a8a8a]">Project profit tracking, company overall profit, and monthly P&amp;L in one place.</p>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <div className="flex items-center gap-2">
                        <Input
                            type="month"
                            value={dateFrom}
                            onChange={(e) => setDateFrom(e.target.value)}
                            placeholder="From"
                            className="w-40"
                        />
                        <span className="text-sm text-[#8a8a8a]">to</span>
                        <Input
                            type="month"
                            value={dateTo}
                            onChange={(e) => setDateTo(e.target.value)}
                            placeholder="To"
                            className="w-40"
                        />
                        {(dateFrom || dateTo) && (
                            <Button variant="ghost" size="sm" onClick={() => { setDateFrom(''); setDateTo(''); }}>
                                Clear
                            </Button>
                        )}
                    </div>
                    <Button variant="outline" onClick={handleCsvExport} className="gap-2 bg-white">
                        <Download className="h-4 w-4" /> Export CSV
                    </Button>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <Card className="border-[#e6e9ee] shadow-sm">
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-[#8a8a8a]">Company Actual Profit</p>
                            <DollarSign className={`h-4 w-4 ${projectSummary.actualProfit >= 0 ? 'text-emerald-500' : 'text-rose-500'}`} />
                        </div>
                        <div className={`mt-2 text-3xl font-bold tracking-tight ${projectSummary.actualProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {formatMoney(projectSummary.actualProfit, currency)}
                        </div>
                        <p className="mt-2 text-xs text-[#8a8a8a]">{projectSummary.statusLabel}</p>
                    </CardContent>
                </Card>

                <Card className="border-[#e6e9ee] shadow-sm">
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-[#8a8a8a]">Company Plan Profit (To Date)</p>
                            <TrendingUp className="h-4 w-4 text-[#00a7f4]" />
                        </div>
                        <div className="mt-2 text-3xl font-bold tracking-tight text-[#171717]">
                            {formatMoney(projectSummary.planProfitToDate, currency)}
                        </div>
                        <p className="mt-2 text-xs text-[#8a8a8a]">Baseline based on planned project running time.</p>
                    </CardContent>
                </Card>

                <Card className="border-[#e6e9ee] shadow-sm">
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-[#8a8a8a]">Profit Variance</p>
                            <TrendingDown className={`h-4 w-4 ${projectSummary.variance >= 0 ? 'text-emerald-500' : 'text-rose-500'}`} />
                        </div>
                        <div className={`mt-2 text-3xl font-bold tracking-tight ${projectSummary.variance >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {formatMoney(projectSummary.variance, currency)}
                        </div>
                        <p className="mt-2 text-xs text-[#8a8a8a]">Actual profit minus planned profit baseline.</p>
                    </CardContent>
                </Card>

                <Card className="border-[#e6e9ee] shadow-sm">
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-[#8a8a8a]">Projects Needing Attention</p>
                            <AlertTriangle className="h-4 w-4 text-amber-500" />
                        </div>
                        <div className="mt-2 flex items-end gap-3">
                            <span className="text-3xl font-bold tracking-tight text-[#171717]">{projectSummary.atRisk}</span>
                            <span className="pb-1 text-sm text-[#8a8a8a]">{projectSummary.watch} watch</span>
                        </div>
                        <p className="mt-2 text-xs text-[#8a8a8a]">Projects behind plan on margin, pace, or both.</p>
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-6 xl:grid-cols-[1.2fr,1fr]">
                <section className="rounded-lg border border-[#e6e9ee] bg-white">
                    <div className="border-b px-6 py-4">
                        <h2 className="text-lg font-semibold text-[#171717]">Company Profit Snapshot</h2>
                        <p className="mt-1 text-sm text-[#8a8a8a]">Compare current overall project profit against the planned baseline.</p>
                    </div>
                    <div className="h-[280px] px-4 py-4">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={companyChartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="name" tickLine={false} axisLine={false} />
                                <YAxis tickLine={false} axisLine={false} tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`} />
                                <Tooltip formatter={(value) => formatMoney(Number(value ?? 0), currency)} />
                                <Bar dataKey="amount" radius={[6, 6, 0, 0]} fill="#00a7f4" />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </section>

                <Card className="border-[#00a7f4]/20 bg-[#00a7f4]/[0.03] shadow-sm">
                    <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-base text-[#171717]">
                            <Info className="h-4 w-4 text-[#00a7f4]" />
                            Profit Logic
                        </CardTitle>
                        <CardDescription className="text-[#8a8a8a]">
                            Project profit now reads from delivery progress, actual running time, and OT policy.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3 pt-0 text-sm text-[#4a4a4a]">
                        <p>
                            <span className="font-semibold text-[#171717]">Plan Profit</span> comes from the project&apos;s planned revenue and estimated cost, then the dashboard scales it by the planned running timeline to get the expected profit by today.
                        </p>
                        <p>
                            <span className="font-semibold text-[#171717]">Actual Profit</span> uses current project progress. For S-rank projects, progress is weighted from Task Assign and Tracking rows; otherwise it falls back to approved hours against budget hours.
                        </p>
                        <p>
                            <span className="font-semibold text-[#171717]">Overtime Impact</span> is only shown as a negative when the contract does not have an OT fee recovery path. If OT fees exist, the impact line stays neutral and any recoverable OT revenue is added back into actual profit.
                        </p>
                    </CardContent>
                </Card>
            </div>

            <section className="rounded-lg border border-[#e6e9ee] bg-white">
                <div className="border-b px-6 py-4">
                    <h2 className="text-lg font-semibold text-[#171717]">Project Profit Comparison</h2>
                    <p className="mt-1 text-sm text-[#8a8a8a]">See which projects are following plan and which ones are moving into risk.</p>
                </div>
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader className="bg-white">
                            <TableRow>
                                <TableHead className="py-4">Project</TableHead>
                                <TableHead className="py-4">Rank</TableHead>
                                <TableHead className="text-right py-4">Plan Profit</TableHead>
                                <TableHead className="text-right py-4">Plan Profit (To Date)</TableHead>
                                <TableHead className="text-right py-4">Actual Profit</TableHead>
                                <TableHead className="text-right py-4">Variance</TableHead>
                                <TableHead className="text-right py-4">OT Impact</TableHead>
                                <TableHead className="text-right py-4">Progress</TableHead>
                                <TableHead className="py-4">Status</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {projectProfitRows.map((row) => (
                                <TableRow key={row.id} className="align-top hover:bg-slate-50/50">
                                    <TableCell className="py-4">
                                        <div className="font-semibold text-[#171717]">{row.name}</div>
                                        <div className="mt-1 text-xs text-[#8a8a8a]">{row.client}</div>
                                        <div className="mt-1 text-xs text-[#8a8a8a]">OT policy: {row.otPolicy.replaceAll('_', ' ')}</div>
                                        <div className="mt-2 text-xs text-[#8a8a8a]">
                                            Actual hours {row.actualHours.toFixed(1)} / budget pace {Math.round(row.plannedProgress * 100)}%
                                        </div>
                                    </TableCell>
                                    <TableCell className="py-4">
                                        <Badge variant="outline" className="border-[#d9e7f2] bg-slate-50 text-slate-700">
                                            {row.rank}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-right py-4">{formatMoney(row.planProfit, currency)}</TableCell>
                                    <TableCell className="text-right py-4">{formatMoney(row.planProfitToDate, currency)}</TableCell>
                                    <TableCell className={`text-right py-4 font-semibold ${row.actualProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                        {formatMoney(row.actualProfit, currency)}
                                    </TableCell>
                                    <TableCell className={`text-right py-4 font-semibold ${row.variance >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                        {formatMoney(row.variance, currency)}
                                    </TableCell>
                                    <TableCell className={`text-right py-4 ${row.overtimeImpact < 0 ? 'text-rose-600' : 'text-slate-600'}`}>
                                        {formatMoney(row.overtimeImpact, currency)}
                                        {row.overtimeHours > 0 && (
                                            <div className="mt-1 text-xs text-[#8a8a8a]">{row.overtimeHours.toFixed(1)} OT hrs</div>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-right py-4">
                                        <div className="font-medium text-[#171717]">
                                            {Math.round(row.actualProgress * 100)}%
                                        </div>
                                        <div className={`mt-1 text-xs ${row.progressDelta >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                            vs plan {Math.round(row.plannedProgress * 100)}%
                                        </div>
                                    </TableCell>
                                    <TableCell className="py-4">
                                        <Badge variant="outline" className={getHealthClasses(row.health)}>
                                            {row.health}
                                        </Badge>
                                        <div className="mt-2 max-w-[220px] text-xs text-[#8a8a8a]">{row.healthReason}</div>
                                    </TableCell>
                                </TableRow>
                            ))}
                            {projectProfitRows.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={9} className="py-8 text-center text-[#8a8a8a]">
                                        No project profit data yet. Signed projects with time tracking will appear here.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
            </section>

            <div className="grid gap-6 md:grid-cols-4">
                <Card className="border-[#e6e9ee] shadow-sm">
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-[#8a8a8a]">Total Recognized Revenue</p>
                            <DollarSign className="h-4 w-4 text-emerald-500" />
                        </div>
                        <div className="mt-2 text-3xl font-bold tracking-tight text-[#171717]">
                            {formatMoney(monthlySummary.totalRev, currency)}
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-[#e6e9ee] shadow-sm">
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-[#8a8a8a]">Total Costs (Labor + Overhead)</p>
                            <TrendingDown className="h-4 w-4 text-rose-500" />
                        </div>
                        <div className="mt-2 text-3xl font-bold tracking-tight text-[#171717]">
                            {formatMoney(monthlySummary.totalCost, currency)}
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-[#e6e9ee] shadow-sm">
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-[#8a8a8a]">Operating Profit</p>
                            <TrendingUp className="h-4 w-4 text-emerald-500" />
                        </div>
                        <div className={`mt-2 text-3xl font-bold tracking-tight ${monthlySummary.totalProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {formatMoney(monthlySummary.totalProfit, currency)}
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-[#e6e9ee] shadow-sm">
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-[#8a8a8a]">Overall Profit Margin</p>
                            <div className="flex h-4 w-4 items-center justify-center rounded-full bg-[#00a7f4]/10">
                                <span className="text-[10px] font-bold text-[#00a7f4]">%</span>
                            </div>
                        </div>
                        <div className="mt-2 text-3xl font-bold tracking-tight text-[#171717]">
                            {monthlySummary.overallMargin.toFixed(1)}%
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Card className="border-[#00a7f4]/20 bg-[#00a7f4]/[0.03] shadow-sm">
                <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base text-[#171717]">
                        <Info className="h-4 w-4 text-[#00a7f4]" />
                        Monthly P&amp;L Logic
                    </CardTitle>
                    <CardDescription className="text-[#8a8a8a]">
                        These monthly lines are still computed live from invoices, time tracking, and organization overheads.
                    </CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                    <div className="grid gap-x-8 gap-y-3 text-sm md:grid-cols-2">
                        <div>
                            <span className="font-semibold text-[#171717]">Recognized Revenue</span>
                            <p className="mt-0.5 text-xs text-[#8a8a8a]">
                                Sum of paid invoices, grouped by paid date.
                            </p>
                        </div>
                        <div>
                            <span className="font-semibold text-[#171717]">Direct Labor</span>
                            <p className="mt-0.5 text-xs text-[#8a8a8a]">
                                Full payroll for active and on-leave employees across months with activity.
                            </p>
                        </div>
                        <div>
                            <span className="font-semibold text-[#171717]">Global Overhead</span>
                            <p className="mt-0.5 text-xs text-[#8a8a8a]">
                                Organization overheads that match each month plus always-on costs.
                            </p>
                        </div>
                        <div>
                            <span className="font-semibold text-[#171717]">Net Margin</span>
                            <p className="mt-0.5 text-xs text-[#8a8a8a]">
                                Operating profit after tenant tax rate ({(taxRate * 100).toFixed(0)}%).
                            </p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card className="border-[#e6e9ee] shadow-sm">
                <CardHeader className="border-b bg-slate-50/50 pb-4">
                    <CardTitle className="text-lg">Monthly Profit &amp; Loss Statement</CardTitle>
                    <CardDescription>Breakdown of revenue versus costs by month.</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader className="bg-white">
                            <TableRow>
                                <TableHead className="py-4">Month</TableHead>
                                <TableHead className="text-right py-4">Recognized Revenue</TableHead>
                                <TableHead className="text-right py-4">Direct Labor</TableHead>
                                <TableHead className="text-right py-4">Gross Profit</TableHead>
                                <TableHead className="text-right py-4">Global Overhead</TableHead>
                                <TableHead className="text-right py-4">Op. Profit</TableHead>
                                <TableHead className="text-right py-4">Net Margin %</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {pnlData.map((row, index) => {
                                const margin = row.revenue > 0 ? (row.netProfit / row.revenue) * 100 : 0;
                                return (
                                    <TableRow key={index} className="hover:bg-slate-50/50">
                                        <TableCell className="py-4 font-semibold text-[#171717]">{row.month}</TableCell>
                                        <TableCell className="py-4 text-right text-[#4a4a4a]">{formatMoney(row.revenue, currency)}</TableCell>
                                        <TableCell className="py-4 text-right text-rose-600">-{formatMoney(row.directLabor, currency)}</TableCell>
                                        <TableCell className="py-4 text-right font-medium text-[#171717]">{formatMoney(row.grossProfit, currency)}</TableCell>
                                        <TableCell className="py-4 text-right text-rose-600">-{formatMoney(row.overhead, currency)}</TableCell>
                                        <TableCell className="py-4 text-right font-bold text-[#171717]">{formatMoney(row.operatingProfit, currency)}</TableCell>
                                        <TableCell className="py-4 text-right">
                                            <Badge
                                                variant="outline"
                                                className={
                                                    margin > 20
                                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                        : margin > 0
                                                            ? 'bg-[#00a7f4]/5 text-[#0086c4] border-[#00a7f4]/20'
                                                            : 'bg-rose-50 text-rose-700 border-rose-200'
                                                }
                                            >
                                                {margin.toFixed(1)}%
                                            </Badge>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                            {pnlData.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={7} className="py-8 text-center text-[#8a8a8a]">
                                        No financial data. Add invoices and time entries to generate P&amp;L statements.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
