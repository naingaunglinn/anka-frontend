'use client';

import { useEffect, useState, useMemo } from "react";
import { useBusinessStore } from "@/store/businessStore";
import { useUIStore } from "@/store/uiStore";
import { useDealList } from "@/lib/queries/deals";
import { useProjectList } from "@/lib/queries/projects";
import { useInvoiceList } from "@/lib/queries/invoices";
import { useTimeEntryList } from "@/lib/queries/timeEntries";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    Legend
} from "recharts";
import { DollarSign, TrendingUp, Briefcase, Activity, Percent } from "lucide-react";
import { useTenantStore, type Currency } from "@/store/tenantStore";
import { formatMoney } from "@/lib/currency";

const demoPnlData = [
    { month: "Jan", revenue: 680000, operatingProfit: 182000 },
    { month: "Feb", revenue: 720000, operatingProfit: 205000 },
    { month: "Mar", revenue: 790000, operatingProfit: 233000 },
    { month: "Apr", revenue: 845000, operatingProfit: 262000 },
    { month: "May", revenue: 910000, operatingProfit: 289000 },
    { month: "Jun", revenue: 980000, operatingProfit: 321000 },
];

const demoPipelineDeals = [
    { name: "GlobalPay Rollout", weightedValue: 312000, rawTarget: 480000 },
    { name: "Skyline ERP Phase 2", weightedValue: 275000, rawTarget: 430000 },
    { name: "Vertex Billing Revamp", weightedValue: 232000, rawTarget: 350000 },
    { name: "Nova CRM Expansion", weightedValue: 184000, rawTarget: 300000 },
    { name: "Atlas Migration", weightedValue: 152000, rawTarget: 260000 },
];

