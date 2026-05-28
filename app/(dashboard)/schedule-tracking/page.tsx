'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { LoadingState } from '@/components/LoadingState';
import { useProjectList } from '@/lib/queries/projects';
import {
    useScheduleTrackingList,
    useProjectScheduleSummary,
    useProjectScheduleByAssignee,
} from '@/lib/queries/scheduleTracking';
import { ScheduleHealthBadge } from '@/components/schedule-tracking/ScheduleHealthBadge';
import { PhaseDrillDownDrawer } from '@/components/schedule-tracking/PhaseDrillDownDrawer';
import { SimulatedDateBar, SimulatedDateBanner, useAsOfParam } from '@/components/SimulatedDateBar';
import { Search, ChevronLeft, ChevronRight, Users, ListFilter } from 'lucide-react';
import type { ScheduleTrackingRow, ScheduleHealth } from '@/types/business';

function useDebounced<T>(value: T, delay = 300): T {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
        const t = setTimeout(() => setDebounced(value), delay);
        return () => clearTimeout(t);
    }, [value, delay]);
    return debounced;
}

const HEALTH_OPTION_KEYS: Array<{ value: string; labelKey: string }> = [
    { value: 'on_track', labelKey: 'health_on_track' },
    { value: 'at_risk',  labelKey: 'health_at_risk' },
    { value: 'slipping', labelKey: 'health_slipping' },
];

