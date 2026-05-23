'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
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
import { SimulatedDateBar, useAsOfParam } from '@/components/SimulatedDateBar';
import { Search } from 'lucide-react';
import type { ScheduleTrackingRow } from '@/types/business';

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
    // Hide finished projects — schedule tracking is for live work.
    const projects = useMemo(
        () => allProjects.filter((p) => p.status !== 'Completed'),
        [allProjects],
    );

    const [projectId, setProjectId]   = useState<string>('');
    const [search, setSearch]         = useState('');
    const [healthFilter, setHealthFilter] = useState<string>(''); // '' = all
    const [page, setPage]             = useState(1);
    const [selectedRow, setSelectedRow] = useState<ScheduleTrackingRow | null>(null);
    const debouncedSearch = useDebounced(search, 300);

    useEffect(() => {
        if (!projectId && projects.length > 0) {
            setProjectId(projects[0].id);
        }
    }, [projects, projectId]);
    // Drop a stale selection if the picked project completed since last load.
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
            <div>
                <h1 className="text-2xl font-bold tracking-tight text-[#171717]">{t('schedule_tracking')}</h1>
                <p className="text-[#8a8a8a] mt-1">
                    {t('schedule_tracking_description')}
                </p>
            </div>

            <SimulatedDateBar />

            {/* Controls */}
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div className="flex flex-wrap items-end gap-3 w-full md:max-w-4xl">
                    <div className="space-y-1 max-w-full">
                        <label className="text-xs text-[#8a8a8a]">{t('project')}</label>
                        <Select value={projectId} onValueChange={setProjectId}>
                            <SelectTrigger className="w-auto max-w-[min(100%,640px)]">
                                <SelectValue placeholder={t('pick_a_project')} />
                            </SelectTrigger>
                            <SelectContent className="max-w-[640px]">
                                {projects.map((p) => (
                                    <SelectItem key={p.id} value={p.id}>
                                        {p.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1 flex-1 min-w-[220px]">
                        <label className="text-xs text-[#8a8a8a]">{t('search')}</label>
                        <div className="relative">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8a8a8a]" />
                            <Input
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder={t('search_phase_placeholder')}
                                className="pl-9"
                            />
                        </div>
                    </div>
                    <div className="space-y-1 min-w-[160px]">
                        <label className="text-xs text-[#8a8a8a]">{t('health')}</label>
                        <Select value={healthFilter || 'all'} onValueChange={(v) => setHealthFilter(v === 'all' ? '' : v)}>
                            <SelectTrigger className="w-full min-w-0"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">{t('all')}</SelectItem>
                                {HEALTH_OPTION_KEYS.map((o) => (
                                    <SelectItem key={o.value} value={o.value}>{t(o.labelKey)}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </div>

            {/* Project rollup strip */}
            {summary && (
                <Card variant="plain">
                    <CardContent className="p-4 grid grid-cols-2 md:grid-cols-8 gap-3 text-sm">
                        <Stat label="Estimated" value={`${summary.totalEstimatedHours}h`} />
                        <Stat label="Progress"  value={`${summary.totalProgressHours}h`} />
                        <Stat label="Used"      value={`${summary.totalUsedHours}h`} />
                        <Stat
                            label="Progress Status"
                            value={`${summary.varianceHours > 0 ? '+' : ''}${summary.varianceHours}h`}
                            valueClassName={summary.varianceHours < 0 ? 'text-rose-700' : 'text-emerald-700'}
                        />
                        <Stat
                            label="Extra Hours"
                            value={`${summary.lateHours > 0 ? '+' : ''}${summary.lateHours}h`}
                            valueClassName={summary.lateHours > 0 ? 'text-amber-700' : ''}
                        />
                        <div>
                            <div className="text-[10px] uppercase text-[#8a8a8a]">{t('health')}</div>
                            <ScheduleHealthBadge health={summary.health} />
                            <div className="text-xs text-[#8a8a8a] mt-1">
                                {t('phases_done_summary', { done: summary.completedCount, total: summary.phaseCount })}
                            </div>
                        </div>
                        {/* Today-only stats grouped on the right, separated from the cumulative ones by a vertical divider. */}
                        <Stat
                            label="Expected (today)"
                            value={`${summary.todayExpectedHours}h`}
                            wrapperClassName="md:border-l-2 md:border-slate-300 md:pl-4"
                        />
                        <Stat label="Finish Today" value={`${summary.todayProgressHours}h`} />
                    </CardContent>
                </Card>
            )}

            {/* Data list */}
            <Card variant="plain">
                <CardContent className="p-0">
                    <Table>
                        <TableHeader className="bg-white">
                            <TableRow>
                                <TableHead className="w-[120px]">Function ID</TableHead>
                                <TableHead>Function</TableHead>
                                <TableHead className="w-[140px]">Phase</TableHead>
                                <TableHead className="w-[160px]">Assignee</TableHead>
                                <TableHead className="w-[180px]">Planned</TableHead>
                                <TableHead className="w-[80px] text-right">Est</TableHead>
                                <TableHead className="w-[80px] text-right">Prog</TableHead>
                                <TableHead className="w-[80px] text-right">Used</TableHead>
                                <TableHead className="w-[120px] text-right">Progress Status</TableHead>
                                <TableHead className="w-[120px]">Health</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {listQuery.isLoading ? (
                                <TableRow><TableCell colSpan={10} className="py-12"><LoadingState message={t('loading_tracking_data')} /></TableCell></TableRow>
                            ) : rows.length === 0 ? (
                                <TableRow><TableCell colSpan={10} className="py-10 text-center text-[#8a8a8a]">{t('no_phases_match_filters')}</TableCell></TableRow>
                            ) : rows.map((row) => (
                                <TableRow key={row.id} className="cursor-pointer hover:bg-[#fafbfc]" onClick={() => setSelectedRow(row)}>
                                    <TableCell className="text-xs text-[#8a8a8a]">{row.functionId ?? '—'}</TableCell>
                                    <TableCell className="font-medium">{row.functionName}</TableCell>
                                    <TableCell>
                                        <Badge variant="outline" className="text-xs">{row.phaseName}</Badge>
                                    </TableCell>
                                    <TableCell>{row.assigneeName ?? <span className="text-[#8a8a8a]">—</span>}</TableCell>
                                    <TableCell className="text-xs">
                                        {row.plannedStart} → {row.plannedEnd}
                                    </TableCell>
                                    <TableCell className="text-right">{row.estimatedHours}h</TableCell>
                                    <TableCell className="text-right">{row.variance.cumulativeProgressHours}h</TableCell>
                                    <TableCell className="text-right">{row.variance.cumulativeUsedHours}h</TableCell>
                                    <TableCell className={`text-right font-medium ${row.variance.varianceHours < 0 ? 'text-rose-700' : row.variance.varianceHours > 0 ? 'text-emerald-700' : ''}`}>
                                        {row.variance.varianceHours > 0 ? '+' : ''}{row.variance.varianceHours}h
                                    </TableCell>
                                    <TableCell><ScheduleHealthBadge health={row.variance.health} /></TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {/* Pagination */}
            {meta.total ? (
                <div className="flex items-center justify-between text-sm text-[#8a8a8a]">
                    <div>{t('n_of_total_phases', { shown: rows.length, total: meta.total })}</div>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" disabled={page <= 1 || listQuery.isFetching} onClick={() => setPage((p) => Math.max(1, p - 1))}>{t('previous')}</Button>
                        <span className="px-2">{t('page_x_of_y', { current: meta.current_page ?? page, total: meta.last_page ?? 1 })}</span>
                        <Button variant="outline" size="sm" disabled={(meta.current_page ?? page) >= (meta.last_page ?? 1) || listQuery.isFetching} onClick={() => setPage((p) => p + 1)}>{t('next')}</Button>
                    </div>
                </div>
            ) : null}

            {/* Per-assignee rollup */}
            {byAssignee.data && byAssignee.data.length > 0 && (
                <Card variant="plain">
                    <CardContent className="p-0">
                        <div className="px-4 py-3 border-b border-[#e6e9ee] bg-[#fafbfc]">
                            <h2 className="font-semibold">{t('by_assignee')}</h2>
                            <p className="text-xs text-[#8a8a8a]">{t('most_behind_first')}</p>
                        </div>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Assignee</TableHead>
                                    <TableHead className="text-right">Estimated</TableHead>
                                    <TableHead className="text-right">Progress</TableHead>
                                    <TableHead className="text-right">Used</TableHead>
                                    <TableHead className="text-right">Progress Status</TableHead>
                                    <TableHead className="text-right">Extra Hours</TableHead>
                                    <TableHead className="text-right">Health</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {byAssignee.data.map((a) => (
                                    <TableRow key={a.assigneeId}>
                                        <TableCell className="font-medium">{a.assigneeName ?? a.assigneeId}</TableCell>
                                        <TableCell className="text-right">{a.totalEstimatedHours}h</TableCell>
                                        <TableCell className="text-right">{a.totalProgressHours}h</TableCell>
                                        <TableCell className="text-right">{a.totalUsedHours}h</TableCell>
                                        <TableCell className={`text-right font-medium ${a.varianceHours < 0 ? 'text-rose-700' : a.varianceHours > 0 ? 'text-emerald-700' : ''}`}>
                                            {a.varianceHours > 0 ? '+' : ''}{a.varianceHours}h
                                        </TableCell>
                                        <TableCell className={`text-right font-medium ${a.lateHours > 0 ? 'text-amber-700' : 'text-slate-400'}`}>
                                            {a.lateHours > 0 ? `+${a.lateHours}` : a.lateHours}h
                                        </TableCell>
                                        <TableCell className="text-right"><ScheduleHealthBadge health={a.health} /></TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
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

function Stat({ label, value, valueClassName = '', wrapperClassName = '' }: { label: string; value: string; valueClassName?: string; wrapperClassName?: string }) {
    return (
        <div className={wrapperClassName}>
            <div className="text-[10px] uppercase text-[#8a8a8a]">{label}</div>
            <div className={`font-medium ${valueClassName}`}>{value}</div>
        </div>
    );
}
