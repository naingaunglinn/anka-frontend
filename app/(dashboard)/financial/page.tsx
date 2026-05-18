'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
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
import { scheduleTrackingKeys, type LateHourEmployeeRow, type ProjectLateHoursResponse } from '@/lib/queries/scheduleTracking';
import api from '@/lib/api';
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
    /** True when overtimeHours/overtimeCost came from phase_progress_logs
     *  (preferred) vs. the legacy time_entries-derived estimate. */
    overtimeSource: 'progress_logs' | 'time_entries';
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

// Task-level fields (status / dates) live on phases[] — aggregate across them
// so the financial page can keep treating a task as a single timeline.
function taskPlannedStart(task: ProjectTaskAssignment): string | null {
    const dates = task.phases.map((p) => parseDate(p.plannedStart)).filter((d): d is Date => !!d);
    return dates.length ? new Date(Math.min(...dates.map((d) => d.getTime()))).toISOString() : null;
}

function taskPlannedEnd(task: ProjectTaskAssignment): string | null {
    const dates = task.phases.map((p) => parseDate(p.plannedEnd)).filter((d): d is Date => !!d);
    return dates.length ? new Date(Math.max(...dates.map((d) => d.getTime()))).toISOString() : null;
}

function taskActualStart(task: ProjectTaskAssignment): string | null {
    const dates = task.phases.map((p) => parseDate(p.actualStart)).filter((d): d is Date => !!d);
    return dates.length ? new Date(Math.min(...dates.map((d) => d.getTime()))).toISOString() : null;
}

function taskActualEnd(task: ProjectTaskAssignment): string | null {
    if (task.phases.length === 0 || task.phases.some((p) => !p.actualEnd)) return null;
    const dates = task.phases.map((p) => parseDate(p.actualEnd)).filter((d): d is Date => !!d);
    return dates.length ? new Date(Math.max(...dates.map((d) => d.getTime()))).toISOString() : null;
}

function taskStatus(task: ProjectTaskAssignment): '未着手' | '進行中' | '完了' {
    if (task.phases.length > 0 && task.phases.every((p) => p.status === '完了')) return '完了';
    if (task.phases.some((p) => p.status === '進行中' || p.status === '完了' || !!p.actualStart)) return '進行中';
    return '未着手';
}

function getTaskProgress(task: ProjectTaskAssignment, today: Date): number {
    const status = taskStatus(task);
    const actualEnd = taskActualEnd(task);
    if (status === '完了' || !!actualEnd) {
        return 1;
    }

    const actualStart = taskActualStart(task);
    const started = status === '進行中' || !!actualStart;
    if (!started) return 0;

    const start = parseDate(actualStart) ?? parseDate(taskPlannedStart(task));
    const end = parseDate(actualEnd) ?? parseDate(taskPlannedEnd(task));
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
    const aggregatedPlannedStart = getEarlierDate(...tasks.map((task) => parseDate(taskPlannedStart(task))));
    const aggregatedPlannedEnd = getLaterDate(...tasks.map((task) => parseDate(taskPlannedEnd(task))));
    const projectStart = parseDate(project.kickoffDate) ?? parseDate(project.startDate);
    const projectEnd = parseDate(project.endDate);

    const plannedStart = projectStart ?? aggregatedPlannedStart;
    const timelineMonths = positiveNumber(deal?.timelineMonths || deal?.finalContractMonths);
    const plannedEnd = projectEnd ?? aggregatedPlannedEnd ?? (plannedStart && timelineMonths > 0 ? addMonths(plannedStart, timelineMonths) : null);

    return { plannedStart, plannedEnd };
}

