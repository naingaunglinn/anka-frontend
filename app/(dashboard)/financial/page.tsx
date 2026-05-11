'use client';

import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Download, TrendingUp, TrendingDown, DollarSign, Info } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useBusinessStore } from '@/store/businessStore';
import { useTenantStore, type Currency } from '@/store/tenantStore';
import { formatMoney } from '@/lib/currency';
import { useInvoiceList } from '@/lib/queries/invoices';
import { useTimeEntryList } from '@/lib/queries/timeEntries';
import { useOrganizationSync } from '@/hooks/useOrganizationSync';

export default function FinancialPage() {
    const store = useBusinessStore();
    const { activeTenantId, currentTenant, tenants } = useTenantStore();
    const currency = (currentTenant?.currency as Currency) ?? tenants.find((t) => t.id === activeTenantId)?.currency ?? 'MMK';
    const taxRate = currentTenant?.taxRate ?? 0.20;

    // Load invoices, time entries, and org data so P&L is always populated
    useInvoiceList();
    useTimeEntryList();
    useOrganizationSync();

    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');

    // Dynamic P&L from store
    const allPnlData = store.getFinancialPnL();

    // Helper: parse "Jan 2026" ? "2026-01" for reliable comparison
    const parseMonthKey = (displayMonth: string): string => {
        const d = new Date(`${displayMonth} 01`);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        return `${y}-${m}`;
    };

    const pnlData = useMemo(() => {
        if (!dateFrom && !dateTo) return allPnlData;
        return allPnlData.filter(row => {
            const rowKey = parseMonthKey(row.month);
            if (dateFrom && rowKey < dateFrom) return false;
            if (dateTo && rowKey > dateTo) return false;
            return true;
        });
    }, [allPnlData, dateFrom, dateTo]);

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
                    <h1 className="text-2xl font-bold tracking-tight text-[#171717]">Financial Performance (P&L)</h1>
                    <p className="text-[#8a8a8a] mt-1">Real-time profit and loss tracking derived from invoices, time tracking, and overheads.</p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                        <Input
                            type="month"
                            value={dateFrom}
                            onChange={e => setDateFrom(e.target.value)}
                            placeholder="From"
                            className="w-40"
                        />
                        <span className="text-sm text-[#8a8a8a]">to</span>
                        <Input
                            type="month"
                            value={dateTo}
                            onChange={e => setDateTo(e.target.value)}
                            placeholder="To"
                            className="w-40"
                        />
                        {(dateFrom || dateTo) && (
                            <Button variant="ghost" size="sm" onClick={() => { setDateFrom(''); setDateTo(''); }}>
                                Clear
                            </Button>
                        )}
                    </div>
                    <Button variant="outline" onClick={handleCsvExport} className="gap-2 bg-white">
                        <Download className="h-4 w-4" /> Export CSV
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <Card className="shadow-sm border-[#e6e9ee]">
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-[#8a8a8a]">Total Recognized Revenue</p>
                            <DollarSign className="h-4 w-4 text-emerald-500" />
                        </div>
                        <div className="mt-2 flex items-baseline gap-2">
                            <span className="text-3xl font-bold tracking-tight text-[#171717]">
                                {formatMoney(summary.totalRev, currency)}
                            </span>
                        </div>
                    </CardContent>
                </Card>
                <Card className="shadow-sm border-[#e6e9ee]">
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-[#8a8a8a]">Total Costs (Labor + Overhead)</p>
                            <TrendingDown className="h-4 w-4 text-rose-500" />
                        </div>
                        <div className="mt-2 flex items-baseline gap-2">
                            <span className="text-3xl font-bold tracking-tight text-[#171717]">
                                {formatMoney(summary.totalCost, currency)}
                            </span>
                        </div>
                    </CardContent>
                </Card>
                <Card className="shadow-sm border-[#e6e9ee]">
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-[#8a8a8a]">Operating Profit</p>
                            <TrendingUp className="h-4 w-4 text-emerald-500" />
                        </div>
                        <div className="mt-2 flex items-baseline gap-2">
                            <span className="text-3xl font-bold tracking-tight text-emerald-600">
                                {formatMoney(summary.totalProfit, currency)}
                            </span>
                        </div>
                    </CardContent>
                </Card>
                <Card className="shadow-sm border-[#e6e9ee]">
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-[#8a8a8a]">Overall Profit Margin</p>
                            <div className="h-4 w-4 rounded-full bg-[#00a7f4]/10 flex items-center justify-center">
                                <span className="text-[#00a7f4] text-[10px] font-bold">%</span>
                            </div>
                        </div>
                        <div className="mt-2 flex items-baseline gap-2">
                            <span className="text-3xl font-bold tracking-tight text-[#171717]">
                                {summary.overallMargin.toFixed(1)}%
                            </span>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Card className="shadow-sm border-[#00a7f4]/20 bg-[#00a7f4]/[0.03]">
                <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2 text-[#171717]">
                        <Info className="h-4 w-4 text-[#00a7f4]" />
                        How These Numbers Are Calculated
                    </CardTitle>
                    <CardDescription className="text-[#8a8a8a]">
                        Every line below is computed live from your operational data — no manual journal entries.
                    </CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3 text-sm">
                        <div>
                            <span className="font-semibold text-[#171717]">Recognized Revenue</span>
                            <p className="text-[#8a8a8a] text-xs mt-0.5">
                                Sum of <span className="font-medium">Paid</span> invoices (amount + tax), grouped by their <span className="font-medium">paid date</span>. Pending, overdue, and cancelled invoices are excluded — revenue is recognized only on cash receipt.
                            </p>
                        </div>
                        <div>
                            <span className="font-semibold text-[#171717]">Direct Labor</span>
                            <p className="text-[#8a8a8a] text-xs mt-0.5">
                                Full monthly payroll of every <span className="font-medium">Active</span> and <span className="font-medium">On Leave</span> employee, applied uniformly to each month with activity. Hours logged do not change the cost — all staff are salaried.
                            </p>
                        </div>
                        <div>
                            <span className="font-semibold text-[#171717]">Global Overhead</span>
                            <p className="text-[#8a8a8a] text-xs mt-0.5">
                                Sum of overheads from <span className="font-medium">Organization → Overheads</span> whose effective period matches the month, plus always-on overheads (those with no effective date).
                            </p>
                        </div>
                        <div>
                            <span className="font-semibold text-[#171717]">Gross Profit</span>
                            <p className="text-[#8a8a8a] text-xs mt-0.5">
                                Revenue − Direct Labor. The margin left after paying the people who delivered the work, before overhead and tax.
                            </p>
                        </div>
                        <div>
                            <span className="font-semibold text-[#171717]">Operating Profit (EBITDA)</span>
                            <p className="text-[#8a8a8a] text-xs mt-0.5">
                                Gross Profit − Overhead. Earnings before interest, tax, depreciation, and amortization.
                            </p>
                        </div>
                        <div>
                            <span className="font-semibold text-[#171717]">Net Margin %</span>
                            <p className="text-[#8a8a8a] text-xs mt-0.5">
                                Net Profit ÷ Revenue. Net Profit applies your tenant&apos;s income tax rate (currently <span className="font-medium">{(taxRate * 100).toFixed(0)}%</span>, configurable in <span className="font-medium">Tenant Settings</span>) to Operating Profit.
                            </p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card className="shadow-sm border-[#e6e9ee]">
                <CardHeader className="border-b bg-slate-50/50 pb-4">
                    <CardTitle className="text-lg">Monthly Profit & Loss Statement</CardTitle>
                    <CardDescription>Breakdown of revenue vs costs by month.</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader className="bg-white">
                            <TableRow>
                                <TableHead className="py-4">Month</TableHead>
                                <TableHead className="text-right py-4">Recognized Revenue (Paid Invoices)</TableHead>
                                <TableHead className="text-right py-4">Direct Labor (Timesheets)</TableHead>
                                <TableHead className="text-right py-4">Gross Profit</TableHead>
                                <TableHead className="text-right py-4">Global Overhead</TableHead>
                                <TableHead className="text-right py-4 font-bold text-[#171717]">Op. Profit (EBITDA)</TableHead>
                                <TableHead className="text-right py-4 font-bold text-emerald-600">Net Margin %</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {pnlData.map((row, i) => {
                                const margin = row.revenue > 0 ? (row.netProfit / row.revenue) * 100 : 0;
                                return (
                                    <TableRow key={i} className="hover:bg-slate-50/50 transition-colors">
                                        <TableCell className="font-semibold text-[#171717] py-4">{row.month}</TableCell>
                                        <TableCell className="text-right text-[#4a4a4a] py-4">{formatMoney(row.revenue, currency)}</TableCell>
                                        <TableCell className="text-right text-rose-600 py-4">-{formatMoney(row.directLabor, currency)}</TableCell>
                                        <TableCell className="text-right font-medium text-[#171717] py-4">{formatMoney(row.grossProfit, currency)}</TableCell>
                                        <TableCell className="text-right text-rose-600 py-4">-{formatMoney(row.overhead, currency)}</TableCell>
                                        <TableCell className="text-right font-bold text-[#171717] py-4">{formatMoney(row.operatingProfit, currency)}</TableCell>
                                        <TableCell className="text-right py-4">
                                            <Badge variant="outline" className={
                                                margin > 20 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                                    margin > 0 ? 'bg-[#00a7f4]/5 text-[#0086c4] border-[#00a7f4]/20' :
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
                                    <TableCell colSpan={7} className="text-center py-8 text-[#8a8a8a]">
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
