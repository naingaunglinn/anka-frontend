'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { KanbanBoard } from '@/components/crm/KanbanBoard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DollarSign, Search, Target, TrendingUp, Plus, X } from 'lucide-react';

import { useBusinessStore } from '@/store/businessStore';
import { useDealList } from '@/lib/queries/deals';
import { formatMoneyShort } from '@/lib/currency';
import { useTenantCurrency } from '@/hooks/useTenantCurrency';
import { PermissionGuard } from '@/components/PermissionGuard';
import type { Deal } from '@/types/business';

const ALL_STATUSES = '__all__'; // Radix Select rejects '' as a SelectItem value; sentinel for "no filter".

export default function CRMPage() {
    const currency = useTenantCurrency();
    const [pipelineTotal, setPipelineTotal] = useState(0);
    const [weightedTotal, setWeightedTotal] = useState(0);

    // Filter inputs. `searchInput` updates on every keystroke; `debouncedSearch`
    // lags by 300ms so we don't fire a network request per character. Status
    // filter is server-side via the index endpoint's `status` query param.
    const [searchInput, setSearchInput] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>(ALL_STATUSES);

    useEffect(() => {
        const handle = setTimeout(() => setDebouncedSearch(searchInput), 300);
        return () => clearTimeout(handle);
    }, [searchInput]);

    const dealsQuery = useDealList({
        // Only pass params when meaningful so the cache key doesn't fragment
        // unnecessarily and the network call stays slim for the no-filter case.
        ...(debouncedSearch.trim() ? { search: debouncedSearch.trim() } : {}),
        ...(statusFilter !== ALL_STATUSES ? { status: statusFilter as Deal['status'] } : {}),
    });
    const deals = useMemo(() => dealsQuery.data?.data ?? [], [dealsQuery.data]);

    const hasActiveFilters = statusFilter !== ALL_STATUSES || debouncedSearch.trim().length > 0;
    const clearFilters = () => {
        setSearchInput('');
        setStatusFilter(ALL_STATUSES);
    };

    const getCapacityPool = useBusinessStore(state => state.getCapacityPool);
    // Subscribe to the inputs of getCapacityPool so React re-renders when they
    // change, but memoise the call itself — the returned array is a fresh
    // reference on every render otherwise, defeating any downstream memo.
    const dealsForPool      = useBusinessStore(state => state.deals);
    const employeesForPool  = useBusinessStore(state => state.employees);
    const capacityPool = useMemo(
        () => getCapacityPool(),
        // dependencies intentionally include the slices the pool reads from.
        // getCapacityPool is a stable function ref (Zustand) so it's safe to omit.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [dealsForPool, employeesForPool],
    );

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
                <PermissionGuard permission="manage_crm">
                    <Link href="/crm/new">
                        <Button>
                            <Plus className="mr-2 h-4 w-4" /> New Deal
                        </Button>
                    </Link>
                </PermissionGuard>
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

            {/* Filter bar — server-side search + status filter. The backend's
                /deals index already supports `search` (name/client ilike) and
                `status` query params; previously the frontend just called
                useDealList() with no filters and rendered every deal in memory. */}
            <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                    <Input
                        type="search"
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                        placeholder="Search by deal name or client..."
                        className="pl-9 bg-white"
                    />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-full sm:w-[180px] bg-white">
                        <SelectValue placeholder="All stages" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value={ALL_STATUSES}>All stages</SelectItem>
                        <SelectItem value="lead">Lead</SelectItem>
                        <SelectItem value="qualified">Qualified</SelectItem>
                        <SelectItem value="proposal">Proposal</SelectItem>
                        <SelectItem value="negotiation">Negotiation</SelectItem>
                        <SelectItem value="won">Won</SelectItem>
                        <SelectItem value="lost">Lost</SelectItem>
                    </SelectContent>
                </Select>
                {hasActiveFilters && (
                    <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1.5">
                        <X className="h-3.5 w-3.5" />
                        Clear filters
                    </Button>
                )}
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
                        {hasActiveFilters ? (
                            <>
                                <p className="text-sm text-[#8a8a8a]">No deals match the current filters.</p>
                                <Button variant="outline" onClick={clearFilters}>Clear filters</Button>
                            </>
                        ) : (
                            <>
                                <p className="text-sm text-[#8a8a8a]">No deals yet. Create your first deal to start the pipeline.</p>
                                <PermissionGuard permission="manage_crm">
                                    <Link href="/crm/new">
                                        <Button>
                                            <Plus className="mr-2 h-4 w-4" /> New Deal
                                        </Button>
                                    </Link>
                                </PermissionGuard>
                            </>
                        )}
                    </div>
                ) : (
                    <KanbanBoard deals={deals} onMetricsUpdate={handleMetricsUpdate} />
                )}
            </div>
        </div>
    );
}
