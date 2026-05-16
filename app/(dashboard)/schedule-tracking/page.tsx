'use client';

import { useEffect, useMemo, useState } from 'react';
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

const HEALTH_OPTIONS: Array<{ value: string; label: string }> = [
    { value: 'on_track', label: 'On Track' },
    { value: 'at_risk',  label: 'At Risk' },
    { value: 'slipping', label: 'Slipping' },
];

export default function ScheduleTrackingPage() {
    const projectsQuery = useProjectList();
    const projects = projectsQuery.data?.data ?? [];

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
                <h1 className="text-2xl font-bold tracking-tight text-[#171717]">Schedule Tracking</h1>
                <p className="text-[#8a8a8a] mt-1">
                    Per-phase progress vs plan across the whole project. Click a row for the day-by-day log history.
                </p>
            </div>

            <SimulatedDateBar />

            {/* Controls */}
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 w-full md:max-w-3xl">
                    <div className="space-y-1">
                        <label className="text-xs text-[#8a8a8a]">Project</label>
                        <Select value={projectId} onValueChange={setProjectId}>
                            <SelectTrigger><SelectValue placeholder="Pick a project" /></SelectTrigger>
                            <SelectContent>
                                {projects.map((p) => (
                                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs text-[#8a8a8a]">Search</label>
                        <div className="relative">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8a8a8a]" />
                            <Input
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Function name, ID, or assignee…"
                                className="pl-9"
                            />
                        </div>
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs text-[#8a8a8a]">Health</label>
                        <Select value={healthFilter || 'all'} onValueChange={(v) => setHealthFilter(v === 'all' ? '' : v)}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All</SelectItem>
                                {HEALTH_OPTIONS.map((o) => (
                                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </div>

            {/* Project rollup strip */}
            {summary && (
                <Card className="shadow-sm border-[#e6e9ee]">
                    <CardContent className="p-4 grid grid-cols-2 md:grid-cols-6 gap-3 text-sm">
                        <Stat label="Estimated" value={`${summary.totalEstimatedHours}h`} />
                        <Stat label="Progress"  value={`${summary.totalProgressHours}h`} />
                        <Stat label="Used"      value={`${summary.totalUsedHours}h`} />
                        <Stat label="Expected (today)" value={`${summary.expectedProgressHours}h`} />
                        <Stat
                            label="Variance"
                            value={`${summary.varianceHours > 0 ? '+' : ''}${summary.varianceHours}h`}
                            valueClassName={summary.varianceHours < 0 ? 'text-rose-700' : 'text-emerald-700'}
                        />
                        <div>
                            <div className="text-[10px] uppercase text-[#8a8a8a]">Health</div>
                            <ScheduleHealthBadge health={summary.health} />
                            <div className="text-xs text-[#8a8a8a] mt-1">
                                {summary.completedCount}/{summary.phaseCount} phases done
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Data list */}
            <Card className="shadow-sm border-[#e6e9ee]">
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
                                <TableHead className="w-[100px] text-right">Variance</TableHead>
                                <TableHead className="w-[120px]">Health</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {listQuery.isLoading ? (
                                <TableRow><TableCell colSpan={10} className="py-12"><LoadingState message="Loading tracking data…" /></TableCell></TableRow>
                            ) : rows.length === 0 ? (
                                <TableRow><TableCell colSpan={10} className="py-10 text-center text-[#8a8a8a]">No phases match the current filters.</TableCell></TableRow>
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
                    <div>{rows.length} of {meta.total} phases</div>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" disabled={page <= 1 || listQuery.isFetching} onClick={() => setPage((p) => Math.max(1, p - 1))}>Previous</Button>
                        <span className="px-2">Page {meta.current_page ?? page} of {meta.last_page ?? 1}</span>
                        <Button variant="outline" size="sm" disabled={(meta.current_page ?? page) >= (meta.last_page ?? 1) || listQuery.isFetching} onClick={() => setPage((p) => p + 1)}>Next</Button>
                    </div>
                </div>
            ) : null}

            {/* Per-assignee rollup */}
            {byAssignee.data && byAssignee.data.length > 0 && (
                <Card className="shadow-sm border-[#e6e9ee]">
                    <CardContent className="p-0">
                        <div className="px-4 py-3 border-b border-[#e6e9ee] bg-[#fafbfc]">
                            <h2 className="font-semibold">By Assignee</h2>
                            <p className="text-xs text-[#8a8a8a]">Most behind first.</p>
                        </div>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Assignee</TableHead>
                                    <TableHead className="text-right">Estimated</TableHead>
                                    <TableHead className="text-right">Progress</TableHead>
                                    <TableHead className="text-right">Used</TableHead>
                                    <TableHead className="text-right">Variance</TableHead>
                                    <TableHead>Health</TableHead>
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
                                        <TableCell><ScheduleHealthBadge health={a.health} /></TableCell>
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

function Stat({ label, value, valueClassName = '' }: { label: string; value: string; valueClassName?: string }) {
    return (
        <div>
            <div className="text-[10px] uppercase text-[#8a8a8a]">{label}</div>
            <div className={`font-medium ${valueClassName}`}>{value}</div>
        </div>
    );
}
