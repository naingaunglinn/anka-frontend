'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { TrendingDown, TrendingUp, AlertTriangle, Sparkles, Loader2 } from 'lucide-react';
import { useBusinessStore, type BusinessState } from '@/store/businessStore';
import { useTenantStore, type Currency } from '@/store/tenantStore';
import { useAuthStore } from '@/store/authStore';
import { formatMoney, formatMoneyShort } from '@/lib/currency';
import { useOrganizationSync } from '@/hooks/useOrganizationSync';
import { useInvoiceList } from '@/lib/queries/invoices';
import { useTimeEntryList } from '@/lib/queries/timeEntries';
import { useDealList } from '@/lib/queries/deals';
import { useContractList } from '@/lib/queries/contracts';
import type { AIForecastInput, AIForecastResult } from '@/app/api/ai-forecast/route';
import toast from 'react-hot-toast';

const FORECAST_MONTHS = 6;
const UTILIZATION_TARGET = 85;

type PnlRow = ReturnType<BusinessState['getFinancialPnL']>[number];

function monthKey(date: Date): string {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(date: Date): string {
    return date.toLocaleString('default', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function parseMonthLabel(label: string): Date {
    return new Date(`${label} 01 UTC`);
}

function addUtcMonths(date: Date, count: number): Date {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + count, 1));
}

function invoiceTotal(invoice: { total?: number; amount: number; tax: number }): number {
    return invoice.total ?? (invoice.amount + invoice.tax);
}

function average(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function overheadForMonth(
    overheads: BusinessState['globalOverheads'],
    date: Date,
): number {
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1;

    return overheads
        .filter((oh) => {
            if (!oh.effectiveYear) return true;
            return oh.effectiveYear === year && (!oh.effectiveMonth || oh.effectiveMonth === month);
        })
        .reduce((sum, oh) => sum + oh.monthlyCost, 0);
}

function firstForecastMonth(pnlData: PnlRow[]): Date {
    const currentMonth = new Date();
    const current = new Date(Date.UTC(currentMonth.getFullYear(), currentMonth.getMonth(), 1));
    if (pnlData.length === 0) return current;

    const latestActual = parseMonthLabel(pnlData[pnlData.length - 1].month);
    const nextAfterActual = addUtcMonths(latestActual, 1);
    return nextAfterActual > current ? nextAfterActual : current;
}

export default function ForecastPage() {
    const store = useBusinessStore();
    const { activeTenantId, currentTenant, tenants } = useTenantStore();
    const token = useAuthStore((s) => s.token);
    const currency = (currentTenant?.currency as Currency) ?? tenants.find((t) => t.id === activeTenantId)?.currency ?? 'MMK';
    useOrganizationSync();
    useInvoiceList();
    useTimeEntryList();
    useDealList({ per_page: 500 });
    useContractList({ per_page: 200 });
    const pnlData = store.getFinancialPnL();

    const [prediction, setPrediction] = useState<AIForecastResult | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const forecastMonths = useMemo(
        () => Array.from({ length: FORECAST_MONTHS }, (_, i) => addUtcMonths(firstForecastMonth(pnlData), i)),
        [pnlData],
    );

    const avgMonthlyDirectLabor = useMemo(() => {
        const recent = pnlData.slice(-3).map((row) => row.directLabor).filter((value) => value > 0);
        return average(recent);
    }, [pnlData]);

    const avgHireCost = useMemo(() => {
        const activeSalaries = store.employees
            .filter((employee) => employee.status === 'Active' && employee.monthlySalary > 0)
            .map((employee) => employee.monthlySalary);
        return average(activeSalaries);
    }, [store.employees]);

    const deliveryLagMonths = currentTenant?.deliveryLagMonths ?? 1;
    const tenantPaymentLagDays = currentTenant?.paymentDaysLate ?? 0;

    const forecastInputs = useMemo(() => {
        const months = new Set(forecastMonths.map(monthKey));
        const invoiceRevenueByMonth: Record<string, number> = {};
        const contractBacklogByMonth: Record<string, number> = {};
        const pipelineRevenueByMonth: Record<string, number> = {};

        const contractById = new Map(store.contracts.map((c) => [c.id, c]));

        // Per-client AR lag from historical paid invoices: mean(paidAt - dueDate) in days.
        // Falls back to tenant default when a client has no paid history.
        const lagsByClient: Record<string, number[]> = {};
        store.invoices.forEach((inv) => {
            if (inv.status !== 'Paid' || !inv.paidAt || !inv.dueDate) return;
            const contract = contractById.get(inv.contractId);
            if (!contract) return;
            const due = new Date(`${inv.dueDate}T00:00:00Z`).getTime();
            // paid_at arrives as a full ISO datetime from Laravel — parse directly,
            // don't concatenate or we'd get "...ZT00:00:00Z" which evaluates to NaN.
            const paid = new Date(inv.paidAt).getTime();
            const lagDays = Math.max(0, (paid - due) / 86_400_000);
            if (!Number.isFinite(lagDays)) return;
            if (!lagsByClient[contract.client]) lagsByClient[contract.client] = [];
            lagsByClient[contract.client].push(lagDays);
        });
        const meanLagByClient: Record<string, number> = {};
        Object.keys(lagsByClient).forEach((client) => {
            meanLagByClient[client] = average(lagsByClient[client]);
        });
        const allLagDays = Object.values(lagsByClient).flat();
        const historicalMeanLateDays = average(allLagDays);

        store.invoices
            .filter((invoice) => invoice.status !== 'Paid' && invoice.status !== 'Cancelled')
            .forEach((invoice) => {
                const baseDate = new Date(`${invoice.dueDate ?? invoice.issueDate}T00:00:00Z`);
                const contract = contractById.get(invoice.contractId);
                const clientLag = contract && meanLagByClient[contract.client] !== undefined
                    ? meanLagByClient[contract.client]
                    : tenantPaymentLagDays;
                const cashDate = new Date(baseDate.getTime() + clientLag * 86_400_000);
                const key = monthKey(cashDate);
                if (months.has(key)) {
                    invoiceRevenueByMonth[key] = (invoiceRevenueByMonth[key] ?? 0) + invoiceTotal(invoice);
                }
            });

        const unpaidInvoiceByContract = store.invoices
            .filter((invoice) => invoice.status !== 'Paid' && invoice.status !== 'Cancelled')
            .reduce<Record<string, number>>((acc, invoice) => {
                acc[invoice.contractId] = (acc[invoice.contractId] ?? 0) + invoiceTotal(invoice);
                return acc;
            }, {});

        const activeContracts = store.contracts.filter((contract) =>
            contract.status === 'Draft' || contract.status === 'Active'
        );
        const unbilledBacklog = activeContracts.reduce((sum, contract) => {
            const remaining = contract.totalValue - contract.revenueRecognized - (unpaidInvoiceByContract[contract.id] ?? 0);
            return sum + Math.max(remaining, 0);
        }, 0);
        const monthlyBacklog = unbilledBacklog / FORECAST_MONTHS;
        forecastMonths.forEach((date) => {
            contractBacklogByMonth[monthKey(date)] = monthlyBacklog;
        });

        const today = new Date();
        const todayMs = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
        let slippingValue = 0;
        let slippingCount = 0;
        let openCount = 0;

        store.deals
            .filter((deal) => deal.status !== 'won' && deal.status !== 'lost')
            .forEach((deal) => {
                openCount += 1;
                if (!deal.expectedCloseDate) return;
                const closeDate = new Date(`${deal.expectedCloseDate}T00:00:00Z`);
                const dealValue = deal.clientBudget ?? deal.estimatedValue ?? 0;
                const probability = (deal.winProbability ?? 0) / 100;
                if (closeDate.getTime() < todayMs) {
                    slippingValue += dealValue * probability;
                    slippingCount += 1;
                }
                // Pipeline cash lands `deliveryLagMonths` after the deal closes,
                // not on the close date itself — agencies bill against milestones, not signature.
                const cashDate = addUtcMonths(closeDate, deliveryLagMonths);
                const key = monthKey(cashDate);
                if (!months.has(key)) return;
                pipelineRevenueByMonth[key] = (pipelineRevenueByMonth[key] ?? 0) + (dealValue * probability);
            });

        const pipelineTotal = Object.values(pipelineRevenueByMonth).reduce((sum, value) => sum + value, 0);
        const backlogTotal = unbilledBacklog;
        const unpaidInvoiceTotal = Object.values(invoiceRevenueByMonth).reduce((sum, value) => sum + value, 0);

        const overdueInvoices = store.invoices.filter((invoice) => {
            if (invoice.status === 'Paid' || invoice.status === 'Cancelled') return false;
            if (!invoice.dueDate) return false;
            return new Date(`${invoice.dueDate}T00:00:00Z`).getTime() < todayMs;
        });
        const overdueValue = overdueInvoices.reduce((sum, inv) => sum + invoiceTotal(inv), 0);

        return {
            invoiceRevenueByMonth,
            contractBacklogByMonth,
            pipelineRevenueByMonth,
            pipelineTotal,
            backlogTotal,
            unpaidInvoiceTotal,
            slippingValue,
            slippingCount,
            openCount,
            overdueValue,
            overdueCount: overdueInvoices.length,
            historicalMeanLateDays,
        };
    }, [forecastMonths, store.contracts, store.deals, store.invoices, deliveryLagMonths, tenantPaymentLagDays]);

    // Trailing utilization: approved hours over the last 90 days vs workable capacity
    const trailingUtilization = useMemo(() => {
        const ninetyDaysAgoMs = Date.now() - 90 * 86_400_000;
        const approvedHours = store.timeEntries
            .filter((entry) => entry.status === 'Approved' && new Date(entry.date).getTime() >= ninetyDaysAgoMs)
            .reduce((sum, entry) => sum + entry.hours, 0);
        const activeEmployees = store.employees.filter((e) => e.status === 'Active');
        const monthlyWorkable = activeEmployees.reduce((sum, e) => sum + (e.workableHours || 160), 0);
        const workableOverPeriod = monthlyWorkable * 3; // 90 days ≈ 3 months
        if (workableOverPeriod === 0) return 0;
        return (approvedHours / workableOverPeriod) * 100;
    }, [store.employees, store.timeEntries]);

    // Use AI predicted values when available; before the user clicks "Generate",
    // the projection equals the baseline (no shocks applied).
    const utilizationDrop = prediction?.utilizationDrop ?? 0;
    const delayedDeals = prediction?.delayedDeals ?? 0;
    const newHires = prediction?.newHires ?? 0;
    const effectiveDelayedDeals = Math.min(delayedDeals, forecastInputs.pipelineTotal);

    const chartData = useMemo(() => {
        const newHireCost = newHires * avgHireCost;
        const delayPerEarlyMonth = effectiveDelayedDeals / 3;
        const recoveryPerLateMonth = effectiveDelayedDeals / 3;

        return forecastMonths.map((date, i) => {
            const key = monthKey(date);
            const invoiceRevenue = forecastInputs.invoiceRevenueByMonth[key] ?? 0;
            const backlogRevenue = forecastInputs.contractBacklogByMonth[key] ?? 0;
            const pipelineRevenue = forecastInputs.pipelineRevenueByMonth[key] ?? 0;
            const expectedRevenue = invoiceRevenue + backlogRevenue + pipelineRevenue;
            const expectedCost = avgMonthlyDirectLabor + overheadForMonth(store.globalOverheads, date);
            const deliveryRevenue = invoiceRevenue + backlogRevenue;
            const utilizationPenalty = (utilizationDrop / 100) * deliveryRevenue;
            const delayPenalty = i < 3 ? Math.min(pipelineRevenue, delayPerEarlyMonth) : 0;
            const delayRecovery = i >= 3 ? recoveryPerLateMonth : 0;
            const projectedRevenue = Math.max(0, expectedRevenue - utilizationPenalty - delayPenalty + delayRecovery);
            const projectedCost = expectedCost + newHireCost;

            return {
                month: monthLabel(date),
                BaselineProfit: expectedRevenue - expectedCost,
                ProjectedProfit: projectedRevenue - projectedCost,
                ProjectedRevenue: projectedRevenue,
                ProjectedCost: projectedCost,
                ExpectedRevenue: expectedRevenue,
                PipelineRevenue: pipelineRevenue,
                ContractRevenue: invoiceRevenue + backlogRevenue,
                NewHireCost: newHireCost,
            };
        });
    }, [
        avgHireCost,
        avgMonthlyDirectLabor,
        effectiveDelayedDeals,
        forecastInputs,
        forecastMonths,
        newHires,
        store.globalOverheads,
        utilizationDrop,
    ]);

    // Financial Health Analysis
    const analysis = useMemo(() => {
        const lowestProfit = Math.min(...chartData.map(d => d.ProjectedProfit));
        const lowestMargin = Math.min(...chartData.map(d => d.ProjectedRevenue > 0 ? d.ProjectedProfit / d.ProjectedRevenue : -1));
        if (lowestProfit < 0) return { text: "Critical: Simulation shows negative cashflow.", color: "text-rose-600", bg: "bg-rose-50 border-rose-200" };
        if (lowestMargin < 0.1) return { text: "Warning: projected operating margin falls below 10%.", color: "text-amber-600", bg: "bg-amber-50 border-amber-200" };
        return { text: "Healthy: Operations remain profitable.", color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-200" };
    }, [chartData]);

    const trailingRevenue = useMemo(() => {
        const recent = pnlData.slice(-3).map((row) => row.revenue);
        return average(recent);
    }, [pnlData]);

    const trailingProfit = useMemo(() => {
        const recent = pnlData.slice(-3).map((row) => row.operatingProfit);
        return average(recent);
    }, [pnlData]);

    async function generateForecast() {
        const activeHeadcount = store.employees.filter((e) => e.status === 'Active').length;
        const payload: AIForecastInput = {
            currency,
            currentMonth: monthLabel(new Date(Date.UTC(new Date().getFullYear(), new Date().getMonth(), 1))),
            headcount: activeHeadcount,
            avgMonthlySalary: avgHireCost,
            trailingMonthlyRevenue: trailingRevenue,
            trailingMonthlyProfit: trailingProfit,
            utilization: {
                actualPercent: trailingUtilization,
                targetPercent: UTILIZATION_TARGET,
            },
            pipeline: {
                totalWeightedValue: forecastInputs.pipelineTotal,
                slippingValue: forecastInputs.slippingValue,
                slippingCount: forecastInputs.slippingCount,
                totalCount: forecastInputs.openCount,
            },
            invoices: {
                overdueValue: forecastInputs.overdueValue,
                overdueCount: forecastInputs.overdueCount,
                meanLateDays: forecastInputs.historicalMeanLateDays,
            },
        };

        setIsLoading(true);
        try {
            const res = await fetch('/api/ai-forecast', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                    ...(activeTenantId ? { 'X-Tenant-ID': activeTenantId } : {}),
                },
                body: JSON.stringify(payload),
            });

            if (!res.ok) {
                const error = await res.json().catch(() => ({ error: 'AI forecast failed' }));
                toast.error(error.error || 'AI forecast failed');
                return;
            }

            const data = (await res.json()) as AIForecastResult;
            setPrediction(data);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'AI forecast failed');
        } finally {
            setIsLoading(false);
        }
    }

    return (
        <div className="p-6 space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-[#171717]">Scenario Forecasting</h1>
                    <p className="text-[#8a8a8a] mt-1">AI-predicted stress test against your weighted pipeline, unpaid invoices, contract backlog, delivery costs, and overheads.</p>
                </div>
            </div>

            {pnlData.length === 0 ? (
                <Card className="shadow-sm border-[#e6e9ee]">
                    <CardContent className="p-12 text-center">
                        <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
                        <h3 className="text-lg font-semibold text-[#171717] mb-2">Insufficient Data</h3>
                        <p className="text-[#8a8a8a] max-w-md mx-auto">
                            No financial history found. Pay invoices and approve time entries to generate a cost baseline, then add open deals or contract invoices to forecast revenue.
                        </p>
                    </CardContent>
                </Card>
            ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* AI Forecast Panel */}
                <Card className="shadow-sm border-[#e6e9ee] lg:col-span-1 bg-white text-[#171717]">
                    <CardHeader className="pb-4 border-b border-[#e6e9ee]">
                        <CardTitle className="flex items-center gap-2 text-lg text-[#171717]">
                            <Sparkles className="h-5 w-5 text-[#00a7f4]" />
                            AI Forecast
                        </CardTitle>
                        <CardDescription className="text-[#8a8a8a]">
                            Reviews your live pipeline, utilization, and invoice aging to predict the next 6 months.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6 pt-6">
                        <Button
                            onClick={generateForecast}
                            disabled={isLoading}
                            className="w-full bg-[#00a7f4] hover:bg-[#0086c4] text-white"
                        >
                            {isLoading ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Analyzing…
                                </>
                            ) : (
                                <>
                                    <Sparkles className="h-4 w-4 mr-2" />
                                    {prediction ? 'Regenerate Forecast' : 'Generate Forecast'}
                                </>
                            )}
                        </Button>

                        {prediction ? (
                            <>
                                <div className="space-y-4">
                                    <div className="flex justify-between items-center pb-3 border-b border-[#e6e9ee]">
                                        <span className="text-sm font-medium text-[#4a4a4a]">Utilization Drop</span>
                                        <span className="text-sm font-bold text-rose-500">{prediction.utilizationDrop}%</span>
                                    </div>
                                    <p className="text-xs text-[#8a8a8a] -mt-3">{prediction.signals.utilizationInsight}</p>

                                    <div className="flex justify-between items-center pb-3 border-b border-[#e6e9ee]">
                                        <span className="text-sm font-medium text-[#4a4a4a]">Delayed Pipeline</span>
                                        <span className="text-sm font-bold text-amber-600">{formatMoney(prediction.delayedDeals, currency)}</span>
                                    </div>
                                    <p className="text-xs text-[#8a8a8a] -mt-3">{prediction.signals.pipelineInsight}</p>

                                    <div className="flex justify-between items-center pb-3 border-b border-[#e6e9ee]">
                                        <span className="text-sm font-medium text-[#4a4a4a]">Recommended New Hires</span>
                                        <span className="text-sm font-bold text-[#00a7f4]">{prediction.newHires} Staff</span>
                                    </div>
                                    <p className="text-xs text-[#8a8a8a] -mt-3">{prediction.signals.capacityInsight}</p>
                                </div>

                                <div className="p-4 rounded-lg border border-[#e6e9ee] bg-slate-50">
                                    <h4 className="text-xs font-bold uppercase tracking-wider text-[#4a4a4a] mb-2">AI Reasoning</h4>
                                    <p className="text-sm leading-snug text-[#171717]">{prediction.reasoning}</p>
                                </div>

                                <div className={`p-4 rounded-lg border ${analysis.bg} shadow-inner`}>
                                    <div className="flex items-start gap-3">
                                        <AlertTriangle className={`h-5 w-5 ${analysis.color} mt-0.5`} />
                                        <div>
                                            <h4 className={`text-sm font-bold ${analysis.color}`}>Impact Summary</h4>
                                            <p className={`text-sm mt-1 leading-snug ${analysis.color} opacity-90`}>{analysis.text}</p>
                                        </div>
                                    </div>
                                </div>
                            </>
                        ) : (
                            <div className="p-4 rounded-lg border border-dashed border-[#e6e9ee] bg-slate-50 space-y-4">
                                <p className="text-sm text-[#8a8a8a] text-center">
                                    Click <span className="font-semibold text-[#171717]">Generate Forecast</span> to analyze the business signals below and predict the next 6 months.
                                </p>

                                <div className="border-t border-[#e6e9ee] pt-4 space-y-2">
                                    <h4 className="text-xs font-bold uppercase tracking-wider text-[#4a4a4a] mb-3">
                                        Signals Used For Prediction
                                    </h4>
                                    <div className="text-xs space-y-1.5">
                                        <div className="flex justify-between">
                                            <span className="text-[#8a8a8a]">Active Headcount</span>
                                            <span className="font-medium text-[#171717]">
                                                {store.employees.filter((e) => e.status === 'Active').length}
                                            </span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-[#8a8a8a]">Avg Monthly Salary</span>
                                            <span className="font-medium text-[#171717]">{formatMoney(avgHireCost, currency)}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-[#8a8a8a]">Trailing 3-mo Revenue</span>
                                            <span className="font-medium text-[#171717]">{formatMoney(trailingRevenue, currency)}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-[#8a8a8a]">Trailing 3-mo Op. Profit</span>
                                            <span className="font-medium text-[#171717]">{formatMoney(trailingProfit, currency)}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-[#8a8a8a]">Utilization (actual / target)</span>
                                            <span className="font-medium text-[#171717]">
                                                {trailingUtilization.toFixed(0)}% / {UTILIZATION_TARGET}%
                                            </span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-[#8a8a8a]">Weighted Open Pipeline</span>
                                            <span className="font-medium text-[#171717]">{formatMoney(forecastInputs.pipelineTotal, currency)}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-[#8a8a8a]">Slipping Deals</span>
                                            <span className="font-medium text-[#171717]">
                                                {formatMoney(forecastInputs.slippingValue, currency)} ({forecastInputs.slippingCount}/{forecastInputs.openCount})
                                            </span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-[#8a8a8a]">Overdue Invoices</span>
                                            <span className="font-medium text-[#171717]">
                                                {formatMoney(forecastInputs.overdueValue, currency)} ({forecastInputs.overdueCount})
                                            </span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-[#8a8a8a]">Mean Payment Lateness</span>
                                            <span className="font-medium text-[#171717]">
                                                {forecastInputs.historicalMeanLateDays.toFixed(1)} days
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                    </CardContent>
                </Card>

                {/* Charts Panel */}
                <div className="lg:col-span-2 space-y-6">
                    <Card className="shadow-sm border-[#e6e9ee]">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-lg flex justify-between">
                                6-Month Business Flow Projection
                                {chartData[5].ProjectedProfit < 0
                                    ? <span className="text-rose-500 flex items-center gap-1 text-sm"><TrendingDown className="h-4 w-4" /> In the red</span>
                                    : <span className="text-emerald-500 flex items-center gap-1 text-sm"><TrendingUp className="h-4 w-4" /> Profitable</span>
                                }
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-4 h-[400px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                                    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 12 }} dy={10} />
                                    <YAxis
                                        tickFormatter={(value) => formatMoneyShort(value, currency)}
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fill: '#64748B', fontSize: 12 }}
                                        dx={-10}
                                    />
                                    <Tooltip
                                        formatter={(value: any) => [formatMoney(Number(value), currency), undefined]}
                                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                    />
                                    <Legend wrapperStyle={{ paddingTop: '20px' }} />

                                    <Line
                                        type="monotone"
                                        name={prediction ? "Projected Profit (AI Stressed)" : "Projected Profit (Baseline)"}
                                        dataKey="ProjectedProfit"
                                        stroke="#F43F5E"
                                        strokeWidth={3}
                                        dot={{ r: 4, strokeWidth: 2 }}
                                        activeDot={{ r: 6 }}
                                    />
                                    <Line
                                        type="monotone"
                                        name="Baseline Profit (Expected)"
                                        dataKey="BaselineProfit"
                                        stroke="#10B981"
                                        strokeWidth={2}
                                        strokeDasharray="5 5"
                                        dot={false}
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>

                    <div className="grid grid-cols-2 gap-6">
                        <Card className="shadow-sm border-[#e6e9ee]">
                            <CardContent className="p-6">
                                <p className="text-sm font-medium text-[#8a8a8a]">M6 Stressed Revenue</p>
                                <span className="text-2xl font-bold tracking-tight text-[#171717] block mt-2">
                                    {formatMoney(chartData[5].ProjectedRevenue, currency)}
                                </span>
                            </CardContent>
                        </Card>
                        <Card className="shadow-sm border-[#e6e9ee]">
                            <CardContent className="p-6">
                                <p className="text-sm font-medium text-[#8a8a8a]">M6 Delivery Costs</p>
                                <span className="text-2xl font-bold tracking-tight text-[#171717] block mt-2">
                                    {formatMoney(chartData[5].ProjectedCost, currency)}
                                </span>
                            </CardContent>
                        </Card>
                    </div>

                    <div className="grid grid-cols-3 gap-6">
                        <Card className="shadow-sm border-[#e6e9ee]">
                            <CardContent className="p-6">
                                <p className="text-sm font-medium text-[#8a8a8a]">Unpaid Invoice Schedule</p>
                                <span className="text-xl font-bold tracking-tight text-[#171717] block mt-2">
                                    {formatMoney(forecastInputs.unpaidInvoiceTotal, currency)}
                                </span>
                            </CardContent>
                        </Card>
                        <Card className="shadow-sm border-[#e6e9ee]">
                            <CardContent className="p-6">
                                <p className="text-sm font-medium text-[#8a8a8a]">Unbilled Contract Backlog</p>
                                <span className="text-xl font-bold tracking-tight text-[#171717] block mt-2">
                                    {formatMoney(forecastInputs.backlogTotal, currency)}
                                </span>
                            </CardContent>
                        </Card>
                        <Card className="shadow-sm border-[#e6e9ee]">
                            <CardContent className="p-6">
                                <p className="text-sm font-medium text-[#8a8a8a]">Weighted Open Pipeline</p>
                                <span className="text-xl font-bold tracking-tight text-[#171717] block mt-2">
                                    {formatMoney(forecastInputs.pipelineTotal, currency)}
                                </span>
                            </CardContent>
                        </Card>
                    </div>

                </div>
            </div>
            )}
        </div>
    );
}
