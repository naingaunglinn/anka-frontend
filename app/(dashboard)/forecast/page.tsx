'use client';

import { Fragment, useMemo, useState, type JSX } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Line, LineChart, CartesianGrid, Legend, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, BarChart3, Loader2, Sparkles, TrendingDown, TrendingUp } from 'lucide-react';
import { useBusinessStore } from '@/store/businessStore';
import { useTenantStore, type Currency } from '@/store/tenantStore';
import { useAuthStore } from '@/store/authStore';
import { formatMoney, formatMoneyShort } from '@/lib/currency';
import { useOrganizationSync } from '@/hooks/useOrganizationSync';
import { useInvoiceList } from '@/lib/queries/invoices';
import { useTimeEntryList } from '@/lib/queries/timeEntries';
import { useProjectList } from '@/lib/queries/projects';
import { useContractList } from '@/lib/queries/contracts';
import { useDealList } from '@/lib/queries/deals';
import { useInitialBudget } from '@/lib/queries/initialBudgets';
import { dealRank, STAGE_PROBABILITY } from '@/lib/dealRanks';
import type { AIForecastInput, AIForecastResult } from '@/app/api/ai-forecast/route';
import type { Contract, Deal, Project } from '@/types/business';
import toast from 'react-hot-toast';

type ForecastRank = 'S' | 'A' | 'B';
type RankScope = 'S' | 'SA' | 'SAB';

type ForecastPoint = {
    monthKey: string;
    monthLabel: string;
    income: number;
    cost: number;
    profit: number;
};

type ProfitLinePoint = {
    x: number | null;
    y: number | null;
    payload?: ForecastPoint;
};

type ForecastTooltipEntry = {
    payload?: ForecastPoint;
};

type ForecastSource = {
    id: string;
    name: string;
    rank: ForecastRank;
    probability: number;
    incomeBudget: number;
    timelineMonths: number;
    activeStart: Date;
};

const RANK_SCOPE_OPTIONS: Array<{ value: RankScope; label: string; ranks: ForecastRank[] }> = [
    { value: 'S', label: 'S Project Only', ranks: ['S'] },
    { value: 'SA', label: 'S, A Project Only', ranks: ['S', 'A'] },
    { value: 'SAB', label: 'S, A, B Project Only', ranks: ['S', 'A', 'B'] },
];

function toMonthKey(date: Date): string {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
}

