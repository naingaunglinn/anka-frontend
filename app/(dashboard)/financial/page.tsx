'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Download, TrendingUp } from 'lucide-react';
import { RevenueTrendChart } from '@/components/charts/DashboardCharts';

// Mock data for P&L
const mockPL = [
    { month: 'Jan', revenue: 120000, directLabor: 50000, overhead: 20000 },
    { month: 'Feb', revenue: 135000, directLabor: 52000, overhead: 20000 },
    { month: 'Mar', revenue: 150000, directLabor: 55000, overhead: 25000 },
    { month: 'Apr', revenue: 140000, directLabor: 55000, overhead: 25000 },
    { month: 'May', revenue: 160000, directLabor: 58000, overhead: 25000 },
    { month: 'Jun', revenue: 180000, directLabor: 60000, overhead: 30000 },
].map(item => {
    const grossProfit = item.revenue - item.directLabor;
    const operatingProfit = grossProfit - item.overhead;
    // Simplified tax simulation for Net Profit
    const netProfit = operatingProfit * 0.8;
    return { ...item, grossProfit, operatingProfit, netProfit };
});

export default function FinancialPage() {
    const handleExportCSV = () => {
        // Basic CSV Export implementation
        const headers = ['Month', 'Revenue', 'Direct Labor', 'Overhead', 'Gross Profit', 'Operating Profit', 'Net Profit'];
        const csvContent = "data:text/csv;charset=utf-8,"
            + headers.join(",") + "\n"
            + mockPL.map(row => {
                return `${row.month},${row.revenue},${row.directLabor},${row.overhead},${row.grossProfit},${row.operatingProfit},${row.netProfit}`;
            }).join("\n");

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "financial_pnl.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight text-slate-900">Financial Performance</h2>
                    <p className="text-muted-foreground mt-1">Review profitability margins, operating costs, and overall P&L.</p>
                </div>
                <Button onClick={handleExportCSV} className="bg-slate-900 gap-2">
                    <Download className="h-4 w-4" /> Export CSV
                </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="shadow-sm border-slate-100">
                    <CardHeader className="pb-2 flex flex-row items-center justify-between">
                        <CardTitle className="text-sm font-medium">YTD Revenue</CardTitle>
                        <TrendingUp className="h-4 w-4 text-slate-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            ${(mockPL.reduce((a, b) => a + b.revenue, 0) / 1000).toFixed(0)}k
                        </div>
                    </CardContent>
                </Card>
                <Card className="shadow-sm border-slate-100">
                    <CardHeader className="pb-2 flex flex-row items-center justify-between">
                        <CardTitle className="text-sm font-medium">YTD Gross Profit</CardTitle>
                        <TrendingUp className="h-4 w-4 text-emerald-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            ${(mockPL.reduce((a, b) => a + b.grossProfit, 0) / 1000).toFixed(0)}k
                        </div>
                    </CardContent>
                </Card>
                <Card className="shadow-sm border-slate-100">
                    <CardHeader className="pb-2 flex flex-row items-center justify-between">
                        <CardTitle className="text-sm font-medium">YTD Op Profit</CardTitle>
                        <TrendingUp className="h-4 w-4 text-blue-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            ${(mockPL.reduce((a, b) => a + b.operatingProfit, 0) / 1000).toFixed(0)}k
                        </div>
                    </CardContent>
                </Card>
                <Card className="shadow-sm border-slate-100 bg-slate-50">
                    <CardHeader className="pb-2 flex flex-row items-center justify-between">
                        <CardTitle className="text-sm font-medium">Average Margin</CardTitle>
                        <TrendingUp className="h-4 w-4 text-indigo-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {((mockPL.reduce((a, b) => a + b.grossProfit, 0) / mockPL.reduce((a, b) => a + b.revenue, 0)) * 100).toFixed(1)}%
                        </div>
                    </CardContent>
                </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card className="lg:col-span-2 shadow-sm border-slate-100">
                    <CardHeader>
                        <CardTitle>Profit & Loss Statement (Monthly)</CardTitle>
                        <CardDescription>Detailed breakdown of income and expenses.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Month</TableHead>
                                    <TableHead className="text-right">Revenue</TableHead>
                                    <TableHead className="text-right">Direct Labor</TableHead>
                                    <TableHead className="text-right">Gross Profit</TableHead>
                                    <TableHead className="text-right">Overhead</TableHead>
                                    <TableHead className="text-right">Op Profit</TableHead>
                                    <TableHead className="text-right font-bold text-slate-900">Net Profit</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {mockPL.map((row) => (
                                    <TableRow key={row.month}>
                                        <TableCell className="font-medium bg-slate-50/50">{row.month}</TableCell>
                                        <TableCell className="text-right text-emerald-600 font-medium">${row.revenue.toLocaleString()}</TableCell>
                                        <TableCell className="text-right text-rose-600">${row.directLabor.toLocaleString()}</TableCell>
                                        <TableCell className="text-right font-medium">${row.grossProfit.toLocaleString()}</TableCell>
                                        <TableCell className="text-right text-rose-600">${row.overhead.toLocaleString()}</TableCell>
                                        <TableCell className="text-right font-medium">${row.operatingProfit.toLocaleString()}</TableCell>
                                        <TableCell className="text-right font-bold bg-slate-50/50">${row.netProfit.toLocaleString()}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>

                <Card className="shadow-sm border-slate-100">
                    <CardHeader>
                        <CardTitle>Revenue Trend</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {/* Re-use the existing RevenueTrendChart which expects data prop */}
                        <div className="mt-4">
                            <RevenueTrendChart data={mockPL.map(d => ({ name: d.month, value: d.revenue }))} />
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