export default function ScheduleTrackingPage() {
    const t = useTranslations();
    const projectsQuery = useProjectList();
    const allProjects = projectsQuery.data?.data ?? [];
    const projects = useMemo(
        () => allProjects.filter((p) => p.status !== 'Completed'),
        [allProjects],
    );

    const [projectId, setProjectId]   = useState<string>('');
    const [search, setSearch]         = useState('');
    const [healthFilter, setHealthFilter] = useState<string>('');
    const [page, setPage]             = useState(1);
    const [selectedRow, setSelectedRow] = useState<ScheduleTrackingRow | null>(null);
    const debouncedSearch = useDebounced(search, 300);

    useEffect(() => {
        if (!projectId && projects.length > 0) {
            setProjectId(projects[0].id);
        }
    }, [projects, projectId]);
    useEffect(() => {
        if (projectId && !projects.some((p) => p.id === projectId)) {
            setProjectId(projects[0]?.id ?? '');
        }
    }, [projects, projectId]);

    useEffect(() => { setPage(1); }, [projectId, debouncedSearch, healthFilter]);

    const asOf = useAsOfParam();

    const params = useMemo(() => {
        const p: Record<string, string | number> = { page, per_page: 25 };
        if (debouncedSearch.trim()) p.search = debouncedSearch.trim();
        if (healthFilter)            p.health = healthFilter;
        if (asOf)                    p.as_of  = asOf;
        return p;
    }, [page, debouncedSearch, healthFilter, asOf]);

    const listQuery     = useScheduleTrackingList(projectId, params);
    const summaryQuery  = useProjectScheduleSummary(projectId, asOf);
    const byAssignee    = useProjectScheduleByAssignee(projectId, asOf);

    const rows = listQuery.data?.data ?? [];
    const meta = (listQuery.data?.meta as { current_page?: number; last_page?: number; total?: number }) ?? {};
    const summary = summaryQuery.data;

    return (
        <div className="p-6 space-y-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-[#171717]">{t('schedule_tracking')}</h1>
                    <p className="text-[#8a8a8a] mt-1">
                        {t('schedule_tracking_description')}
                    </p>
                </div>
                <SimulatedDateBar />
            </div>
            <SimulatedDateBanner />

            {/* Controls */}
            <div className="flex flex-wrap items-center gap-2.5 rounded-lg bg-slate-50 border border-slate-200 px-3 py-2.5">
                <div className="flex items-center gap-2">
                    <label className="text-sm font-semibold text-slate-800 whitespace-nowrap">{t('project')}:</label>
                    <Select value={projectId} onValueChange={setProjectId}>
                        <SelectTrigger className="h-9 w-auto max-w-[min(100%,480px)] text-xs bg-white border-slate-300 shadow-sm">
                            <SelectValue placeholder={t('pick_a_project')} />
                        </SelectTrigger>
                        <SelectContent className="max-w-[480px]">
                            {projects.map((p) => (
                                <SelectItem key={p.id} value={p.id}>
                                    {p.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="relative flex-1 min-w-[200px] max-w-[320px]">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
                    <Input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder={t('search_phase_placeholder')}
                        className="h-9 pl-8 pr-2 text-xs bg-white border-slate-300 shadow-sm"
                    />
                </div>
                <Select value={healthFilter || 'all'} onValueChange={(v) => setHealthFilter(v === 'all' ? '' : v)}>
                    <SelectTrigger className="h-9 w-[180px] text-xs bg-white border-slate-300 shadow-sm">
                        <SelectValue>
                            {healthFilter ? (
                                <span className="flex items-center gap-1.5">
                                    <ScheduleHealthBadge health={healthFilter as ScheduleHealth} compact />
                                    {t(HEALTH_OPTION_KEYS.find((o) => o.value === healthFilter)?.labelKey ?? '')}
                                </span>
                            ) : (
                                <span className="flex items-center gap-1.5">
                                    <ListFilter className="h-3.5 w-3.5 text-slate-400" />
                                    {t('all')}
                                </span>
                            )}
                        </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">
                            <span className="flex items-center gap-1.5">
                                <ListFilter className="h-3.5 w-3.5 text-slate-400" />
                                {t('all')}
                            </span>
                        </SelectItem>
                        {HEALTH_OPTION_KEYS.map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                                <span className="flex items-center gap-1.5">
                                    <ScheduleHealthBadge health={o.value as ScheduleHealth} compact />
                                    {t(o.labelKey)}
                                </span>
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {/* Project rollup strip */}
            {summary && (
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
                    <StatCard label="Estimated" value={`${summary.totalEstimatedHours}h`} />
                    <StatCard label="Progress"  value={`${summary.totalProgressHours}h`} />
                    <StatCard label="Used"      value={`${summary.totalUsedHours}h`} />
                    <StatCard
                        label="Progress Status"
                        value={`${summary.varianceHours > 0 ? '+' : ''}${summary.varianceHours}h`}
                        valueClassName={summary.varianceHours < 0 ? 'text-rose-600' : 'text-emerald-600'}
                    />
                    <StatCard
                        label="Extra Hours"
                        value={`${summary.lateHours > 0 ? '+' : ''}${summary.lateHours}h`}
                        valueClassName={summary.lateHours > 0 ? 'text-amber-600' : ''}
                    />
                    <StatCard label="Health" custom>
                        <ScheduleHealthBadge health={summary.health} />
                        <div className="text-[10px] text-slate-400 mt-0.5">
                            {t('phases_done_summary', { done: summary.completedCount, total: summary.phaseCount })}
                        </div>
                    </StatCard>
                    <StatCard label="Expected (today)" value={`${summary.todayExpectedHours}h`} highlight />
                    <StatCard label="Finish Today" value={`${summary.todayProgressHours}h`} highlight />
                </div>
            )}

            {/* Data table */}
            <Card className="shadow-sm border-slate-200 overflow-hidden rounded-xl">
                {meta.total ? (
                    <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 bg-white">
                        <h3 className="text-sm font-semibold text-slate-800">{t('schedule_tracking')}</h3>
                        <span className="text-[11px] text-slate-400 tabular-nums">
                            {t('n_of_total_phases', { shown: rows.length, total: meta.total })}
                        </span>
                    </div>
                ) : null}
                <div className="overflow-x-auto">
                    <table className="w-full text-[13px]">
                        <thead>
                            <tr className="border-b border-slate-200 bg-slate-50/80">
                                <th className="px-4 py-3 text-left text-[10px] font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">Function ID</th>
                                <th className="px-4 py-3 text-left text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Function</th>
                                <th className="px-4 py-3 text-left text-[10px] font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">Phase</th>
                                <th className="px-4 py-3 text-left text-[10px] font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">Assignee</th>
                                <th className="px-4 py-3 text-left text-[10px] font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">Planned</th>
                                <th className="px-4 py-3 text-left text-[10px] font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">Actual</th>
                                <th className="px-4 py-3 text-right text-[10px] font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap" title="Planned Value">PV</th>
                                <th className="px-4 py-3 text-right text-[10px] font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap" title="Earned Value">EV</th>
                                <th className="px-4 py-3 text-right text-[10px] font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap" title="Actual Cost">AC</th>
                                <th className="px-4 py-3 text-right text-[10px] font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">Variance</th>
                                <th className="px-4 py-3 text-center text-[10px] font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">Health</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {listQuery.isLoading ? (
                                <tr><td colSpan={11} className="py-12"><LoadingState message={t('loading_tracking_data')} /></td></tr>
                            ) : rows.length === 0 ? (
                                <tr><td colSpan={11} className="py-10 text-center text-slate-400">{t('no_phases_match_filters')}</td></tr>
                            ) : rows.map((row) => (
                                <tr
                                    key={row.id}
                                    className="cursor-pointer hover:bg-indigo-50/40 transition-colors"
                                    onClick={() => setSelectedRow(row)}
                                >
                                    <td className="px-4 py-3 font-mono text-[11px] text-slate-400 whitespace-nowrap">{row.functionId ?? '—'}</td>
                                    <td className="px-4 py-3 font-medium text-slate-800 whitespace-nowrap">{row.functionName}</td>
                                    <td className="px-4 py-3 whitespace-nowrap">
                                        <Badge variant="outline" className="text-[10px] font-medium">{row.phaseName}</Badge>
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap">
                                        {row.assigneeName ? (
                                            <span className="inline-flex items-center gap-2">
                                                <span className="flex items-center justify-center h-6 w-6 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold shrink-0">
                                                    {row.assigneeName.charAt(0).toUpperCase()}
                                                </span>
                                                <span className="text-slate-700">{row.assigneeName}</span>
                                            </span>
                                        ) : (
                                            <span className="text-slate-300 italic">—</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap">
                                        <span className="inline-flex items-center gap-1 text-[12px] tabular-nums text-slate-500">
                                            <span className="font-mono">{row.plannedStart?.replaceAll('-', '/')}</span>
                                            <span className="text-slate-300">→</span>
                                            <span className="font-mono">{row.plannedEnd?.replaceAll('-', '/')}</span>
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap">
                                        {row.actualStart || row.actualEnd ? (
                                            <span className="inline-flex items-center gap-1 text-[12px] tabular-nums text-slate-500">
                                                <span className="font-mono">{row.actualStart?.replaceAll('-', '/') ?? '—'}</span>
                                                <span className="text-slate-300">→</span>
                                                <span className="font-mono">{row.actualEnd?.replaceAll('-', '/') ?? '—'}</span>
                                            </span>
                                        ) : (
                                            <span className="text-slate-300 italic">—</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-right tabular-nums text-slate-600 whitespace-nowrap">{row.estimatedHours}h</td>
                                    <td className="px-4 py-3 text-right tabular-nums text-slate-600 whitespace-nowrap">{row.variance.cumulativeProgressHours}h</td>
                                    <td className="px-4 py-3 text-right tabular-nums text-slate-600 whitespace-nowrap">{row.variance.cumulativeUsedHours}h</td>
                                    <td className={`px-4 py-3 text-right tabular-nums font-semibold whitespace-nowrap ${row.variance.varianceHours < 0 ? 'text-rose-600' : row.variance.varianceHours > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
                                        {row.variance.varianceHours > 0 ? '+' : ''}{row.variance.varianceHours}h
                                    </td>
                                    <td className="px-4 py-3 text-center whitespace-nowrap"><ScheduleHealthBadge health={row.variance.health} compact /></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {/* Pagination inside card */}
                {meta.total && (meta.last_page ?? 1) > 1 ? (
                    <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 bg-white">
                        <span className="text-[11px] text-slate-400">
                            {t('page_x_of_y', { current: meta.current_page ?? page, total: meta.last_page ?? 1 })}
                        </span>
                        <div className="flex items-center gap-1">
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-7 w-7 p-0"
                                disabled={page <= 1 || listQuery.isFetching}
                                onClick={() => setPage((p) => Math.max(1, p - 1))}
                            >
                                <ChevronLeft className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-7 w-7 p-0"
                                disabled={(meta.current_page ?? page) >= (meta.last_page ?? 1) || listQuery.isFetching}
                                onClick={() => setPage((p) => p + 1)}
                            >
                                <ChevronRight className="h-3.5 w-3.5" />
                            </Button>
                        </div>
                    </div>
                ) : null}
            </Card>

            {/* Per-assignee rollup */}
            {byAssignee.data && byAssignee.data.length > 0 && (
                <Card className="shadow-sm border-slate-200 overflow-hidden rounded-xl">
                    <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 bg-white">
                        <div className="flex items-center gap-2">
                            <div className="flex items-center justify-center h-7 w-7 rounded-lg bg-indigo-100 shrink-0">
                                <Users className="h-3.5 w-3.5 text-indigo-600" />
                            </div>
                            <div>
                                <h2 className="text-sm font-semibold text-slate-800">{t('by_assignee')}</h2>
                                <p className="text-[10px] text-slate-400">{t('most_behind_first')}</p>
                            </div>
                        </div>
                        <span className="text-[11px] text-slate-400 tabular-nums">{byAssignee.data.length} members</span>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-[13px]">
                            <thead>
                                <tr className="border-b border-slate-200 bg-slate-50/80">
                                    <th className="px-4 py-3 text-left text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Assignee</th>
                                    <th className="px-4 py-3 text-right text-[10px] font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">Estimated</th>
                                    <th className="px-4 py-3 text-right text-[10px] font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">Progress</th>
                                    <th className="px-4 py-3 text-right text-[10px] font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">Used</th>
                                    <th className="px-4 py-3 text-right text-[10px] font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">Variance</th>
                                    <th className="px-4 py-3 text-right text-[10px] font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">Extra</th>
                                    <th className="px-4 py-3 text-center text-[10px] font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">Health</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {byAssignee.data.map((a) => (
                                    <tr key={a.assigneeId} className="hover:bg-indigo-50/40 transition-colors">
                                        <td className="px-4 py-3">
                                            <span className="inline-flex items-center gap-2">
                                                <span className="flex items-center justify-center h-7 w-7 rounded-full bg-indigo-100 text-indigo-700 text-[11px] font-bold shrink-0">
                                                    {(a.assigneeName ?? '?').charAt(0).toUpperCase()}
                                                </span>
                                                <span className="font-medium text-slate-800">{a.assigneeName ?? a.assigneeId}</span>
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-right tabular-nums text-slate-600">{a.totalEstimatedHours}h</td>
                                        <td className="px-4 py-3 text-right tabular-nums text-slate-600">{a.totalProgressHours}h</td>
                                        <td className="px-4 py-3 text-right tabular-nums text-slate-600">{a.totalUsedHours}h</td>
                                        <td className={`px-4 py-3 text-right tabular-nums font-semibold ${a.varianceHours < 0 ? 'text-rose-600' : a.varianceHours > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
                                            {a.varianceHours > 0 ? '+' : ''}{a.varianceHours}h
                                        </td>
                                        <td className={`px-4 py-3 text-right tabular-nums font-semibold ${a.lateHours > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
                                            {a.lateHours > 0 ? `+${a.lateHours}` : a.lateHours}h
                                        </td>
                                        <td className="px-4 py-3 text-center"><ScheduleHealthBadge health={a.health} compact /></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Card>
            )}

            <PhaseDrillDownDrawer
                open={!!selectedRow}
                onClose={() => setSelectedRow(null)}
                row={selectedRow}
                isManager={true}
            />
        </div>
    );
}

function StatCard({
    label,
    value,
    valueClassName = '',
    highlight = false,
    custom = false,
    children,
}: {
    label: string;
    value?: string;
    valueClassName?: string;
    highlight?: boolean;
    custom?: boolean;
    children?: React.ReactNode;
}) {
    return (
        <div className={`rounded-lg border px-3 py-2.5 ${highlight ? 'border-indigo-200 bg-indigo-50/50' : 'border-slate-200 bg-white'}`}>
            <div className="text-[10px] uppercase tracking-wider font-medium text-slate-400">{label}</div>
            {custom ? children : (
                <div className={`text-lg font-semibold mt-0.5 ${valueClassName || 'text-slate-800'}`}>{value}</div>
            )}
        </div>
    );
}
