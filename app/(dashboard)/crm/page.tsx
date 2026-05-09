'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { KanbanBoard } from '@/components/crm/KanbanBoard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DollarSign, Target, TrendingUp, Plus } from 'lucide-react';

import { useBusinessStore } from '@/store/businessStore';
import { useDealList } from '@/lib/queries/deals';
import { formatMoneyShort } from '@/lib/currency';
import { useTenantCurrency } from '@/hooks/useTenantCurrency';

export default function CRMPage() {
    const currency = useTenantCurrency();
    const [pipelineTotal, setPipelineTotal] = useState(0);
    const [weightedTotal, setWeightedTotal] = useState(0);
    const dealsQuery = useDealList();
    const deals = useMemo(() => dealsQuery.data?.data ?? [], [dealsQuery.data]);

    const getCapacityPool = useBusinessStore(state => state.getCapacityPool);
    const capacityPool = getCapacityPool();

    const handleMetricsUpdate = useCallback((total: number, weighted: number) => {
        setPipelineTotal(total);
        setWeightedTotal(weighted);
    }, []);

    const totalSoftBooked = capacityPool.reduce((acc, curr) => acc + curr.softBookedHours, 0);
    const totalHardBooked = capacityPool.reduce((acc, curr) => acc + curr.hardBookedHours, 0);

    return (
        <div className="space-y-6 flex flex-col h-[calc(100vh-8rem)]">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight text-[#171717]">CRM & Sales Pipeline</h2>
                    <p className="text-[#4a4a4a] mt-1">Manage leads, track opportunities, and forecast revenue.</p>
                </div>
                <Link href="/crm/new">
                    <Button>
                        <Plus className="mr-2 h-4 w-4" /> New Deal
                    </Button>
                </Link>
            </div>

            <div className="grid gap-4 md:grid-cols-4">
                <Card className="bg-white border-[#e6e9ee] shadow-sm">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Pipeline Value</CardTitle>
                        <DollarSign className="h-4 w-4 text-[#00a7f4]" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {formatMoneyShort(pipelineTotal, currency)}
                        </div>
                        <p className="text-xs text-[#4a4a4a] mt-1">
                            Sum of all deals in pipeline
                        </p>
                    </CardContent>
                </Card>

                <Card className="bg-white border-[#e6e9ee] shadow-sm">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Weighted Revenue</CardTitle>
                        <Target className="h-4 w-4 text-emerald-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {formatMoneyShort(weightedTotal, currency)}
                        </div>
                        <p className="text-xs text-[#4a4a4a] mt-1">
                            Value × Win Probability
                        </p>
                    </CardContent>
                </Card>

                <Card className="bg-white border-[#e6e9ee] shadow-sm">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Forecasted Yield</CardTitle>
                        <TrendingUp className="h-4 w-4 text-indigo-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {pipelineTotal > 0 ? ((weightedTotal / pipelineTotal) * 100).toFixed(1) : 0}%
                        </div>
                        <p className="text-xs text-[#4a4a4a] mt-1">
                            Average pipeline health
                        </p>
                    </CardContent>
                </Card>

                <Card className="bg-white border-[#e6e9ee] shadow-sm">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Capacity Bookings</CardTitle>
                        <Target className="h-4 w-4 text-orange-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold flex gap-2">
                            <span className="text-[#8a8a8a]">{totalSoftBooked.toFixed(0)}</span>
                            <span className="text-slate-300">/</span>
                            <span className="text-[#171717]">{totalHardBooked.toFixed(0)}</span>
                        </div>
                        <p className="text-xs text-[#4a4a4a] mt-1">
                            Soft vs Hard Booked Hrs
                        </p>
                    </CardContent>
                </Card>
            </div>

            <div className="flex-1 bg-white p-6 rounded-xl shadow-sm border border-[#e6e9ee]">
                {dealsQuery.isLoading ? (
                    <div className="h-96 w-full animate-pulse rounded-lg bg-slate-100" />
                ) : dealsQuery.isError ? (
                    <div className="flex h-96 flex-col items-center justify-center gap-3 text-center">
                        <p className="text-sm font-medium text-[#171717]">Could not load pipeline deals.</p>
                        <Button variant="outline" onClick={() => dealsQuery.refetch()}>Retry</Button>
                    </div>
                ) : deals.length === 0 ? (
                    <div className="flex h-96 flex-col items-center justify-center gap-3 text-center">
                        <p className="text-sm text-[#8a8a8a]">No deals yet. Create your first deal to start the pipeline.</p>
                        <Link href="/crm/new">
                            <Button>
                                <Plus className="mr-2 h-4 w-4" /> New Deal
                            </Button>
                        </Link>
                    </div>
                ) : (
                    <KanbanBoard deals={deals} onMetricsUpdate={handleMetricsUpdate} />
                )}
            </div>
        </div>
    );
}
