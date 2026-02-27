'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Download, TrendingUp, TrendingDown, DollarSign } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useBusinessStore } from '@/store/businessStore';
import { useMemo } from 'react';

export default function FinancialPage() {
    const store = useBusinessStore();

    // Dynamic P&L from store
    const pnlData = store.getFinancialPnL();

    // Summary metrics based on dynamic data
    const summary = useMemo(() => {
        let totalRev = 0;
        let totalCost = 0;
        let totalProfit = 0;

        pnlData.forEach(m => {
            totalRev += m.revenue;
            totalCost += m.directLabor + m.overhead;
            totalProfit += m.operatingProfit;
        });

        const overallMargin = totalRev > 0 ? (totalProfit / totalRev) * 100 : 0;

        return { totalRev, totalCost, totalProfit, overallMargin };
    }, [pnlData]);

    const handleCsvExport = () => {
        const headers = ["Month", "Revenue", "Direct Labor", "Overhead", "Gross Profit", "Operating Profit", "Net Profit"];
        const rows = pnlData.map(row => [
            row.month,
            row.revenue,
            row.directLabor,
            row.overhead,
            row.grossProfit,
            row.operatingProfit,
            row.netProfit
        ]);

        const csvContent = "data:text/csv;charset=utf-8,"
            + headers.join(",") + "\n"
            + rows.map(e => e.join(",")).join("\n");

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "pnl_statement.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="p-6 space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900">Financial Performance (P&L)</h1>
                    <p className="text-slate-500 mt-1">Real-time profit and loss tracking derived from invoices, time tracking, and overheads.</p>
                </div>
                <Button variant="outline" onClick={handleCsvExport} className="gap-2 bg-white">
                    <Download className="h-4 w-4" /> Export CSV
                </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <Card className="shadow-sm border-slate-100">
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-slate-500">Total Recognized Revenue</p>
                            <DollarSign className="h-4 w-4 text-emerald-500" />
                        </div>
                        <div className="mt-2 flex items-baseline gap-2">
                            <span className="text-3xl font-bold tracking-tight text-slate-900">
                                ${summary.totalRev.toLocaleString()}
                            </span>
                        </div>
                    </CardContent>
                </Card>
                <Card className="shadow-sm border-slate-100">
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-slate-500">Total Costs (Labor + Overhead)</p>
                            <TrendingDown className="h-4 w-4 text-rose-500" />
                        </div>
                        <div className="mt-2 flex items-baseline gap-2">
                            <span className="text-3xl font-bold tracking-tight text-slate-900">
                                ${summary.totalCost.toLocaleString()}
                            </span>
                        </div>
                    </CardContent>
                </Card>
                <Card className="shadow-sm border-slate-100">
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-slate-500">Operating Profit</p>
                            <TrendingUp className="h-4 w-4 text-emerald-500" />
                        </div>
                        <div className="mt-2 flex items-baseline gap-2">
                            <span className="text-3xl font-bold tracking-tight text-emerald-600">
                                ${summary.totalProfit.toLocaleString()}
                            </span>
                        </div>
                    </CardContent>
                </Card>
                <Card className="shadow-sm border-slate-100">
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-slate-500">Overall Profit Margin</p>
                            <div className="h-4 w-4 rounded-full bg-blue-100 flex items-center justify-center">
                                <span className="text-blue-600 text-[10px] font-bold">%</span>
                            </div>
                        </div>
                        <div className="mt-2 flex items-baseline gap-2">
                            <span className="text-3xl font-bold tracking-tight text-slate-900">
                                {summary.overallMargin.toFixed(1)}%
                            </span>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Card className="shadow-sm border-slate-100">
                <CardHeader className="border-b bg-slate-50/50 pb-4">
                    <CardTitle className="text-lg">Monthly Profit & Loss Statement</CardTitle>
                    <CardDescription>Breakdown of revenue vs costs by month.</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader className="bg-slate-50">
                            <TableRow>
                                <TableHead className="py-4">Month</TableHead>
                                <TableHead className="text-right py-4">Revenue (Invoices)</TableHead>
                                <TableHead className="text-right py-4">Direct Labor (Timesheets)</TableHead>
                                <TableHead className="text-right py-4">Gross Profit</TableHead>
                                <TableHead className="text-right py-4">Global Overhead</TableHead>
                                <TableHead className="text-right py-4 font-bold text-slate-900">Op. Profit (EBITDA)</TableHead>
                                <TableHead className="text-right py-4 font-bold text-emerald-600">Net Margin %</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {pnlData.map((row, i) => {
                                const margin = row.revenue > 0 ? (row.netProfit / row.revenue) * 100 : 0;
                                return (
                                    <TableRow key={i} className="hover:bg-slate-50/50 transition-colors">
                                        <TableCell className="font-semibold text-slate-900 py-4">{row.month}</TableCell>
                                        <TableCell className="text-right text-slate-600 py-4">${row.revenue.toLocaleString()}</TableCell>
                                        <TableCell className="text-right text-rose-600 py-4">-${row.directLabor.toLocaleString()}</TableCell>
                                        <TableCell className="text-right font-medium text-slate-900 py-4">${row.grossProfit.toLocaleString()}</TableCell>
                                        <TableCell className="text-right text-rose-600 py-4">-${row.overhead.toLocaleString()}</TableCell>
                                        <TableCell className="text-right font-bold text-slate-900 py-4">${row.operatingProfit.toLocaleString()}</TableCell>
                                        <TableCell className="text-right py-4">
                                            <Badge variant="outline" className={
                                                margin > 20 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                                    margin > 0 ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                                        'bg-rose-50 text-rose-700 border-rose-200'
                                            }>
                                                {margin.toFixed(1)}%
                                            </Badge>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                            {pnlData.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={7} className="text-center py-8 text-slate-500">
                                        No financial data. Add invoices and time entries to generate P&L statements.
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