export default function DashboardPage() {
    const [isMounted, setIsMounted] = useState(false);
    const isDemoMode = useUIStore((s) => s.isDemoMode);
    const store = useBusinessStore();
    const { activeTenantId, currentTenant, tenants } = useTenantStore();
    const currency = (currentTenant?.currency as Currency) ?? tenants.find((t) => t.id === activeTenantId)?.currency ?? 'MMK';

    // Keep hooks stable; demo mode swaps displayed data below.
    useDealList();
    useProjectList();
    useInvoiceList();
    useTimeEntryList();

    useEffect(() => {
        setIsMounted(true);
    }, []);

    const pnlData = useMemo(() => {
        if (isDemoMode) return demoPnlData;
        return store.getFinancialPnL();
    }, [isDemoMode, store]);

    // Summary Metrics
    const { totalRev, totalProfit, profitMargin } = useMemo(() => {
        let rev = 0;
        let profit = 0;
        pnlData.forEach(m => {
            rev += m.revenue;
            profit += m.operatingProfit;
        });
        const margin = rev > 0 ? (profit / rev) * 100 : 0;
        return { totalRev: rev, totalProfit: profit, profitMargin: margin };
    }, [pnlData]);

    const activeProjectsCount = isDemoMode
        ? 14
        : store.projects.filter(p => p.status === 'On Track' || p.status === 'At Risk' || p.status === 'Over Budget').length;

    // Pipeline Deals
    const pipelineDeals = isDemoMode
        ? demoPipelineDeals
        : store.deals
            .filter(d => d.status !== 'won' && d.status !== 'lost')
            .map(d => ({
                name: d.name,
                weightedValue: (d.estimatedValue || 0) * ((d.winProbability || 0) / 100),
                rawTarget: d.estimatedValue || 0,
            }))
            .sort((a, b) => b.weightedValue - a.weightedValue)
            .slice(0, 10);

    if (!isMounted) return null;



    return (
        <div className="container mx-auto p-6 max-w-7xl space-y-8">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
                <p className="text-[#4a4a4a]">
                    {isDemoMode
                        ? "Demo snapshot: sample gross-profit intelligence, pipeline, and recommendation signals."
                        : "High-level overview of revenue, pipeline, and active projects."}
                </p>
            </div>

            {isDemoMode && (
                <Card className="border-[#00a7f4]/25 bg-[#00a7f4]/5">
                    <CardContent className="pt-6">
                        <p className="text-sm text-[#0c4a6e]">
                            Demo Version is intentionally scoped. You can explore Dashboard insights with sample data, while edit actions
                            and advanced modules are hidden.
                        </p>
                    </CardContent>
                </Card>
            )}

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:grid-cols-5">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">Total Revenue (YTD)</CardTitle>
                        <DollarSign className="h-4 w-4 text-emerald-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatMoney(totalRev, currency)}</div>
                        <p className="text-xs text-[#4a4a4a]">Recognized from Paid Invoices</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">Operating Profit (YTD)</CardTitle>
                        <TrendingUp className="h-4 w-4 text-[#00a7f4]" />
                    </CardHeader>
                    <CardContent>
                        <div className={`text-2xl font-bold ${totalProfit >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                            {formatMoney(totalProfit, currency)}
                        </div>
                        <p className="text-xs text-[#4a4a4a]">EBITDA after all costs</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">Profit Margin</CardTitle>
                        <Percent className="h-4 w-4 text-[#00a7f4]" />
                    </CardHeader>
                    <CardContent>
                        <div className={`text-2xl font-bold ${profitMargin >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                            {profitMargin.toFixed(1)}%
                        </div>
                        <div className="mt-2 h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                            <div
                                className={`h-full rounded-full transition-all duration-500 ${profitMargin >= 30 ? 'bg-emerald-500' : profitMargin >= 15 ? 'bg-[#00a7f4]' : profitMargin >= 0 ? 'bg-amber-400' : 'bg-rose-500'}`}
                                style={{ width: `${Math.min(Math.max(profitMargin, 0), 100)}%` }}
                            />
                        </div>
                        <p className="text-xs text-[#4a4a4a] mt-1">
                            {profitMargin >= 30 ? 'Excellent' : profitMargin >= 15 ? 'Healthy' : profitMargin >= 0 ? 'Thin' : 'Loss'}
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">Active Pipeline Value</CardTitle>
                        <Activity className="h-4 w-4 text-purple-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {formatMoney(
                                isDemoMode
                                    ? 1820000
                                    : store.deals.reduce(
                                        (sum, d) => d.status !== 'won' && d.status !== 'lost' ? sum + (d.estimatedValue || d.clientBudget || 0) : sum,
                                        0
                                    ),
                                currency
                            )}
                        </div>
                        <p className="text-xs text-[#4a4a4a]">Total un-won deal targets</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">Active Projects</CardTitle>
                        <Briefcase className="h-4 w-4 text-amber-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{activeProjectsCount}</div>
                        <p className="text-xs text-[#4a4a4a]">Projects currently in delivery</p>
                    </CardContent>
                </Card>
            </div>

            {/* Charts Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                {/* Monthly P&L Chart */}
                <Card className="col-span-1">
                    <CardHeader>
                        <CardTitle>Monthly P&L Trend</CardTitle>
                        <CardDescription>Revenue vs Operating Profit</CardDescription>
                    </CardHeader>
                    <CardContent className="h-[350px]">
                        {pnlData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={pnlData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                    <XAxis dataKey="month" />
                                    <YAxis tickFormatter={(val) => formatMoney(Number(val), currency)} />
                                    <Tooltip formatter={(value: any) => formatMoney(Number(value), currency)} />
                                    <Legend />
                                    <Bar name="Revenue" dataKey="revenue" fill="#10B981" radius={[4, 4, 0, 0]} />
                                    <Bar name="Op. Profit" dataKey="operatingProfit" fill="#00a7f4" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="flex h-full items-center justify-center text-[#4a4a4a]">
                                No financial data. Add invoices and timesheets.
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Pipeline Probability Weighted Value Chart */}
                <Card className="col-span-1">
                    <CardHeader>
                        <CardTitle>Top Pipeline Deals (Weighted)</CardTitle>
                        <CardDescription>Target Value vs Probability Weighted Value</CardDescription>
                    </CardHeader>
                    <CardContent className="h-[350px]">
                        {pipelineDeals.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={pipelineDeals} layout="vertical" margin={{ top: 5, right: 30, left: 100, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                                    <XAxis type="number" tickFormatter={(val) => formatMoney(Number(val), currency)} />
                                    <YAxis type="category" dataKey="name" width={120} />
                                    <Tooltip formatter={(value: any) => formatMoney(Number(value), currency)} />
                                    <Legend />
                                    <Bar name="Weighted Value" dataKey="weightedValue" fill="#8B5CF6" radius={[0, 4, 4, 0]} />
                                    <Bar name="Target Value (100% Win)" dataKey="rawTarget" fill="#E2E8F0" radius={[0, 4, 4, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="flex h-full items-center justify-center text-[#4a4a4a]">
                                No active deals in pipeline.
                            </div>
                        )}
                    </CardContent>
                </Card>

            </div>
        </div>
    );
}
