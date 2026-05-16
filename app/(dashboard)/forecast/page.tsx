'use client';

import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Line, LineChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
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

type ForecastSource = {
    id: string;
    name: string;
    rank: ForecastRank;
    probability: number;
    incomeBudget: number;
    estimatedCost: number;
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

function estimatedDealCost(deal: Deal, incomeBudget: number): number {
    const explicitCost =
        positiveNumber(deal.totalEstimatedCost)
        || positiveNumber(deal.baseLaborCost) + positiveNumber(deal.overheadCost) + positiveNumber(deal.bufferCost);

    if (explicitCost > 0) return explicitCost;

    const targetMargin = positiveNumber(deal.targetMargin);
    if (targetMargin > 0 && targetMargin < 95 && incomeBudget > 0) {
        return incomeBudget * (1 - targetMargin / 100);
    }

    const estimatedGrossProfit = positiveNumber(deal.estimatedGrossProfit);
    if (estimatedGrossProfit > 0 && incomeBudget > estimatedGrossProfit) {
        return incomeBudget - estimatedGrossProfit;
    }

    return 0;
}

function forecastStartDate(deal: Deal, contract?: Contract, project?: Project, fallback?: Date): Date {
    const sourceDate = project?.startDate
        ?? project?.kickoffDate
        ?? contract?.startDate
        ?? deal.finalConfirmedAt
        ?? deal.expectedCloseDate;

    if (!sourceDate) return fallback ?? startOfUtcMonth(new Date());
    return startOfUtcMonth(new Date(sourceDate));
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

    const monthRange = useMemo(() => {
        const base = startOfUtcMonth(new Date());
        return Array.from({ length: 6 }, (_, index) => addUtcMonths(base, index));
    }, []);

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
                const estimatedCost = estimatedDealCost(deal, incomeBudget);
                const timelineMonths = Math.max(1, deal.finalContractMonths ?? deal.timelineMonths ?? 6);

                if (incomeBudget <= 0 && estimatedCost <= 0) return null;

                return {
                    id: deal.id,
                    name: project?.name ?? deal.name,
                    rank,
                    probability: STAGE_PROBABILITY[deal.status as keyof typeof STAGE_PROBABILITY] ?? 100,
                    incomeBudget,
                    estimatedCost,
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

        for (const source of forecastSources) {
            const probabilityWeight = source.probability / 100;
            const monthlyIncome = (source.incomeBudget / source.timelineMonths) * probabilityWeight;
            const monthlyEstimatedCost = (source.estimatedCost / source.timelineMonths) * probabilityWeight;
            const activeEnd = addUtcMonths(source.activeStart, source.timelineMonths - 1);

            for (const monthDate of monthRange) {
                if (monthDate < source.activeStart || monthDate > activeEnd) continue;
                const row = rowMap.get(toMonthKey(monthDate));
                if (!row) continue;

                row.income += monthlyIncome;
                row.cost += monthlyEstimatedCost;
            }
        }

        return rows.map((row) => ({
            ...row,
            profit: row.income - row.cost,
        }));
    }, [monthRange, forecastSources]);

    const totals = useMemo(() => {
        const income = chartData.reduce((sum, item) => sum + item.income, 0);
        const cost = chartData.reduce((sum, item) => sum + item.cost, 0);
        const profit = income - cost;
        const annualInitialBudget = positiveNumber(store.companySettings.annualInitialBudget) || 1_000_000_000;
        const halfYearInitialBudget = annualInitialBudget / 2;

        return {
            income,
            cost,
            profit,
            annualInitialBudget,
            halfYearInitialBudget,
            variance: profit - halfYearInitialBudget,
            budgetCoveragePercent: halfYearInitialBudget > 0 ? (profit / halfYearInitialBudget) * 100 : 0,
        };
    }, [chartData, store.companySettings.annualInitialBudget]);

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
            text: 'Healthy: 6-month outlook remains profitable.',
            color: 'text-emerald-600',
            bg: 'bg-emerald-50 border-emerald-200',
        };
    }, [chartData]);

    const budgetComparison = useMemo(() => {
        if (totals.profit < 0) {
            return {
                label: 'Below 6M Plan',
                className: 'bg-rose-50 text-rose-700 border-rose-200',
            };
        }
        if (totals.variance < 0) {
            return {
                label: 'Under 6M Budget',
                className: 'bg-amber-50 text-amber-700 border-amber-200',
            };
        }
        return {
            label: 'Above 6M Budget',
            className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        };
    }, [totals.profit, totals.variance]);

    const hasForecastData = forecastSources.length > 0;
    const monthSix = chartData[5];

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

        const payload: AIForecastInput = {
            currency,
            currentMonth: monthRange[0].toLocaleString('default', { month: 'short', year: 'numeric', timeZone: 'UTC' }),
            headcount: activeHeadcount,
            avgMonthlySalary: avgHireCost,
            trailingMonthlyRevenue: trailingRevenue,
            trailingMonthlyProfit: trailingProfit,
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
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900">6-Month Profit Forecast</h1>
                    <p className="text-slate-500 mt-1">
                        Profit condition is calculated month by month, then compared against the declared 6-month budget plan.
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
                            onClick={() => setRankScope(option.value)}
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
                                Annual Initial Budget is stored in company settings and currently defaults to 1 billion.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6 pt-6">
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
                                <p className="text-xs font-semibold uppercase text-slate-500">6-Month Budget Comparison</p>
                                <div className="mt-3 space-y-3 text-sm">
                                    <div className="flex justify-between gap-4">
                                        <span className="text-slate-500">Annual Initial Budget</span>
                                        <span className="font-semibold text-slate-900">{formatMoney(totals.annualInitialBudget, currency)}</span>
                                    </div>
                                    <div className="flex justify-between gap-4">
                                        <span className="text-slate-500">6-Month Budget Plan</span>
                                        <span className="font-semibold text-slate-900">{formatMoney(totals.halfYearInitialBudget, currency)}</span>
                                    </div>
                                    <div className="flex justify-between gap-4">
                                        <span className="text-slate-500">6-Month Forecast Profit</span>
                                        <span className={totals.profit < 0 ? 'font-semibold text-rose-600' : 'font-semibold text-emerald-600'}>
                                            {formatMoney(totals.profit, currency)}
                                        </span>
                                    </div>
                                    <div className="flex justify-between gap-4">
                                        <span className="text-slate-500">Variance</span>
                                        <span className={totals.variance < 0 ? 'font-semibold text-rose-600' : 'font-semibold text-emerald-600'}>
                                            {formatMoney(totals.variance, currency)}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <Button onClick={generateForecast} disabled={isLoading} className="w-full bg-blue-600 hover:bg-blue-700 text-white">
                                {isLoading ? (
                                    <>
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                        Analyzing...
                                    </>
                                ) : (
                                    <>
                                        <Sparkles className="h-4 w-4 mr-2" />
                                        {prediction ? 'Regenerate Forecast' : 'Generate Forecast'}
                                    </>
                                )}
                            </Button>

                            {prediction ? (
                                <div className="space-y-3 text-sm">
                                    <div className="flex justify-between"><span>Utilization Drop</span><span className="font-semibold text-rose-600">{prediction.utilizationDrop}%</span></div>
                                    <div className="flex justify-between"><span>Delayed Deals</span><span className="font-semibold text-amber-600">{formatMoney(prediction.delayedDeals, currency)}</span></div>
                                    <div className="flex justify-between"><span>Recommended New Hires</span><span className="font-semibold text-blue-600">{prediction.newHires}</span></div>
                                    <div className="rounded-md border p-3 bg-slate-50">
                                        <p className="text-xs font-semibold text-slate-700 mb-1">AI Reasoning</p>
                                        <p className="text-sm text-slate-600">{prediction.reasoning}</p>
                                    </div>
                                </div>
                            ) : (
                                <p className="text-sm text-slate-500">Click Generate Forecast to get AI-generated recommendations.</p>
                            )}
                        </CardContent>
                    </Card>

                    <div className="lg:col-span-2 space-y-6">
                        <Card className="shadow-sm border-slate-100">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-lg flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                    <span>Cost and Profit (Next 6 Months)</span>
                                    {monthSix?.profit < 0 ? (
                                        <span className="text-rose-500 flex items-center gap-1 text-sm"><TrendingDown className="h-4 w-4" /> Month 6 Loss</span>
                                    ) : (
                                        <span className="text-emerald-500 flex items-center gap-1 text-sm"><TrendingUp className="h-4 w-4" /> Month 6 Profit</span>
                                    )}
                                </CardTitle>
                                <CardDescription>
                                    The graph shows only monthly cost and profit. Initial budget comparison is shown separately below using annual budget / 2.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="pt-4 h-[420px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                                        <XAxis dataKey="monthLabel" axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 12 }} dy={10} />
                                        <YAxis
                                            tickFormatter={(value) => formatMoneyShort(value, currency)}
                                            axisLine={false}
                                            tickLine={false}
                                            tick={{ fill: '#64748B', fontSize: 12 }}
                                            dx={-10}
                                        />
                                        <Tooltip
                                            formatter={(value) => [formatMoney(Number(value ?? 0), currency), undefined]}
                                            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                        />
                                        <Legend wrapperStyle={{ paddingTop: '20px' }} />
                                        <Line type="monotone" name="Cost" dataKey="cost" stroke="#F59E0B" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} />
                                        <Line type="monotone" name="Profit" dataKey="profit" stroke="#10B981" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} />
                                    </LineChart>
                                </ResponsiveContainer>
                            </CardContent>
                        </Card>

                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                            <Card className="shadow-sm border-slate-100">
                                <CardContent className="p-5">
                                    <p className="text-sm font-medium text-slate-500">6M Cost</p>
                                    <span className="text-2xl font-bold tracking-tight text-slate-900 block mt-2">{formatMoney(totals.cost, currency)}</span>
                                </CardContent>
                            </Card>
                            <Card className="shadow-sm border-slate-100">
                                <CardContent className="p-5">
                                    <p className="text-sm font-medium text-slate-500">6M Profit</p>
                                    <span className={`text-2xl font-bold tracking-tight block mt-2 ${totals.profit < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                                        {formatMoney(totals.profit, currency)}
                                    </span>
                                </CardContent>
                            </Card>
                            <Card className="shadow-sm border-slate-100">
                                <CardContent className="p-5">
                                    <p className="text-sm font-medium text-slate-500">Annual Initial Budget</p>
                                    <span className="text-2xl font-bold tracking-tight text-slate-900 block mt-2">{formatMoney(totals.annualInitialBudget, currency)}</span>
                                </CardContent>
                            </Card>
                            <Card className="shadow-sm border-slate-100">
                                <CardContent className="p-5">
                                    <p className="text-sm font-medium text-slate-500">6M Budget Plan</p>
                                    <span className="text-2xl font-bold tracking-tight text-slate-900 block mt-2">{formatMoney(totals.halfYearInitialBudget, currency)}</span>
                                </CardContent>
                            </Card>
                        </div>

                        <Card className="shadow-sm border-slate-100">
                            <CardHeader className="pb-3">
                                <CardTitle className="text-lg flex items-center gap-2">
                                    <BarChart3 className="h-5 w-5 text-blue-500" />
                                    6-Month Profit vs Declared Budget
                                </CardTitle>
                                <CardDescription>
                                    Initial Budget is annual, so this comparison uses 50% of it as the 6-month reference amount.
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
                                            <TableCell className="pl-6 font-medium text-slate-900">6-Month Forecast Profit vs 6-Month Initial Budget</TableCell>
                                            <TableCell className="text-right font-semibold text-slate-900">
                                                {formatMoney(totals.variance, currency)}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Badge variant="outline" className={budgetComparison.className}>
                                                    {budgetComparison.label}
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
                                <CardDescription>Monthly breakdown from current month to next 6 months.</CardDescription>
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
            ) : (
                <Card className="shadow-sm border-slate-100">
                    <CardContent className="p-12 text-center">
                        <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
                        <h3 className="text-lg font-semibold text-slate-900 mb-2">No Forecast Sources Found</h3>
                        <p className="text-slate-500 max-w-md mx-auto">
                            This scope needs at least one active S, A, or B rank deal with contract value or estimated cost data.
                        </p>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
