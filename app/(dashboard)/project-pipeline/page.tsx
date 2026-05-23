'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { KanbanBoard } from '@/components/crm/KanbanBoard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DollarSign, Search, Target, TrendingUp, Plus, X, EyeOff, Eye } from 'lucide-react';

import { useDealList } from '@/lib/queries/deals';
import { formatMoneyShort } from '@/lib/currency';
import { useTenantCurrency } from '@/hooks/useTenantCurrency';
import { useOrganizationSync } from '@/hooks/useOrganizationSync';
import { PermissionGuard } from '@/components/PermissionGuard';
import type { Deal } from '@/types/business';

const ALL_STATUSES = '__all__'; // Radix Select rejects '' as a SelectItem value; sentinel for "no filter".

export default function CRMPage() {
    const t = useTranslations();
    // Hydrate org data into businessStore (roles, employees, companySettings)
    // so downstream pages and the deal-detail Financial Summary card have
    // what they need when the user navigates from here.
    useOrganizationSync();

    const currency = useTenantCurrency();
    const [pipelineTotal, setPipelineTotal] = useState(0);
    const [weightedTotal, setWeightedTotal] = useState(0);

    // Filter inputs. `searchInput` updates on every keystroke; `debouncedSearch`
    // lags by 300ms so we don't fire a network request per character. Status
    // filter is server-side via the index endpoint's `status` query param.
    const [searchInput, setSearchInput] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>(ALL_STATUSES);
    // chg-009: Dropped is now a status flag, not a rank column. Toggle
    // overlays greyed dropped cards in their last-known stage column.
    const [showDropped, setShowDropped] = useState(false);

    // Page size disclosure. Default 100 matches the backend's default, max
    // is 500 (also enforced server-side in DealController::index). Tenants
    // with >100 deals previously had the rest silently hidden from the
    // Kanban; now we show a count + "Load all" affordance.
    const DEFAULT_PER_PAGE = 100;
    const MAX_PER_PAGE     = 500;
    const [perPage, setPerPage] = useState<number>(DEFAULT_PER_PAGE);

    useEffect(() => {
        const handle = setTimeout(() => setDebouncedSearch(searchInput), 300);
        return () => clearTimeout(handle);
    }, [searchInput]);

    const dealsQuery = useDealList({
        // Only pass params when meaningful so the cache key doesn't fragment
        // unnecessarily and the network call stays slim for the no-filter case.
        ...(debouncedSearch.trim() ? { search: debouncedSearch.trim() } : {}),
        ...(statusFilter !== ALL_STATUSES ? { status: statusFilter as Deal['status'] } : {}),
        per_page: perPage,
    });
    const deals = useMemo(() => dealsQuery.data?.data ?? [], [dealsQuery.data]);
    const totalDeals      = dealsQuery.data?.meta?.total ?? deals.length;
    const hasMore         = totalDeals > deals.length;
    const droppedCount = useMemo(
        () => deals.filter(d => d.lifecycleStatus === 'dropped' || d.status === 'lost').length,
        [deals],
    );

    const hasActiveFilters = statusFilter !== ALL_STATUSES || debouncedSearch.trim().length > 0;
    const clearFilters = () => {
        setSearchInput('');
        setStatusFilter(ALL_STATUSES);
        setPerPage(DEFAULT_PER_PAGE);
    };

    const handleMetricsUpdate = useCallback((total: number, weighted: number) => {
        setPipelineTotal(total);
        setWeightedTotal(weighted);
    }, []);

    return (
        <div className="space-y-6 flex flex-col h-[calc(100vh-8rem)]">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight text-[#171717]">{t('project_pipeline')}</h2>
                    <p className="text-[#4a4a4a] mt-1">{t('project_pipeline_description')}</p>
                </div>
                <div className="flex items-center gap-2">
                    <PermissionGuard permission="manage_crm">
                        <Link href="/project-pipeline/new">
                            <Button>
                                <Plus className="mr-2 h-4 w-4" /> {t('new_deal')}
                            </Button>
                        </Link>
                    </PermissionGuard>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
                <Card variant="plain">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">{t('total_pipeline_value')}</CardTitle>
                        <DollarSign className="h-4 w-4 text-[#00a7f4]" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {formatMoneyShort(pipelineTotal, currency)}
                        </div>
                        <p className="text-xs text-[#4a4a4a] mt-1">
                            {t('sum_of_all_deals')}
                        </p>
                    </CardContent>
                </Card>

                <Card variant="plain">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">{t('weighted_revenue')}</CardTitle>
                        <Target className="h-4 w-4 text-emerald-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {formatMoneyShort(weightedTotal, currency)}
                        </div>
                        <p className="text-xs text-[#4a4a4a] mt-1">
                            {t('value_times_win_probability')}
                        </p>
                    </CardContent>
                </Card>

                <Card variant="plain">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">{t('forecasted_yield')}</CardTitle>
                        <TrendingUp className="h-4 w-4 text-indigo-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {pipelineTotal > 0 ? ((weightedTotal / pipelineTotal) * 100).toFixed(1) : 0}%
                        </div>
                        <p className="text-xs text-[#4a4a4a] mt-1">
                            {t('average_pipeline_health')}
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
                        placeholder={t('search_by_deal_or_client')}
                        className="pl-9 bg-white"
                    />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-full sm:w-[180px] bg-white">
                        <SelectValue placeholder={t('all_stages')} />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value={ALL_STATUSES}>{t('all_stages')}</SelectItem>
                        <SelectItem value="lead">{t('stage_lead')}</SelectItem>
                        <SelectItem value="qualified">{t('stage_qualified')}</SelectItem>
                        <SelectItem value="negotiation">{t('stage_negotiation')}</SelectItem>
                        <SelectItem value="won">{t('stage_won')}</SelectItem>
                    </SelectContent>
                </Select>
                <Button
                    type="button"
                    variant={showDropped ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setShowDropped(v => !v)}
                    className="gap-1.5"
                    title={showDropped ? t('hide_dropped_tooltip') : t('show_dropped_tooltip')}
                >
                    {showDropped ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    {showDropped ? t('hide_dropped') : (droppedCount ? t('show_dropped_with_count', { count: droppedCount }) : t('show_dropped'))}
                </Button>
                {hasActiveFilters && (
                    <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1.5">
                        <X className="h-3.5 w-3.5" />
                        {t('clear_filters')}
                    </Button>
                )}
            </div>

            {/* Pagination disclosure — the backend caps `per_page` at 500, so
                tenants approaching that ceiling will see a one-time bump UX
                rather than a silent truncation. Real infinite-scroll on a
                Kanban is awkward (cards have to sit in fixed columns), so
                explicit "Load all" is the pragmatic middle ground. */}
            {deals.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#4a4a4a]">
                    <span>
                        {totalDeals !== deals.length
                            ? t('showing_x_of_y_deals', { shown: deals.length, total: totalDeals })
                            : t('showing_n_deals', { shown: deals.length })}
                        {perPage !== DEFAULT_PER_PAGE && (
                            <span className="text-[#8a8a8a]"> {t('page_size', { size: perPage })}</span>
                        )}
                    </span>
                    {hasMore && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPerPage(MAX_PER_PAGE)}
                            disabled={perPage >= MAX_PER_PAGE}
                            className="h-7"
                        >
                            {t('load_all_max', { max: MAX_PER_PAGE })}
                        </Button>
                    )}
                </div>
            )}

            <div className="flex-1 bg-white p-6 rounded-xl shadow-sm border border-[#e6e9ee]">
                {dealsQuery.isLoading ? (
                    <div className="h-96 w-full animate-pulse rounded-lg bg-slate-100" />
                ) : dealsQuery.isError ? (
                    <div className="flex h-96 flex-col items-center justify-center gap-3 text-center">
                        <p className="text-sm font-medium text-[#171717]">{t('could_not_load_pipeline')}</p>
                        <Button variant="outline" onClick={() => dealsQuery.refetch()}>{t('retry')}</Button>
                    </div>
                ) : deals.length === 0 ? (
                    hasActiveFilters ? (
                        <EmptyState
                            className="h-96"
                            title={t('no_deals_match_filters')}
                            action={<Button variant="outline" onClick={clearFilters}>{t('clear_filters')}</Button>}
                        />
                    ) : (
                        <EmptyState
                            className="h-96"
                            title={t('no_deals_yet')}
                            action={
                                <PermissionGuard permission="manage_crm">
                                    <Link href="/project-pipeline/new">
                                        <Button>
                                            <Plus className="mr-2 h-4 w-4" /> {t('new_deal')}
                                        </Button>
                                    </Link>
                                </PermissionGuard>
                            }
                        />
                    )
                ) : (
                    <KanbanBoard deals={deals} onMetricsUpdate={handleMetricsUpdate} showDropped={showDropped} />
                )}
            </div>
        </div>
    );
}
