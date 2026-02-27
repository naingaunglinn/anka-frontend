'use client';

import { useEffect, useState, useMemo } from "react";
import { useBusinessStore } from "@/store/businessStore";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    Legend
} from "recharts";
import { DollarSign, TrendingUp, Briefcase, Activity } from "lucide-react";

export default function DashboardPage() {
    const [isMounted, setIsMounted] = useState(false);
    const store = useBusinessStore();

    useEffect(() => {
        setIsMounted(true);
    }, []);

    const pnlData = useMemo(() => store.getFinancialPnL(), [store]);

    // Summary Metrics
    const { totalRev, totalProfit } = useMemo(() => {
        let rev = 0;
        let profit = 0;
        pnlData.forEach(m => {
            rev += m.revenue;
            profit += m.operatingProfit;
        });
        return { totalRev: rev, totalProfit: profit };
    }, [pnlData]);

    const activeProjectsCount = store.projects.filter(p => p.status === 'On Track' || p.status === 'At Risk' || p.status === 'Over Budget').length;

    // Pipeline Deals
    const pipelineDeals = store.deals
        .filter(d => d.columnId !== 'won' && d.columnId !== 'lost')
        .map(d => ({
            name: d.name,
            weightedValue: (d.estimatedValue || 0) * ((d.winProbability || 0) / 100),
            rawTarget: d.estimatedValue || 0,
        }))
        .sort((a, b) => b.weightedValue - a.weightedValue)
        .slice(0, 10);

    if (!isMounted) return null;

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
    };

    return (
        <div className="container mx-auto p-6 max-w-7xl space-y-8">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Agency Global Dashboard</h1>
                <p className="text-muted-foreground">High-level overview of revenue, pipeline, and active projects.</p>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">Total Revenue (YTD)</CardTitle>
                        <DollarSign className="h-4 w-4 text-emerald-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatCurrency(totalRev)}</div>
                        <p className="text-xs text-muted-foreground">Recognized from Paid Invoices</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">Operating Profit (YTD)</CardTitle>
                        <TrendingUp className="h-4 w-4 text-blue-500" />
                    </CardHeader>
                    <CardContent>
                        <div className={`text-2xl font-bold ${totalProfit >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                            {formatCurrency(totalProfit)}
                        </div>
                        <p className="text-xs text-muted-foreground">EBITDA after all costs</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">Active Pipeline Value</CardTitle>
                        <Activity className="h-4 w-4 text-purple-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {formatCurrency(store.deals.reduce((sum, d) => d.columnId !== 'won' && d.columnId !== 'lost' ? sum + (d.estimatedValue || d.clientBudget || 0) : sum, 0))}
                        </div>
                        <p className="text-xs text-muted-foreground">Total un-won deal targets</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">Active Projects</CardTitle>
                        <Briefcase className="h-4 w-4 text-amber-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{activeProjectsCount}</div>
                        <p className="text-xs text-muted-foreground">Projects currently in delivery</p>
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
                                    <YAxis tickFormatter={(val) => `$${val / 1000}k`} />
                                    <Tooltip formatter={(value: any) => formatCurrency(Number(value))} />
                                    <Legend />
                                    <Bar name="Revenue" dataKey="revenue" fill="#10B981" radius={[4, 4, 0, 0]} />
                                    <Bar name="Op. Profit" dataKey="operatingProfit" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="flex h-full items-center justify-center text-muted-foreground">
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
                                    <XAxis type="number" tickFormatter={(val) => `$${val / 1000}k`} />
                                    <YAxis type="category" dataKey="name" width={120} />
                                    <Tooltip formatter={(value: any) => formatCurrency(Number(value))} />
                                    <Legend />
                                    <Bar name="Weighted Value" dataKey="weightedValue" fill="#8B5CF6" radius={[0, 4, 4, 0]} />
                                    <Bar name="Target Value (100% Win)" dataKey="rawTarget" fill="#E2E8F0" radius={[0, 4, 4, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="flex h-full items-center justify-center text-muted-foreground">
                                No active deals in pipeline.
                            </div>
                        )}
                    </CardContent>
                </Card>

            </div>
        </div>
    );
}
