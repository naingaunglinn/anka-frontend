'use client';

import { useState, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { TrendingDown, TrendingUp, AlertTriangle, Calculator } from 'lucide-react';
import { useBusinessStore } from '@/store/businessStore';
import { useTenantStore } from '@/store/tenantStore';
import { formatMoney, formatMoneyShort } from '@/lib/currency';
import { useOrganizationSync } from '@/hooks/useOrganizationSync';
import { useInvoiceList } from '@/lib/queries/invoices';
import { useTimeEntryList } from '@/lib/queries/timeEntries';

export default function ForecastPage() {
    const store = useBusinessStore();
    const { activeTenantId, tenants } = useTenantStore();
    const currency = tenants.find((t) => t.id === activeTenantId)?.currency ?? 'MMK';
    useOrganizationSync();
    useInvoiceList();
    useTimeEntryList();
    const pnlData = store.getFinancialPnL();

    // Simulation Parameters — use scalar numbers internally
    const [utilizationDrop, setUtilizationDrop] = useState(0);
    const [delayedDeals, setDelayedDeals] = useState(0);
    const [newHires, setNewHires] = useState(0);

    // Inline projection logic directly in useMemo to avoid stale closures
    const chartData = useMemo(() => {
        let baseRevenue = 0;
        let baseCosts = 0;

        if (pnlData.length > 0) {
            const lastMonth = pnlData[pnlData.length - 1];
            baseRevenue = lastMonth.revenue;
            baseCosts = lastMonth.directLabor + lastMonth.overhead;
        }

        const hireCost = newHires * 8000;
        const months = ['Month 1', 'Month 2', 'Month 3', 'Month 4', 'Month 5', 'Month 6'];
        const data = [];

        let currentRev = baseRevenue;
        let currentCost = baseCosts + hireCost;

        for (let i = 0; i < months.length; i++) {
            const revPenalty = (utilizationDrop / 100) * currentRev;
            const delayPenalty = i < 3 ? (delayedDeals / 3) : 0;

            const projectedRev = currentRev - revPenalty - delayPenalty;
            const projectedCost = currentCost;
            const projectedProfit = projectedRev - projectedCost;

            data.push({
                month: months[i],
                BaselineProfit: currentRev - currentCost,
                ProjectedProfit: projectedProfit,
                ProjectedRevenue: projectedRev,
                ProjectedCost: projectedCost,
            });

            currentRev *= 1.02;
        }

        return data;
    }, [utilizationDrop, delayedDeals, newHires, pnlData]);

    // Wrap slider handlers to extract scalar value from array
    const handleUtilizationChange = useCallback((val: number[]) => setUtilizationDrop(val[0] ?? 0), []);
    const handleDelayedDealsChange = useCallback((val: number[]) => setDelayedDeals(val[0] ?? 0), []);
    const handleNewHiresChange = useCallback((val: number[]) => setNewHires(val[0] ?? 0), []);

    // Financial Health Analysis
    const analysis = useMemo(() => {
        const lowestProfit = Math.min(...chartData.map(d => d.ProjectedProfit));
        if (lowestProfit < 0) return { text: "Critical: Simulation shows negative cashflow.", color: "text-rose-600", bg: "bg-rose-50 border-rose-200" };
        if (lowestProfit < 20000) return { text: "Warning: Margins become dangerously thin.", color: "text-amber-600", bg: "bg-amber-50 border-amber-200" };
        return { text: "Healthy: Operations remain profitable.", color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-200" };
    }, [chartData]);

    return (
        <div className="p-6 space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900">Scenario Forecasting</h1>
                    <p className="text-slate-500 mt-1">Stress-test your agency's finances against market shocks based on current real-time P&L baselines.</p>
                </div>
            </div>

            {pnlData.length === 0 ? (
                <Card className="shadow-sm border-slate-100">
                    <CardContent className="p-12 text-center">
                        <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
                        <h3 className="text-lg font-semibold text-slate-900 mb-2">Insufficient Data</h3>
                        <p className="text-slate-500 max-w-md mx-auto">
                            No financial history found. Log paid invoices and approved time entries to generate a forecast baseline.
                        </p>
                    </CardContent>
                </Card>
            ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* Simulation Controls Panel */}
                <Card className="shadow-sm border-slate-100 lg:col-span-1 bg-slate-900 text-white">
                    <CardHeader className="pb-4 border-b border-slate-800">
                        <CardTitle className="flex items-center gap-2 text-lg text-white">
                            <Calculator className="h-5 w-5 text-blue-400" />
                            Shock Variables
                        </CardTitle>
                        <CardDescription className="text-slate-400">Adjust parameters to simulate 6-month impact.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-8 pt-6">

                        <div className="space-y-4">
                            <div className="flex justify-between items-center">
                                <span className="text-sm font-medium text-slate-300">Utilization Drop (Bench Risk)</span>
                                <span className="text-sm font-bold text-rose-400">{utilizationDrop}%</span>
                            </div>
                            <Slider value={[utilizationDrop]} onValueChange={handleUtilizationChange} max={50} step={5} />
                            <p className="text-xs text-slate-500">Simulates clients pulling back, dropping billable hours.</p>
                        </div>

                        <div className="space-y-4">
                            <div className="flex justify-between items-center">
                                <span className="text-sm font-medium text-slate-300">Delayed Pipeline Deals</span>
                                <span className="text-sm font-bold text-amber-400">{formatMoney(delayedDeals, currency)}</span>
                            </div>
                            <Slider value={[delayedDeals]} onValueChange={handleDelayedDealsChange} max={300000} step={25000} />
                            <p className="text-xs text-slate-500">Revenue pushed out from current CRM pipeline.</p>
                        </div>

                        <div className="space-y-4 border-t border-slate-800 pt-6">
                            <div className="flex justify-between items-center">
                                <span className="text-sm font-medium text-slate-300">New Developer Hires</span>
                                <span className="text-sm font-bold text-blue-400">{newHires} Staff</span>
                            </div>
                            <Slider value={[newHires]} onValueChange={handleNewHiresChange} max={10} step={1} />
                            <p className="text-xs text-slate-500">Increases fixed salary costs independent of revenue.</p>
                        </div>

                        <div className={`mt-6 p-4 rounded-lg border ${analysis.bg} shadow-inner`}>
                            <div className="flex items-start gap-3">
                                <AlertTriangle className={`h-5 w-5 ${analysis.color} mt-0.5`} />
                                <div>
                                    <h4 className={`text-sm font-bold ${analysis.color}`}>Impact Summary</h4>
                                    <p className={`text-sm mt-1 leading-snug ${analysis.color} opacity-90`}>{analysis.text}</p>
                                </div>
                            </div>
                        </div>

                    </CardContent>
                </Card>

                {/* Charts Panel */}
                <div className="lg:col-span-2 space-y-6">
                    <Card className="shadow-sm border-slate-100">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-lg flex justify-between">
                                6-Month Profit Projection
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
                                        name="Projected Profit (Stressed)"
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
                        <Card className="shadow-sm border-slate-100">
                            <CardContent className="p-6">
                                <p className="text-sm font-medium text-slate-500">M6 Stressed Revenue</p>
                                <span className="text-2xl font-bold tracking-tight text-slate-900 block mt-2">
                                    {formatMoney(chartData[5].ProjectedRevenue, currency)}
                                </span>
                            </CardContent>
                        </Card>
                        <Card className="shadow-sm border-slate-100">
                            <CardContent className="p-6">
                                <p className="text-sm font-medium text-slate-500">M6 Fixed Costs</p>
                                <span className="text-2xl font-bold tracking-tight text-slate-900 block mt-2">
                                    {formatMoney(chartData[5].ProjectedCost, currency)}
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