function startOfUtcMonth(date: Date): Date {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function addUtcMonths(date: Date, months: number): Date {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
}

function average(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function invoiceTotal(invoice: { total?: number; amount: number; tax: number }): number {
    return invoice.total ?? (invoice.amount + invoice.tax);
}

function positiveNumber(value: number | null | undefined): number {
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

function projectedDealValue(deal: Deal, contract?: Contract): number {
    const contractValue = positiveNumber(contract?.totalValue);
    if (contractValue > 0) return contractValue;

    const finalMonthlyValue = positiveNumber(deal.finalMonthlyFee) * Math.max(1, deal.finalContractMonths ?? deal.timelineMonths ?? 1);
    const finalValue = finalMonthlyValue + positiveNumber(deal.finalInstallationFee);
    if (finalValue > 0) return finalValue;

    return positiveNumber(deal.clientBudget) || positiveNumber(deal.estimatedValue);
}

function forecastStartDate(deal: Deal, contract?: Contract, project?: Project, fallback?: Date): Date {
    // Won deals: use the actual project / contract start (work is happening).
    // Non-won deals: estimate from expectedCloseDate. We add +1 day because
    // close-date conventionally lands the day before kickoff, so without the
    // bump a deal whose close is Jun 30 would be plotted from June instead
    // of the intended July project window.
    //
    // `finalConfirmedAt` is intentionally NOT in the chain — it marks when
    // the estimate was locked, not when work begins. Including it caused
    // non-won deals to appear weeks before their actual start window.
    const projectStart = project?.startDate ?? project?.kickoffDate ?? contract?.startDate;
    if (projectStart) {
        return startOfUtcMonth(new Date(projectStart));
    }

    if (deal.expectedCloseDate) {
        const closeDate = new Date(deal.expectedCloseDate);
        const dayAfterClose = new Date(closeDate.getTime() + 24 * 60 * 60 * 1000);
        return startOfUtcMonth(dayAfterClose);
    }

    return fallback ?? startOfUtcMonth(new Date());
}

function priorityBadgeClass(priority: AIForecastResult['recommendedActions'][number]['priority']): string {
    if (priority === 'high') return 'bg-rose-50 text-rose-700 border-rose-200';
    if (priority === 'low') return 'bg-slate-50 text-slate-700 border-slate-200';
    return 'bg-amber-50 text-amber-700 border-amber-200';
}

function ProfitLineShape(props: { points?: readonly ProfitLinePoint[] }) {
    const points = (props.points ?? []).filter(
        (p): p is { x: number; y: number; payload?: ForecastPoint } => p.x != null && p.y != null,
    );
    if (points.length < 2) return null;

    const segments: JSX.Element[] = [];

    for (let index = 1; index < points.length; index += 1) {
        const previous = points[index - 1];
        const current = points[index];
        const previousProfit = previous.payload?.profit ?? 0;
        const currentProfit = current.payload?.profit ?? 0;

        if ((previousProfit >= 0 && currentProfit >= 0) || (previousProfit < 0 && currentProfit < 0)) {
            segments.push(
                <line
                    key={`profit-segment-${index}`}
                    x1={previous.x}
                    y1={previous.y}
                    x2={current.x}
                    y2={current.y}
                    stroke={currentProfit >= 0 ? '#10B981' : '#EF4444'}
                    strokeWidth={3}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
            );
            continue;
        }

        const ratio = (0 - previousProfit) / (currentProfit - previousProfit);
        const crossingX = previous.x + ((current.x - previous.x) * ratio);
        const crossingY = previous.y + ((current.y - previous.y) * ratio);

        segments.push(
            <Fragment key={`profit-cross-${index}`}>
                <line
                    x1={previous.x}
                    y1={previous.y}
                    x2={crossingX}
                    y2={crossingY}
                    stroke={previousProfit >= 0 ? '#10B981' : '#EF4444'}
                    strokeWidth={3}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
                <line
                    x1={crossingX}
                    y1={crossingY}
                    x2={current.x}
                    y2={current.y}
                    stroke={currentProfit >= 0 ? '#10B981' : '#EF4444'}
                    strokeWidth={3}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
            </Fragment>
        );
    }

    return <g>{segments}</g>;
}

function ProfitDot(props: { cx?: number; cy?: number; payload?: ForecastPoint }) {
    if (props.cx == null || props.cy == null) return null;

    return (
        <circle
            cx={props.cx}
            cy={props.cy}
            r={4}
            fill="#FFFFFF"
            stroke={props.payload?.profit != null && props.payload.profit < 0 ? '#EF4444' : '#10B981'}
            strokeWidth={2}
        />
    );
}

function ForecastTooltipContent(props: { active?: boolean; payload?: ForecastTooltipEntry[]; currency: Currency }) {
    const point = props.payload?.[0]?.payload;
    if (!props.active || !point) return null;

    return (
        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-lg">
            <p className="mb-2 text-sm font-semibold text-slate-900">{point.monthLabel}</p>
            <div className="space-y-1 text-sm">
                <p className="text-amber-500">{formatMoney(point.cost, props.currency)}</p>
                <p className="text-blue-600">{formatMoney(point.income, props.currency)}</p>
                <p className={point.profit < 0 ? 'text-rose-500' : 'text-emerald-500'}>
                    {formatMoney(point.profit, props.currency)}
                </p>
            </div>
        </div>
    );
}

export default function ForecastPage() {
    const store = useBusinessStore();
    const { activeTenantId, currentTenant, tenants } = useTenantStore();
    const token = useAuthStore((s) => s.token);
    const currency = (currentTenant?.currency as Currency) ?? tenants.find((tenant) => tenant.id === activeTenantId)?.currency ?? 'MMK';

    useOrganizationSync();
    useDealList({ per_page: 500 });
    useContractList({ per_page: 500 });
    useProjectList({ per_page: 500 });
    useInvoiceList({ per_page: 1000 });
    useTimeEntryList({ per_page: 1000 });

    const [rankScope, setRankScope] = useState<RankScope>('S');
    const [prediction, setPrediction] = useState<AIForecastResult | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [summaryAttempt, setSummaryAttempt] = useState(0);

    const monthRange = useMemo(() => {
        // Full fiscal year — Jan through Dec of the current year, 12 months.
        const year = new Date().getUTCFullYear();
        const janFirst = new Date(Date.UTC(year, 0, 1));
        return Array.from({ length: 12 }, (_, index) => addUtcMonths(janFirst, index));
    }, []);

    const forecastWindowLabel = useMemo(() => {
        if (monthRange.length <= 1) return 'Current Month';
        return `${monthRange.length}-Month`;
    }, [monthRange]);

    // Process ①.3 / ⑧: the year of the first displayed month is the fiscal year
    // we're forecasting against. If the user has declared a budget for that
    // year it drives the budget-vs-actual comparison; if not, the UI shows a
    // "no budget set" notice instead of silently using a stale value.
    const forecastFiscalYear = monthRange[0]?.getUTCFullYear() ?? new Date().getUTCFullYear();
    const { data: fiscalYearBudget } = useInitialBudget(forecastFiscalYear);
    const hasFiscalYearBudget = fiscalYearBudget !== undefined;

    const selectedRanks = useMemo(
        () => RANK_SCOPE_OPTIONS.find((option) => option.value === rankScope)?.ranks ?? ['S'],
        [rankScope]
    );

    const contractByDealId = useMemo(
        () => new Map(store.contracts.map((contract) => [contract.dealId, contract])),
        [store.contracts]
    );

    const projectByContractId = useMemo(
        () => new Map(store.projects.map((project) => [project.contractId, project])),
        [store.projects]
    );

    const forecastSources = useMemo<ForecastSource[]>(() => {
        return store.deals
            .map((deal) => {
                const rank = dealRank(deal);
                if (rank !== 'S' && rank !== 'A' && rank !== 'B') return null;
                if (!selectedRanks.includes(rank)) return null;
                if (deal.lifecycleStatus === 'dropped' || deal.status === 'lost') return null;

                const contract = contractByDealId.get(deal.id);
                const project = contract ? projectByContractId.get(contract.id) : undefined;
                const incomeBudget = projectedDealValue(deal, contract);
                const timelineMonths = Math.max(1, deal.finalContractMonths ?? deal.timelineMonths ?? 6);

                if (incomeBudget <= 0) return null;

                return {
                    id: deal.id,
                    name: project?.name ?? deal.name,
                    rank,
                    probability: STAGE_PROBABILITY[deal.status as keyof typeof STAGE_PROBABILITY] ?? 100,
                    incomeBudget,
                    timelineMonths,
                    activeStart: forecastStartDate(deal, contract, project, monthRange[0]),
                };
            })
            .filter((source): source is ForecastSource => source !== null);
    }, [store.deals, selectedRanks, contractByDealId, projectByContractId, monthRange]);

    const chartData = useMemo<ForecastPoint[]>(() => {
        const rows = monthRange.map((monthDate) => ({
            monthKey: toMonthKey(monthDate),
            monthLabel: monthDate.toLocaleString('default', { month: 'short', year: 'numeric', timeZone: 'UTC' }),
            income: 0,
            cost: 0,
            profit: 0,
        }));

        const rowMap = new Map(rows.map((row) => [row.monthKey, row]));
        const monthlyPayroll = store.employees
            .filter((employee) => employee.status === 'Active' || employee.status === 'On Leave')
            .reduce((sum, employee) => sum + positiveNumber(employee.monthlySalary), 0);
        const monthCosts = new Map(
            monthRange.map((monthDate) => {
                const month = monthDate.getUTCMonth() + 1;
                const year = monthDate.getUTCFullYear();
                const monthlyOverhead = store.globalOverheads
                    .filter((overhead) => !overhead.effectiveYear || (overhead.effectiveYear === year && overhead.effectiveMonth === month))
                    .reduce((sum, overhead) => sum + positiveNumber(overhead.monthlyCost), 0);
                return [toMonthKey(monthDate), monthlyPayroll + monthlyOverhead] as const;
            }),
        );

        for (const source of forecastSources) {
            const probabilityWeight = source.probability / 100;
            const monthlyIncome = (source.incomeBudget / source.timelineMonths) * probabilityWeight;
            const activeEnd = addUtcMonths(source.activeStart, source.timelineMonths - 1);

            for (const monthDate of monthRange) {
                if (monthDate < source.activeStart || monthDate > activeEnd) continue;
                const row = rowMap.get(toMonthKey(monthDate));
                if (!row) continue;

                row.income += monthlyIncome;
            }
        }

        return rows.map((row) => {
            const cost = monthCosts.get(row.monthKey) ?? monthlyPayroll;
            const profit = row.income - cost;

            return {
                ...row,
                cost,
                profit,
            };
        });
    }, [forecastSources, monthRange, store.employees, store.globalOverheads]);

    const totals = useMemo(() => {
        const income = chartData.reduce((sum, item) => sum + item.income, 0);
        const cost = chartData.reduce((sum, item) => sum + item.cost, 0);
        const profit = income - cost;
        // Year-scoped initial budget (process ①.3). Falls back to 0 — and a
        // missing-year notice in the UI — when no row has been declared for
        // the forecast fiscal year.
        const annualInitialBudget = positiveNumber(fiscalYearBudget?.amount) ?? 0;
        const comparisonMonth = monthRange[monthRange.length - 1] ?? startOfUtcMonth(new Date());
        const comparisonMonthNumber = comparisonMonth.getUTCMonth() + 1;
        const comparisonMonthLabel = comparisonMonth.toLocaleString('default', { month: 'long', year: 'numeric', timeZone: 'UTC' });
        const comparisonBudgetTarget = annualInitialBudget * (comparisonMonthNumber / 12);

        return {
            income,
            cost,
            profit,
            annualInitialBudget,
            comparisonMonthNumber,
            comparisonMonthLabel,
            comparisonBudgetTarget,
            variance: profit - comparisonBudgetTarget,
            budgetCoveragePercent: comparisonBudgetTarget > 0 ? (profit / comparisonBudgetTarget) * 100 : 0,
        };
    }, [chartData, monthRange, fiscalYearBudget]);

    const sourceCounts = useMemo(() => {
        return forecastSources.reduce<Record<ForecastRank, number>>(
            (counts, source) => ({ ...counts, [source.rank]: counts[source.rank] + 1 }),
            { S: 0, A: 0, B: 0 }
        );
    }, [forecastSources]);

    const analysis = useMemo(() => {
        const lowestProfit = chartData.length > 0 ? Math.min(...chartData.map((item) => item.profit)) : 0;
        if (lowestProfit < 0) {
            return {
                text: 'Critical: At least one forecast month goes into loss.',
                color: 'text-rose-600',
                bg: 'bg-rose-50 border-rose-200',
            };
        }
        if (lowestProfit < 20000) {
            return {
                text: 'Warning: Profit remains positive but margin is thin.',
                color: 'text-amber-600',
                bg: 'bg-amber-50 border-amber-200',
            };
        }
        return {
            text: `Healthy: ${forecastWindowLabel.toLowerCase()} outlook remains profitable.`,
            color: 'text-emerald-600',
            bg: 'bg-emerald-50 border-emerald-200',
        };
    }, [chartData, forecastWindowLabel]);

    const targetGap = useMemo(() => {
        if (totals.variance < 0) {
            return {
                label: 'Needed to Hit Target',
                amount: Math.abs(totals.variance),
                tone: 'text-rose-600',
                badge: 'Behind Target',
                badgeClassName: 'bg-rose-50 text-rose-700 border-rose-200',
                helperText: `More profit needed to reach the ${totals.comparisonMonthLabel} target.`,
            };
        }

        if (totals.variance > 0) {
            return {
                label: 'Above Target',
                amount: totals.variance,
                tone: 'text-emerald-600',
                badge: 'Ahead of Target',
                badgeClassName: 'bg-emerald-50 text-emerald-700 border-emerald-200',
                helperText: `Forecast profit is already above the ${totals.comparisonMonthLabel} target.`,
            };
        }

        return {
            label: 'On Target',
            amount: 0,
            tone: 'text-blue-600',
            badge: 'On Target',
            badgeClassName: 'bg-blue-50 text-blue-700 border-blue-200',
            helperText: `Forecast profit is exactly on the ${totals.comparisonMonthLabel} target.`,
        };
    }, [totals.comparisonMonthLabel, totals.variance]);

    const hasForecastData = chartData.length > 0;
    const hasIncomeSources = forecastSources.length > 0;
    const finalForecastMonth = chartData[chartData.length - 1];

    const trailingUtilization = useMemo(() => {
        const ninetyDaysAgoMs = Date.now() - 90 * 86_400_000;
        const approvedHours = store.timeEntries
            .filter((entry) => entry.status === 'Approved' && new Date(entry.date).getTime() >= ninetyDaysAgoMs)
            .reduce((sum, entry) => sum + entry.hours, 0);
        const activeEmployees = store.employees.filter((employee) => employee.status === 'Active');
        const monthlyWorkable = activeEmployees.reduce((sum, employee) => sum + (employee.workableHours || 160), 0);
        const workableOverPeriod = monthlyWorkable * 3;
        if (workableOverPeriod === 0) return 0;
        return (approvedHours / workableOverPeriod) * 100;
    }, [store.employees, store.timeEntries]);

    const avgHireCost = useMemo(() => {
        const activeSalaries = store.employees
            .filter((employee) => employee.status === 'Active' && employee.monthlySalary > 0)
            .map((employee) => employee.monthlySalary);
        return average(activeSalaries);
    }, [store.employees]);

    const pipelineTotals = useMemo(() => {
        const openDeals = store.deals.filter((deal) => deal.status !== 'won' && deal.status !== 'lost' && deal.lifecycleStatus !== 'dropped');
        const weightedOpenPipeline = openDeals.reduce((sum, deal) => {
            const value = projectedDealValue(deal, contractByDealId.get(deal.id));
            const probability = (deal.winProbability ?? STAGE_PROBABILITY[deal.status as keyof typeof STAGE_PROBABILITY] ?? 0) / 100;
            return sum + value * probability;
        }, 0);

        const overdueInvoices = store.invoices.filter((invoice) => {
            if (invoice.status === 'Paid' || invoice.status === 'Cancelled') return false;
            if (!invoice.dueDate) return false;
            const due = new Date(`${invoice.dueDate}T00:00:00Z`).getTime();
            const today = Date.now();
            return due < today;
        });

        const overdueValue = overdueInvoices.reduce((sum, invoice) => sum + invoiceTotal(invoice), 0);

        return {
            weightedOpenPipeline,
            overdueValue,
            overdueCount: overdueInvoices.length,
            openCount: openDeals.length,
        };
    }, [store.deals, store.invoices, contractByDealId]);

    const trailingRevenue = useMemo(() => {
        const monthsWithIncome = chartData.map((item) => item.income).filter((value) => value > 0);
        return average(monthsWithIncome.slice(0, 3));
    }, [chartData]);

    const trailingProfit = useMemo(() => {
        const monthsWithProfit = chartData.map((item) => item.profit).filter((value) => value !== 0);
        return average(monthsWithProfit.slice(0, 3));
    }, [chartData]);

    async function generateForecast() {
        const activeHeadcount = store.employees.filter((employee) => employee.status === 'Active').length;
        const comparisonMonthDate = monthRange[monthRange.length - 1] ?? new Date();
        const monthsRemainingInYear = Math.max(0, 12 - (comparisonMonthDate.getUTCMonth() + 1));

        const payload: AIForecastInput = {
            currency,
            currentMonth: monthRange[0].toLocaleString('default', { month: 'short', year: 'numeric', timeZone: 'UTC' }),
            forecastWindowLabel,
            forecastMonthCount: monthRange.length,
            rankScopeLabel: RANK_SCOPE_OPTIONS.find((option) => option.value === rankScope)?.label ?? 'S Project Only',
            regenerateCount: summaryAttempt,
            headcount: activeHeadcount,
            avgMonthlySalary: avgHireCost,
            trailingMonthlyRevenue: trailingRevenue,
            trailingMonthlyProfit: trailingProfit,
            forecastProfit: totals.profit,
            comparisonMonthLabel: totals.comparisonMonthLabel,
            comparisonBudgetTarget: totals.comparisonBudgetTarget,
            gapToComparisonTarget: totals.variance,
            annualInitialBudget: totals.annualInitialBudget,
            remainingToAnnualTarget: totals.annualInitialBudget - totals.profit,
            monthsRemainingInYear,
            monthlyForecast: chartData.map((row) => ({
                monthLabel: row.monthLabel,
                income: row.income,
                cost: row.cost,
                profit: row.profit,
            })),
            sourceCounts: {
                s: sourceCounts.S,
                a: sourceCounts.A,
                b: sourceCounts.B,
            },
            utilization: {
                actualPercent: trailingUtilization,
                targetPercent: 85,
            },
            pipeline: {
                totalWeightedValue: pipelineTotals.weightedOpenPipeline,
                slippingValue: 0,
                slippingCount: 0,
                totalCount: pipelineTotals.openCount,
            },
            invoices: {
                overdueValue: pipelineTotals.overdueValue,
                overdueCount: pipelineTotals.overdueCount,
                meanLateDays: currentTenant?.paymentDaysLate ?? 0,
            },
            previousSummary: prediction ? {
                summaryTitle: prediction.summaryTitle,
                reasoning: prediction.reasoning,
                recommendedActionTitles: prediction.recommendedActions.map((action) => action.title),
            } : null,
        };

        setIsLoading(true);
        try {
            const response = await fetch('/api/ai-forecast', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                    ...(activeTenantId ? { 'X-Tenant-ID': activeTenantId } : {}),
                },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({ error: 'AI forecast failed' }));
                toast.error(error.error || 'AI forecast failed');
                return;
            }

            const data = (await response.json()) as AIForecastResult;
            setPrediction(data);
            setSummaryAttempt((current) => current + 1);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'AI forecast failed');
        } finally {
            setIsLoading(false);
        }
    }

    return (
        <div className="p-6 space-y-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900">Profit Forecast to Year End</h1>
                    <p className="text-slate-500 mt-1">
                        Profit condition is calculated month by month from the current month through year end, then compared against the annual Initial Budget target that should be reached by {totals.comparisonMonthLabel}.
                    </p>
                </div>
                <div className="inline-flex rounded-md border border-slate-200 bg-white p-1 shadow-sm">
                    {RANK_SCOPE_OPTIONS.map((option) => (
                        <Button
                            key={option.value}
                            type="button"
                            size="sm"
                            variant={rankScope === option.value ? 'default' : 'ghost'}
                            className={rankScope === option.value ? 'bg-slate-900 text-white hover:bg-slate-800' : 'text-slate-600'}
                            onClick={() => {
                                setRankScope(option.value);
                                setPrediction(null);
                                setSummaryAttempt(0);
                            }}
                        >
                            {option.label}
                        </Button>
                    ))}
                </div>
            </div>

            {hasForecastData ? (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <Card className="shadow-sm border-slate-100 lg:col-span-1 bg-white text-slate-900">
                        <CardHeader className="pb-4 border-b border-slate-100">
                            <CardTitle className="flex items-center gap-2 text-lg text-slate-900">
                                <Sparkles className="h-5 w-5 text-blue-500" />
                                Forecast Scope
                            </CardTitle>
                            <CardDescription className="text-slate-500">
                                Cost uses all Active and On Leave employee payroll plus matching monthly overheads. Income comes from the selected project ranks.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6 pt-6">
                            {!hasIncomeSources && (
                                <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3">
                                    <p className="text-sm font-medium text-amber-800">No forecast income sources in this scope</p>
                                    <p className="mt-1 text-xs text-amber-700">
                                        Company cost still appears every month because payroll and overhead continue even when no selected project income is active.
                                    </p>
                                </div>
                            )}
                            <div className="grid grid-cols-3 gap-3">
                                {(['S', 'A', 'B'] as ForecastRank[]).map((rank) => (
                                    <div key={rank} className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                                        <p className="text-xs font-medium text-slate-500">Rank {rank}</p>
                                        <p className="mt-1 text-lg font-bold text-slate-900">{sourceCounts[rank]}</p>
                                    </div>
                                ))}
                            </div>

                            <div className={`p-4 rounded-lg border ${analysis.bg}`}>
                                <div className="flex items-start gap-3">
                                    <AlertTriangle className={`h-5 w-5 ${analysis.color} mt-0.5`} />
                                    <div>
                                        <h4 className={`text-sm font-bold ${analysis.color}`}>Profit Condition</h4>
                                        <p className={`text-sm mt-1 leading-snug ${analysis.color} opacity-90`}>{analysis.text}</p>
                                    </div>
                                </div>
                            </div>

                            <div className="rounded-md border border-slate-200 p-4">
                                <p className="text-xs font-semibold uppercase text-slate-500">Year-End Budget Comparison</p>
                                {!hasFiscalYearBudget && (
                                    <div className="mt-3 p-3 rounded-md border border-amber-200 bg-amber-50">
                                        <p className="text-sm font-medium text-amber-800">
                                            No budget set for {forecastFiscalYear}
                                        </p>
                                        <p className="text-xs text-amber-700 mt-1">
                                            Declare an Initial Budget for {forecastFiscalYear} on the
                                            Company Settings page (Organization → Company) to enable
                                            budget-vs-actual comparison for this forecast.
                                        </p>
                                    </div>
                                )}
                                <div className="mt-3 space-y-3 text-sm">
                                    <div className="flex justify-between gap-4">
                                        <span className="text-slate-500">Year End Expected Total Profit ({forecastFiscalYear})</span>
                                        <span className="font-semibold text-slate-900">
                                            {hasFiscalYearBudget ? formatMoney(totals.annualInitialBudget, currency) : '—'}
                                        </span>
                                    </div>
                                    <div className="flex justify-between gap-4">
                                        <span className="text-slate-500">{forecastWindowLabel} Forecast Profit</span>
                                        <span className={totals.profit < 0 ? 'font-semibold text-rose-600' : 'font-semibold text-emerald-600'}>
                                            {formatMoney(totals.profit, currency)}
                                        </span>
                                    </div>
                                    <div className="flex justify-between gap-4">
                                        <span className="text-slate-500">{targetGap.label}</span>
                                        <span className={`font-semibold ${targetGap.tone}`}>
                                            {formatMoney(targetGap.amount, currency)}
                                        </span>
                                    </div>
                                    <div className="flex justify-end">
                                        <Badge variant="outline" className={targetGap.badgeClassName}>
                                            {targetGap.badge}
                                        </Badge>
                                    </div>
                                </div>
                            </div>

                            <Button onClick={generateForecast} disabled={isLoading} className="w-full bg-blue-600 hover:bg-blue-700 text-white">
                                {isLoading ? (
                                    <>
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                        Generating Summary...
                                    </>
                                ) : (
                                    <>
                                        <Sparkles className="h-4 w-4 mr-2" />
                                        {prediction ? 'Regenerate Summary' : 'Generate Summary'}
                                    </>
                                )}
                            </Button>

                            {prediction ? (
                                <div className="space-y-3 text-sm">
                                    <div className="rounded-md border p-3 bg-slate-50">
                                        <p className="text-xs font-semibold text-slate-700 mb-1">AI Summary</p>
                                        <p className="text-sm font-semibold text-slate-900">{prediction.summaryTitle}</p>
                                        <p className="text-sm text-slate-600 mt-2">{prediction.reasoning}</p>
                                    </div>
                                    {prediction.recommendedActions.length > 0 && (
                                        <div className="rounded-md border p-3 bg-white">
                                            <p className="text-xs font-semibold text-slate-700 mb-2">Suggested Next Actions</p>
                                            <div className="space-y-3">
                                                {prediction.recommendedActions.map((action, index) => (
                                                    <div key={`${index}-${action.title}`} className="rounded-md border border-slate-200 p-3">
                                                        <div className="flex items-start justify-between gap-3">
                                                            <p className="text-sm font-semibold text-slate-900">{action.title}</p>
                                                            <Badge variant="outline" className={priorityBadgeClass(action.priority)}>
                                                                {action.priority}
                                                            </Badge>
                                                        </div>
                                                        <p className="mt-2 text-sm text-slate-600">{action.rationale}</p>
                                                        <p className="mt-2 text-xs text-slate-500">Expected impact: {action.expectedImpact}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    <div className="flex justify-between"><span>Utilization Drop</span><span className="font-semibold text-rose-600">{prediction.utilizationDrop}%</span></div>
                                    <div className="flex justify-between"><span>Delayed Deals</span><span className="font-semibold text-amber-600">{formatMoney(prediction.delayedDeals, currency)}</span></div>
                                    <div className="flex justify-between"><span>Recommended New Hires</span><span className="font-semibold text-blue-600">{prediction.newHires}</span></div>
                                    <div className="rounded-md border p-3 bg-slate-50">
                                        <p className="text-xs font-semibold text-slate-700 mb-1">Signal Notes</p>
                                        <div className="space-y-2 text-sm text-slate-600">
                                            <p>{prediction.signals.utilizationInsight}</p>
                                            <p>{prediction.signals.pipelineInsight}</p>
                                            <p>{prediction.signals.capacityInsight}</p>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <p className="text-sm text-slate-500">Click Generate Summary to get AI suggestions for improving the current-month-to-year-end forecast and reaching the year-end initial budget goal.</p>
                            )}
                        </CardContent>
                    </Card>

                    <div className="lg:col-span-2 space-y-6">
                        <Card className="shadow-sm border-slate-100">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-lg flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                    <span>Income, Cost and Profit (Full Fiscal Year — Jan to Dec)</span>
                                    {finalForecastMonth?.profit < 0 ? (
                                        <span className="text-rose-500 flex items-center gap-1 text-sm"><TrendingDown className="h-4 w-4" /> {totals.comparisonMonthLabel} Loss</span>
                                    ) : (
                                        <span className="text-emerald-500 flex items-center gap-1 text-sm"><TrendingUp className="h-4 w-4" /> {totals.comparisonMonthLabel} Profit</span>
                                    )}
                                </CardTitle>
                                <CardDescription>
                                    Income and cost share the left scale. Net profit uses its own right-side scale so positive months stay above zero and loss months drop below zero.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="pt-4 h-[420px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                                        <XAxis dataKey="monthLabel" axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 12 }} dy={10} />
                                        <YAxis
                                            yAxisId="flow"
                                            tickFormatter={(value) => formatMoneyShort(value, currency)}
                                            axisLine={false}
                                            tickLine={false}
                                            tick={{ fill: '#64748B', fontSize: 12 }}
                                            dx={-10}
                                            domain={[0, 'auto']}
                                        />
                                        <YAxis
                                            yAxisId="profit"
                                            orientation="right"
                                            tickFormatter={(value) => formatMoneyShort(value, currency)}
                                            axisLine={false}
                                            tickLine={false}
                                            tick={{ fill: '#64748B', fontSize: 12 }}
                                            domain={['auto', 'auto']}
                                        />
                                        <ReferenceLine yAxisId="profit" y={0} stroke="#CBD5E1" strokeDasharray="4 4" />
                                        <Tooltip content={<ForecastTooltipContent currency={currency} />} />
                                        <Legend
                                            wrapperStyle={{ paddingTop: '20px' }}
                                            content={() => (
                                                <div className="flex items-center justify-center gap-4 pt-5 text-sm">
                                                    <div className="flex items-center gap-2 text-amber-500">
                                                        <span className="h-0 w-4 border-t-2 border-amber-500" />
                                                        <span>Cost</span>
                                                    </div>
                                                    <div className="flex items-center gap-2 text-blue-600">
                                                        <span className="h-0 w-4 border-t-2 border-blue-600" />
                                                        <span>Income</span>
                                                    </div>
                                                    <div className="flex items-center gap-2 text-emerald-500">
                                                        <span className="h-0 w-4 border-t-2 border-emerald-500" />
                                                        <span>Profit</span>
                                                    </div>
                                                </div>
                                            )}
                                        />
                                        <Line yAxisId="flow" type="linear" name="Income" dataKey="income" stroke="#2563EB" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} />
                                        <Line yAxisId="flow" type="linear" name="Cost" dataKey="cost" stroke="#F59E0B" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} />
                                        <Line
                                            yAxisId="profit"
                                            type="linear"
                                            name="Profit"
                                            dataKey="profit"
                                            stroke="#10B981"
                                            strokeWidth={3}
                                            shape={ProfitLineShape}
                                            dot={ProfitDot}
                                            activeDot={false}
                                            legendType="line"
                                        />
                                    </LineChart>
                                </ResponsiveContainer>
                            </CardContent>
                        </Card>

                        <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
                            <Card className="h-full min-h-[176px] shadow-sm border-slate-100">
                                <CardContent className="flex h-full flex-col p-5">
                                    <p className="min-h-[3.5rem] text-sm font-medium leading-7 text-slate-500">{forecastWindowLabel} Income</p>
                                    <span className="mt-auto block break-words text-[clamp(1.9rem,2vw,2.5rem)] font-bold leading-tight tracking-tight text-blue-600">
                                        {formatMoney(totals.income, currency)}
                                    </span>
                                </CardContent>
                            </Card>
                            <Card className="h-full min-h-[176px] shadow-sm border-slate-100">
                                <CardContent className="flex h-full flex-col p-5">
                                    <p className="min-h-[3.5rem] text-sm font-medium leading-7 text-slate-500">{forecastWindowLabel} Cost</p>
                                    <span className="mt-auto block break-words text-[clamp(1.9rem,2vw,2.5rem)] font-bold leading-tight tracking-tight text-slate-900">
                                        {formatMoney(totals.cost, currency)}
                                    </span>
                                </CardContent>
                            </Card>
                            <Card className="h-full min-h-[176px] shadow-sm border-slate-100">
                                <CardContent className="flex h-full flex-col p-5">
                                    <p className="min-h-[3.5rem] text-sm font-medium leading-7 text-slate-500">{forecastWindowLabel} Profit</p>
                                    <span className={`mt-auto block break-words text-[clamp(1.9rem,2vw,2.5rem)] font-bold leading-tight tracking-tight ${totals.profit < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                                        {formatMoney(totals.profit, currency)}
                                    </span>
                                </CardContent>
                            </Card>
                            <Card className="h-full min-h-[176px] shadow-sm border-slate-100">
                                <CardContent className="flex h-full flex-col p-5">
                                    <p className="min-h-[3.5rem] text-sm font-medium leading-7 text-slate-500">Year End Expected Total Profit ({forecastFiscalYear})</p>
                                    {hasFiscalYearBudget ? (
                                        <span className="mt-auto block break-words text-[clamp(1.9rem,2vw,2.5rem)] font-bold leading-tight tracking-tight text-slate-900">
                                            {formatMoney(totals.annualInitialBudget, currency)}
                                        </span>
                                    ) : (
                                        <span className="mt-auto block text-sm leading-6 text-amber-700">Not set for {forecastFiscalYear}</span>
                                    )}
                                </CardContent>
                            </Card>
                            <Card className="h-full min-h-[176px] shadow-sm border-slate-100">
                                <CardContent className="flex h-full flex-col p-5">
                                    <p className="min-h-[3.5rem] text-sm font-medium leading-7 text-slate-500">{targetGap.label}</p>
                                    <span className={`mt-1 block break-words text-[clamp(1.9rem,2vw,2.5rem)] font-bold leading-tight tracking-tight ${targetGap.tone}`}>
                                        {formatMoney(targetGap.amount, currency)}
                                    </span>
                                    <span className="mt-auto block text-xs leading-6 text-slate-500">{targetGap.helperText}</span>
                                </CardContent>
                            </Card>
                        </div>

                        <Card className="shadow-sm border-slate-100">
                            <CardHeader className="pb-3">
                                <CardTitle className="text-lg flex items-center gap-2">
                                    <BarChart3 className="h-5 w-5 text-blue-500" />
                                    Forecast Profit vs Declared Budget Target
                                </CardTitle>
                                <CardDescription>
                                    Initial Budget is annual, so this comparison uses the amount that should be reached by {totals.comparisonMonthLabel}.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="p-0">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="pl-6">Metric</TableHead>
                                            <TableHead className="text-right">Amount</TableHead>
                                            <TableHead className="text-right">Condition</TableHead>
                                            <TableHead className="text-right pr-6">Coverage</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        <TableRow>
                                            <TableCell className="pl-6 font-medium text-slate-900">
                                                {forecastWindowLabel} Forecast Profit vs {totals.comparisonMonthLabel} Initial Budget Target
                                            </TableCell>
                                            <TableCell className={`text-right font-semibold ${targetGap.tone}`}>
                                                {formatMoney(targetGap.amount, currency)}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Badge variant="outline" className={targetGap.badgeClassName}>
                                                    {targetGap.badge}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right pr-6">
                                                {totals.budgetCoveragePercent.toFixed(1)}%
                                            </TableCell>
                                        </TableRow>
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>

                        <Card className="shadow-sm border-slate-100">
                            <CardHeader className="pb-3">
                                <CardTitle className="text-lg">Monthly Profit Condition</CardTitle>
                                <CardDescription>Monthly breakdown for the full fiscal year, Jan through Dec.</CardDescription>
                            </CardHeader>
                            <CardContent className="p-0">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="pl-6">Month</TableHead>
                                            <TableHead className="text-right">Cost</TableHead>
                                            <TableHead className="text-right">Profit</TableHead>
                                            <TableHead className="text-right pr-6">Condition</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {chartData.map((row) => (
                                            <TableRow key={row.monthKey}>
                                                <TableCell className="pl-6 font-medium text-slate-900">{row.monthLabel}</TableCell>
                                                <TableCell className="text-right text-rose-600">-{formatMoney(row.cost, currency)}</TableCell>
                                                <TableCell className={`text-right font-semibold ${row.profit < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                                                    {formatMoney(row.profit, currency)}
                                                </TableCell>
                                                <TableCell className="text-right pr-6">
                                                    <Badge
                                                        variant="outline"
                                                        className={row.profit < 0 ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}
                                                    >
                                                        {row.profit < 0 ? 'Loss' : 'Profit'}
                                                    </Badge>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
