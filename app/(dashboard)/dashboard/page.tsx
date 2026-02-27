"use client";

import { useEffect, useState } from "react";
import { useBusinessStore } from "@/store/businessStore";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, Legend
} from "recharts";
import { DollarSign, TrendingUp, Users, Activity } from "lucide-react";

export default function DashboardPage() {
    const [isMounted, setIsMounted] = useState(false);
    const deals = useBusinessStore((state) => state.deals);
    const companySettings = useBusinessStore((state) => state.companySettings);
    const getYearlyPnL = useBusinessStore((state) => state.getYearlyPnL);
    const getCapacityPool = useBusinessStore((state) => state.getCapacityPool);

    useEffect(() => {
        setIsMounted(true);
    }, []);

    if (!isMounted) return null;

    const { sureMoney, probableMoney, forecast } = getYearlyPnL();
    const capacityPool = getCapacityPool();

    // Color palette
    const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

    // Formatting utility
    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
    };

    // 1. Revenue Forecast Data (Waterfall-ish concept but using simple bar for now)
    const revenueData = [
        { name: "Sure Money", value: sureMoney, fill: "#00C49F" },
        { name: "Probable Money", value: probableMoney, fill: "#0088FE" },
        { name: "Fixed Costs", value: companySettings.yearlyFixedCost, fill: "#FF8042" },
    ];

    // 2. Capacity Usage Data
    const capacityData = capacityPool.map(pool => ({
        name: pool.role.toUpperCase(),
        total: pool.totalMonthlyHours,
        used: pool.hardBookedHours + pool.softBookedHours,
        hard: pool.hardBookedHours,
        soft: pool.softBookedHours,
    }));

    // Pie chart data for used capacity across roles
    const pieData = capacityPool.map(pool => ({
        name: pool.role.toUpperCase(),
        value: pool.hardBookedHours + pool.softBookedHours,
    })).filter(d => d.value > 0);

    // 3. Pipeline Deals Data
    const pipelineDeals = deals
        .filter(d => d.stage === "inquiry" || d.stage === "proposal")
        .map(d => ({
            name: d.name,
            weightedValue: d.estimatedGrossProfit * (d.probability / 100),
            rawProfit: d.estimatedGrossProfit,
        }))
        .sort((a, b) => b.weightedValue - a.weightedValue)
        .slice(0, 10); // Top 10

    return (
        <div className="container mx-auto p-6 max-w-7xl space-y-8">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Real-Time P&L Engine</h1>
                <p className="text-muted-foreground">Yearly forecast and capacity reporting.</p>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">Sure Money</CardTitle>
                        <DollarSign className="h-4 w-4 text-green-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatCurrency(sureMoney)}</div>
                        <p className="text-xs text-muted-foreground">100% Probability (Hard Booked)</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">Probable Money</CardTitle>
                        <Activity className="h-4 w-4 text-blue-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatCurrency(probableMoney)}</div>
                        <p className="text-xs text-muted-foreground">Probability Weighted Pipeline</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">Yearly Forecast (P&L)</CardTitle>
                        <TrendingUp className="h-4 w-4 text-purple-500" />
                    </CardHeader>
                    <CardContent>
                        <div className={`text-2xl font-bold ${forecast >= 0 ? "text-green-500" : "text-red-500"}`}>
                            {formatCurrency(forecast)}
                        </div>
                        <p className="text-xs text-muted-foreground">Sure + Probable - Fixed Costs</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">Global Capacity</CardTitle>
                        <Users className="h-4 w-4 text-orange-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {capacityPool.reduce((acc, curr) => acc + curr.totalMonthlyHours, 0)}h
                        </div>
                        <p className="text-xs text-muted-foreground">Total Monthly Bookable Hours</p>
                    </CardContent>
                </Card>
            </div>

            {/* Charts Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                {/* Revenue Forecast Bar Chart */}
                <Card className="col-span-1">
                    <CardHeader>
                        <CardTitle>Financial Drivers</CardTitle>
                        <CardDescription>Breakdown of revenue streams and fixed costs</CardDescription>
                    </CardHeader>
                    <CardContent className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={revenueData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="name" />
                                <YAxis tickFormatter={(val) => `$${val / 1000}k`} />
                                <Tooltip formatter={(value: any) => formatCurrency(Number(value))} />
                                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                                    {revenueData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.fill} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>

                {/* Capacity Usage Pie Chart */}
                <Card className="col-span-1">
                    <CardHeader>
                        <CardTitle>Capacity Demand Distribution</CardTitle>
                        <CardDescription>Soft + Hard booked hours by role</CardDescription>
                    </CardHeader>
                    <CardContent className="h-[300px]">
                        {pieData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={pieData}
                                        cx="50%"
                                        cy="50%"
                                        labelLine={false}
                                        outerRadius={100}
                                        fill="#8884d8"
                                        dataKey="value"
                                        label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
                                    >
                                        {pieData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip formatter={(value: any) => `${Number(value).toFixed(1)}h`} />
                                </PieChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="flex h-full items-center justify-center text-muted-foreground">
                                No capacity booked yet.
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Pipeline Probability Weighted Value Chart */}
                <Card className="col-span-1 lg:col-span-2">
                    <CardHeader>
                        <CardTitle>Top Pipeline Deals (Weighted)</CardTitle>
                        <CardDescription>Estimated profit weighted by win probability</CardDescription>
                    </CardHeader>
                    <CardContent className="h-[350px]">
                        {pipelineDeals.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={pipelineDeals} layout="vertical" margin={{ top: 5, right: 30, left: 100, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                                    <XAxis type="number" tickFormatter={(val) => `$${val / 1000}k`} />
                                    <YAxis type="category" dataKey="name" width={150} />
                                    <Tooltip formatter={(value: any) => formatCurrency(Number(value))} />
                                    <Legend />
                                    <Bar name="Weighted Profit" dataKey="weightedValue" fill="#8884d8" radius={[0, 4, 4, 0]} />
                                    <Bar name="Raw Profit Output (100% Win)" dataKey="rawProfit" fill="#82ca9d" radius={[0, 4, 4, 0]} />
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