function getActualStart(project: Project, tasks: ProjectTaskAssignment[], projectEntries: TimeEntry[]): Date | null {
    const aggregatedActualStart = getEarlierDate(...tasks.map((task) => parseDate(taskActualStart(task))));
    const firstEntryDate = getEarlierDate(...projectEntries.map((entry) => parseDate(entry.date)));
    const kickoff = parseDate(project.kickoffDate) ?? parseDate(project.startDate);
    return aggregatedActualStart ?? firstEntryDate ?? kickoff;
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
    const t = useTranslations();
    const store = useBusinessStore();
    const { activeTenantId, currentTenant, tenants } = useTenantStore();
    const currency = (currentTenant?.currency as Currency) ?? tenants.find((tenant) => tenant.id === activeTenantId)?.currency ?? 'MMK';
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

    // Per-project late-hours pulled from phase_progress_logs. Preferred over
    // the legacy time_entries-derived overtime calc because employees self-
    // report progress vs used hours daily on /my-schedule, while time_entries
    // require manager approval and skip the daily inefficiency signal.
    const lateHoursQueries = useQueries({
        queries: projects.map((project) => ({
            queryKey: scheduleTrackingKeys.lateHoursForProject(project.id),
            queryFn: async (): Promise<ProjectLateHoursResponse> => {
                const { data } = await api.get(`/projects/${project.id}/late-hours-by-day`);
                const meta = (data.meta ?? {}) as Record<string, unknown>;
                return {
                    data: ((data.data ?? []) as Record<string, unknown>[]).map((r) => ({
                        logDate:       (r.log_date as string) ?? '',
                        employeeId:    r.employee_id as string,
                        employeeName:  (r.employee_name as string | null) ?? null,
                        rankCode:      (r.rank_code as string | null) ?? null,
                        capacityRole:  (r.capacity_role as string | null) ?? null,
                        progressHours: Number(r.progress_hours ?? 0),
                        usedHours:     Number(r.used_hours ?? 0),
                        lateHours:     Number(r.late_hours ?? 0),
                        costPerHour:   Number(r.cost_per_hour ?? 0),
                        lateCost:      Number(r.late_cost ?? 0),
                    })),
                    byEmployee: ((data.by_employee ?? []) as Record<string, unknown>[]).map((r) => ({
                        employeeId:         r.employee_id as string,
                        employeeName:       (r.employee_name as string | null) ?? null,
                        rankCode:           (r.rank_code as string | null) ?? null,
                        capacityRole:       (r.capacity_role as string | null) ?? null,
                        costPerHour:        Number(r.cost_per_hour ?? 0),
                        totalProgressHours: Number(r.total_progress_hours ?? 0),
                        totalUsedHours:     Number(r.total_used_hours ?? 0),
                        totalLateHours:     Number(r.total_late_hours ?? 0),
                        totalLateCost:      Number(r.total_late_cost ?? 0),
                        daysCount:          Number(r.days_count ?? 0),
                    })),
                    meta: {
                        projectId:      (meta.project_id as string) ?? project.id,
                        projectName:    (meta.project_name as string) ?? project.name,
                        asOf:           (meta.as_of as string | null) ?? null,
                        totalLateHours: Number(meta.total_late_hours ?? 0),
                        totalLateCost:  Number(meta.total_late_cost ?? 0),
                        logCount:       Number(meta.log_count ?? 0),
                    },
                };
            },
            enabled: !!project.id,
            staleTime: 30_000,
        })),
    });

    const lateHoursByProject = useMemo(() => {
        const map = new Map<string, ProjectLateHoursResponse | undefined>();
        projects.forEach((project, index) => {
            map.set(project.id, lateHoursQueries[index]?.data);
        });
        return map;
    }, [projects, lateHoursQueries]);

    const taskAssignmentsByProject = useMemo(() => {
        const map = new Map<string, ProjectTaskAssignment[]>();
        projects.forEach((project, index) => {
            map.set(project.id, taskAssignmentQueries[index]?.data?.data ?? []);
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

                // Prefer phase_progress_logs-derived overtime (employees' self-
                // reported "used > progress" per day, multiplied by their real
                // cost_per_hour). Falls back to the time_entries estimate when
                // no logs exist for the project yet.
                const lateHoursData = lateHoursByProject.get(project.id);
                const hasLogData = !!lateHoursData && lateHoursData.meta.logCount > 0;

                const averageActualCostPerHour = actualHours > 0 ? actualLaborCost / actualHours : positiveNumber(store.companySettings.fallbackHourlyCost);
                const plannedHoursToDate = positiveNumber(project.budgetHours) * plannedProgress;

                const overtimeHours = hasLogData
                    ? lateHoursData!.meta.totalLateHours
                    : Math.max(0, actualHours - plannedHoursToDate);
                const overtimeCost = hasLogData
                    ? lateHoursData!.meta.totalLateCost
                    : overtimeHours * averageActualCostPerHour;
                const overtimeSource: 'progress_logs' | 'time_entries' = hasLogData ? 'progress_logs' : 'time_entries';

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
                    overtimeSource,
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
        lateHoursByProject,
        today,
    ]);

    // Cross-project Late Hours by Member rollup. Sums each employee's
    // total_late_hours / total_late_cost across every project they appear in.
    interface LateHoursMemberRow extends LateHourEmployeeRow {
        projectCount: number;
        projectNames: string[];
    }

    const lateHoursByMember = useMemo<LateHoursMemberRow[]>(() => {
        const bucket = new Map<string, LateHoursMemberRow>();
        projects.forEach((project) => {
            const data = lateHoursByProject.get(project.id);
            if (!data) return;
            data.byEmployee.forEach((row) => {
                const existing = bucket.get(row.employeeId);
                if (!existing) {
                    bucket.set(row.employeeId, {
                        ...row,
                        projectCount: 1,
                        projectNames: [project.name],
                    });
                    return;
                }
                existing.totalProgressHours += row.totalProgressHours;
                existing.totalUsedHours     += row.totalUsedHours;
                existing.totalLateHours     += row.totalLateHours;
                existing.totalLateCost      += row.totalLateCost;
                existing.daysCount          += row.daysCount;
                existing.projectCount       += 1;
                existing.projectNames.push(project.name);
            });
        });
        return Array.from(bucket.values())
            .map((r) => ({
                ...r,
                totalProgressHours: Math.round(r.totalProgressHours * 100) / 100,
                totalUsedHours:     Math.round(r.totalUsedHours * 100) / 100,
                totalLateHours:     Math.round(r.totalLateHours * 100) / 100,
                totalLateCost:      Math.round(r.totalLateCost * 100) / 100,
            }))
            .sort((a, b) => b.totalLateHours - a.totalLateHours);
    }, [projects, lateHoursByProject]);

    const lateHoursTotal = useMemo(
        () => ({
            hours:   lateHoursByMember.reduce((s, r) => s + r.totalLateHours, 0),
            cost:    lateHoursByMember.reduce((s, r) => s + r.totalLateCost, 0),
            members: lateHoursByMember.length,
        }),
        [lateHoursByMember],
    );

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
                    <h1 className="text-2xl font-bold tracking-tight text-[#171717]">{t('financial_performance')}</h1>
                    <p className="mt-1 text-[#8a8a8a]">{t('financial_subtitle')}</p>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <div className="flex items-center gap-2">
                        <Input
                            type="month"
                            value={dateFrom}
                            onChange={(e) => setDateFrom(e.target.value)}
                            placeholder={t('from')}
                            className="w-40"
                        />
                        <span className="text-sm text-[#8a8a8a]">{t('to')}</span>
                        <Input
                            type="month"
                            value={dateTo}
                            onChange={(e) => setDateTo(e.target.value)}
                            placeholder={t('to_placeholder')}
                            className="w-40"
                        />
                        {(dateFrom || dateTo) && (
                            <Button variant="ghost" size="sm" onClick={() => { setDateFrom(''); setDateTo(''); }}>
                                {t('clear')}
                            </Button>
                        )}
                    </div>
                    <Button variant="outline" onClick={handleCsvExport} className="gap-2 bg-white">
                        <Download className="h-4 w-4" /> {t('export_csv')}
                    </Button>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <Card className="border-[#e6e9ee] shadow-sm">
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-[#8a8a8a]">{t('company_actual_profit')}</p>
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
                            <p className="text-sm font-medium text-[#8a8a8a]">{t('company_plan_profit_to_date')}</p>
                            <TrendingUp className="h-4 w-4 text-[#00a7f4]" />
                        </div>
                        <div className="mt-2 text-3xl font-bold tracking-tight text-[#171717]">
                            {formatMoney(projectSummary.planProfitToDate, currency)}
                        </div>
                        <p className="mt-2 text-xs text-[#8a8a8a]">{t('baseline_based_on_planned_time')}</p>
                    </CardContent>
                </Card>

                <Card className="border-[#e6e9ee] shadow-sm">
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-[#8a8a8a]">{t('profit_variance')}</p>
                            <TrendingDown className={`h-4 w-4 ${projectSummary.variance >= 0 ? 'text-emerald-500' : 'text-rose-500'}`} />
                        </div>
                        <div className={`mt-2 text-3xl font-bold tracking-tight ${projectSummary.variance >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {formatMoney(projectSummary.variance, currency)}
                        </div>
                        <p className="mt-2 text-xs text-[#8a8a8a]">{t('actual_minus_plan_helper')}</p>
                    </CardContent>
                </Card>

                <Card className="border-[#e6e9ee] shadow-sm">
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-[#8a8a8a]">{t('projects_needing_attention')}</p>
                            <AlertTriangle className="h-4 w-4 text-amber-500" />
                        </div>
                        <div className="mt-2 flex items-end gap-3">
                            <span className="text-3xl font-bold tracking-tight text-[#171717]">{projectSummary.atRisk}</span>
                            <span className="pb-1 text-sm text-[#8a8a8a]">{t('watch_count', { count: projectSummary.watch })}</span>
                        </div>
                        <p className="mt-2 text-xs text-[#8a8a8a]">{t('projects_behind_plan')}</p>
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-6 xl:grid-cols-[1.2fr,1fr]">
                <section className="rounded-lg border border-[#e6e9ee] bg-white">
                    <div className="border-b px-6 py-4">
                        <h2 className="text-lg font-semibold text-[#171717]">{t('company_profit_snapshot')}</h2>
                        <p className="mt-1 text-sm text-[#8a8a8a]">{t('company_profit_snapshot_subtitle')}</p>
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
                            {t('profit_logic')}
                        </CardTitle>
                        <CardDescription className="text-[#8a8a8a]">
                            {t('profit_logic_desc')}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3 pt-0 text-sm text-[#4a4a4a]">
                        <p>
                            <span className="font-semibold text-[#171717]">{t('plan_profit')}</span> {t('plan_profit_explain')}
                        </p>
                        <p>
                            <span className="font-semibold text-[#171717]">{t('actual_profit')}</span> {t('actual_profit_explain')}
                        </p>
                        <p>
                            <span className="font-semibold text-[#171717]">{t('overtime_impact_label')}</span> {t('overtime_impact_explain')}
                        </p>
                    </CardContent>
                </Card>
            </div>

            <section className="rounded-lg border border-[#e6e9ee] bg-white">
                <div className="border-b px-6 py-4">
                    <h2 className="text-lg font-semibold text-[#171717]">{t('project_profit_comparison')}</h2>
                    <p className="mt-1 text-sm text-[#8a8a8a]">{t('project_profit_comparison_subtitle')}</p>
                </div>
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader className="bg-white">
                            <TableRow>
                                <TableHead className="py-4">{t('project')}</TableHead>
                                <TableHead className="py-4">{t('rank')}</TableHead>
                                <TableHead className="text-right py-4">{t('plan_profit_col')}</TableHead>
                                <TableHead className="text-right py-4">{t('plan_profit_to_date_col')}</TableHead>
                                <TableHead className="text-right py-4">{t('actual_profit_col')}</TableHead>
                                <TableHead className="text-right py-4">{t('variance_col')}</TableHead>
                                <TableHead className="text-right py-4">{t('ot_impact_col')}</TableHead>
                                <TableHead className="text-right py-4">{t('progress')}</TableHead>
                                <TableHead className="py-4">{t('status')}</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {projectProfitRows.map((row) => (
                                <TableRow key={row.id} className="align-top hover:bg-slate-50/50">
                                    <TableCell className="py-4">
                                        <div className="font-semibold text-[#171717]">{row.name}</div>
                                        <div className="mt-1 text-xs text-[#8a8a8a]">{row.client}</div>
                                        <div className="mt-1 text-xs text-[#8a8a8a]">{t('ot_policy_label', { policy: row.otPolicy.replaceAll('_', ' ') })}</div>
                                        <div className="mt-2 text-xs text-[#8a8a8a]">
                                            {t('actual_hours_vs_budget_pace', { hours: row.actualHours.toFixed(1), pct: Math.round(row.plannedProgress * 100) })}
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
                                            <div className="mt-1 text-xs text-[#8a8a8a]">{t('ot_hrs_short', { hours: row.overtimeHours.toFixed(1) })}</div>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-right py-4">
                                        <div className="font-medium text-[#171717]">
                                            {Math.round(row.actualProgress * 100)}%
                                        </div>
                                        <div className={`mt-1 text-xs ${row.progressDelta >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                            {t('vs_plan', { pct: Math.round(row.plannedProgress * 100) })}
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
                                        {t('no_project_profit_data')}
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
            </section>

            {/* Late Hours by Members — sourced from phase_progress_logs daily
                self-reports (used_hours − progress_hours, clamped ≥0). Feeds the
                overtime cost column above when log data is present. */}
            <section className="space-y-3">
                <div className="flex items-end justify-between gap-3">
                    <div>
                        <h3 className="text-lg font-semibold text-[#171717]">{t('late_hours_by_members')}</h3>
                        <p className="text-sm text-[#8a8a8a]">
                            {t('late_hours_subtitle')}
                        </p>
                    </div>
                    <div className="flex gap-6 text-right">
                        <div>
                            <div className="text-xs uppercase tracking-wide text-[#8a8a8a]">{t('members')}</div>
                            <div className="text-lg font-semibold text-[#171717]">{lateHoursTotal.members}</div>
                        </div>
                        <div>
                            <div className="text-xs uppercase tracking-wide text-[#8a8a8a]">{t('total_late_hrs')}</div>
                            <div className="text-lg font-semibold text-rose-700">{lateHoursTotal.hours.toFixed(1)}h</div>
                        </div>
                        <div>
                            <div className="text-xs uppercase tracking-wide text-[#8a8a8a]">{t('total_late_cost')}</div>
                            <div className="text-lg font-semibold text-rose-700">{formatMoney(lateHoursTotal.cost, currency)}</div>
                        </div>
                    </div>
                </div>
                <div className="overflow-x-auto rounded-md border border-[#e6e9ee] bg-white">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>{t('member')}</TableHead>
                                <TableHead>{t('rank')}</TableHead>
                                <TableHead>{t('capacity_role')}</TableHead>
                                <TableHead className="text-right">{t('cost_per_hr')}</TableHead>
                                <TableHead className="text-right">{t('days_logged')}</TableHead>
                                <TableHead className="text-right">{t('progress_h')}</TableHead>
                                <TableHead className="text-right">{t('used_h')}</TableHead>
                                <TableHead className="text-right">{t('late_h')}</TableHead>
                                <TableHead className="text-right">{t('late_cost')}</TableHead>
                                <TableHead>{t('projects')}</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {lateHoursByMember.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={10} className="py-8 text-center text-sm text-[#8a8a8a]">
                                        {t('no_late_hours_logs')}
                                    </TableCell>
                                </TableRow>
                            ) : lateHoursByMember.map((row) => (
                                <TableRow key={row.employeeId}>
                                    <TableCell className="font-medium text-[#171717]">{row.employeeName ?? row.employeeId}</TableCell>
                                    <TableCell>{row.rankCode ?? '—'}</TableCell>
                                    <TableCell>{row.capacityRole ?? '—'}</TableCell>
                                    <TableCell className="text-right">{formatMoney(row.costPerHour, currency)}</TableCell>
                                    <TableCell className="text-right">{row.daysCount}</TableCell>
                                    <TableCell className="text-right">{row.totalProgressHours.toFixed(1)}</TableCell>
                                    <TableCell className="text-right">{row.totalUsedHours.toFixed(1)}</TableCell>
                                    <TableCell className={`text-right font-medium ${row.totalLateHours > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                                        {row.totalLateHours > 0 ? '+' : ''}{row.totalLateHours.toFixed(1)}h
                                    </TableCell>
                                    <TableCell className={`text-right font-medium ${row.totalLateCost > 0 ? 'text-rose-700' : 'text-[#8a8a8a]'}`}>
                                        {formatMoney(row.totalLateCost, currency)}
                                    </TableCell>
                                    <TableCell className="text-xs text-[#8a8a8a]">
                                        {row.projectCount === 1
                                            ? row.projectNames[0]
                                            : t('projects_count', { count: row.projectCount })}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </section>

            <div className="grid gap-6 md:grid-cols-4">
                <Card className="border-[#e6e9ee] shadow-sm">
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-[#8a8a8a]">{t('total_recognized_revenue')}</p>
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
                            <p className="text-sm font-medium text-[#8a8a8a]">{t('total_costs_labor_overhead')}</p>
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
                            <p className="text-sm font-medium text-[#8a8a8a]">{t('operating_profit_label')}</p>
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
                            <p className="text-sm font-medium text-[#8a8a8a]">{t('overall_profit_margin')}</p>
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
                        {t('monthly_pnl_logic')}
                    </CardTitle>
                    <CardDescription className="text-[#8a8a8a]">
                        {t('monthly_pnl_logic_desc')}
                    </CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                    <div className="grid gap-x-8 gap-y-3 text-sm md:grid-cols-2">
                        <div>
                            <span className="font-semibold text-[#171717]">{t('recognized_revenue')}</span>
                            <p className="mt-0.5 text-xs text-[#8a8a8a]">
                                {t('recognized_revenue_desc')}
                            </p>
                        </div>
                        <div>
                            <span className="font-semibold text-[#171717]">{t('direct_labor')}</span>
                            <p className="mt-0.5 text-xs text-[#8a8a8a]">
                                {t('direct_labor_desc')}
                            </p>
                        </div>
                        <div>
                            <span className="font-semibold text-[#171717]">{t('global_overhead_label')}</span>
                            <p className="mt-0.5 text-xs text-[#8a8a8a]">
                                {t('global_overhead_desc')}
                            </p>
                        </div>
                        <div>
                            <span className="font-semibold text-[#171717]">{t('net_margin')}</span>
                            <p className="mt-0.5 text-xs text-[#8a8a8a]">
                                {t('net_margin_desc', { rate: (taxRate * 100).toFixed(0) })}
                            </p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card className="border-[#e6e9ee] shadow-sm">
                <CardHeader className="border-b bg-slate-50/50 pb-4">
                    <CardTitle className="text-lg">{t('monthly_pnl_statement')}</CardTitle>
                    <CardDescription>{t('monthly_pnl_statement_desc')}</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader className="bg-white">
                            <TableRow>
                                <TableHead className="py-4">{t('month')}</TableHead>
                                <TableHead className="text-right py-4">{t('recognized_revenue')}</TableHead>
                                <TableHead className="text-right py-4">{t('direct_labor')}</TableHead>
                                <TableHead className="text-right py-4">{t('gross_profit_col')}</TableHead>
                                <TableHead className="text-right py-4">{t('global_overhead_col')}</TableHead>
                                <TableHead className="text-right py-4">{t('op_profit_col')}</TableHead>
                                <TableHead className="text-right py-4">{t('net_margin_pct')}</TableHead>
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
                                        {t('no_financial_data_pnl')}
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
