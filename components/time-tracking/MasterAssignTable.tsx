'use client';

import { Fragment, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Loader2, ListTree, Search, X } from 'lucide-react';
import {
    useProjectTaskAssignments,
    useProjectTaskMutations,
    useProjectTeam,
} from '@/lib/queries/projects';
import { useScheduleTrackingList } from '@/lib/queries/scheduleTracking';
import { ScheduleHealthBadge } from '@/components/schedule-tracking/ScheduleHealthBadge';
import { useAsOfParam } from '@/components/SimulatedDateBar';
import { PhaseDrillDownDrawer } from '@/components/schedule-tracking/PhaseDrillDownDrawer';
import type {
    ProjectTaskPhaseAssignment,
    ScheduleTrackingRow,
    TaskDifficulty,
    TaskStatus,
} from '@/types/business';

const DIFFICULTY_VARIANTS: Record<TaskDifficulty, string> = {
    '簡単':   'bg-slate-100 text-slate-700 border-slate-200',
    '普通':   'bg-amber-50 text-amber-700 border-amber-200',
    '難しい': 'bg-red-50 text-red-700 border-red-200',
    '':       'bg-slate-50 text-slate-500 border-slate-200',
};

const STATUS_VARIANTS: Record<TaskStatus, string> = {
    '未着手': 'bg-slate-100 text-slate-700 border-slate-200',
    '進行中': 'bg-indigo-50 text-indigo-700 border-indigo-200',
    '完了':   'bg-emerald-50 text-emerald-700 border-emerald-200',
};

const STATUS_VALUES: TaskStatus[] = ['未着手', '進行中', '完了'];

interface Props {
    projectId: string;
}

export function MasterAssignTable({ projectId }: Props) {
    const t = useTranslations();
    const tasksQuery = useProjectTaskAssignments(projectId);
    const teamQuery = useProjectTeam(projectId);
    const { updatePhaseAssignment } = useProjectTaskMutations(projectId);
    // Pull all schedule-tracking rows for this project so each phase cell can
    // show its variance/health badge. Large per_page to avoid pagination here.
    // `as_of` threads the simulated-today override through so badges recompute
    // when the user picks a test date.
    const asOf = useAsOfParam();
    const trackingQuery = useScheduleTrackingList(projectId, { per_page: 100, ...(asOf ? { as_of: asOf } : {}) });

    const tasks = useMemo(() => tasksQuery.data?.data ?? [], [tasksQuery.data]);
    const activePhases = useMemo(() => tasksQuery.data?.meta?.activePhases ?? [], [tasksQuery.data]);
    const team = teamQuery.data ?? [];

    const trackingByPhaseId = useMemo(() => {
        const map = new Map<string, ScheduleTrackingRow>();
        for (const row of trackingQuery.data?.data ?? []) {
            map.set(row.id, row);
        }
        return map;
    }, [trackingQuery.data]);

    const [drillRow, setDrillRow] = useState<ScheduleTrackingRow | null>(null);

    // Client-side filters. Search by FunctionID/機能名, narrow to rows that
    // touch a specific assignee (or "Unassigned"), or to rows where at least
    // one phase is in the selected status. All three combine with AND.
    const [searchText, setSearchText] = useState('');
    const [assigneeFilter, setAssigneeFilter] = useState<string>('all');
    const [statusFilter, setStatusFilter] = useState<'all' | TaskStatus>('all');

    // Dropdown options come from the assignees actually present in the loaded
    // phases — supplemented by the project team list. Sourcing from phases is
    // critical: if a team member's UUID drifts (re-added employee, AI assigned
    // an old record, etc.), the grid still shows their old UUID and the team
    // list shows the new one. Picking the new one would filter to nothing.
    // We key by assignee_id and prefer the phase's `assignee_name` so the
    // dropdown label matches what's rendered in the row.
    const assigneeOptions = useMemo(() => {
        const byId = new Map<string, string>(); // id -> display name
        for (const t of tasks) {
            for (const p of t.phases) {
                if (p.assigneeId && !byId.has(p.assigneeId)) {
                    byId.set(p.assigneeId, p.assigneeName ?? p.assigneeId);
                }
            }
        }
        for (const m of team) {
            if (m.employeeId && !byId.has(m.employeeId)) {
                byId.set(m.employeeId, m.employeeName ?? m.employeeId);
            }
        }
        return Array.from(byId, ([id, name]) => ({ id, name }))
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [tasks, team]);

    const filteredTasks = useMemo(() => {
        const needle = searchText.trim().toLowerCase();
        return tasks.filter((t) => {
            if (needle) {
                const hay = `${t.functionId ?? ''} ${t.functionName ?? ''}`.toLowerCase();
                if (!hay.includes(needle)) return false;
            }
            if (assigneeFilter !== 'all') {
                const matched = t.phases.some((p) =>
                    assigneeFilter === 'unassigned'
                        ? !p.assigneeId
                        : p.assigneeId === assigneeFilter,
                );
                if (!matched) return false;
            }
            if (statusFilter !== 'all') {
                const matched = t.phases.some((p) => p.status === statusFilter);
                if (!matched) return false;
            }
            return true;
        });
    }, [tasks, searchText, assigneeFilter, statusFilter]);

    // Hide phase columns entirely when the assignee/status filter is on AND
    // no row in the filtered set has a matching cell in that phase. Empty
    // columns reserved at full width make the grid sparse and hard to read.
    // When no filter is active, every active phase shows (legacy behavior).
    const visibleActivePhases = useMemo(() => {
        if (assigneeFilter === 'all' && statusFilter === 'all') {
            return activePhases;
        }
        const cellMatches = (p: ProjectTaskPhaseAssignment) => {
            if (assigneeFilter !== 'all') {
                const ok = assigneeFilter === 'unassigned'
                    ? !p.assigneeId
                    : p.assigneeId === assigneeFilter;
                if (!ok) return false;
            }
            if (statusFilter !== 'all' && p.status !== statusFilter) return false;
            return true;
        };
        const keep = new Set<string>();
        for (const t of filteredTasks) {
            for (const p of t.phases) {
                if (cellMatches(p)) keep.add(p.phaseCode);
            }
        }
        return activePhases.filter((p) => keep.has(p.code));
    }, [activePhases, filteredTasks, assigneeFilter, statusFilter]);

    const hasActiveFilter = searchText.trim() !== '' || assigneeFilter !== 'all' || statusFilter !== 'all';
    const clearFilters = () => {
        setSearchText('');
        setAssigneeFilter('all');
        setStatusFilter('all');
    };

    const update = (phaseAssignmentId: string, updates: Partial<ProjectTaskPhaseAssignment>) => {
        updatePhaseAssignment.mutate({ phaseAssignmentId, updates });
    };

    return (
        <Card variant="plain">
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="flex items-center gap-2 text-base">
                            <ListTree className="h-4 w-4 text-indigo-600" />
                            {t('master_assign_table')}
                        </CardTitle>
                        <CardDescription>
                            {t('master_assign_desc')}
                        </CardDescription>
                    </div>
                    {tasksQuery.isFetching && (
                        <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                    )}
                </div>
            </CardHeader>
            <CardContent>
                {tasksQuery.isLoading ? (
                    <div className="py-10 text-center text-slate-500 text-sm">{t('loading_task_assignments')}</div>
                ) : tasks.length === 0 ? (
                    <div className="py-10 text-center text-slate-500 text-sm">
                        {t('no_task_assignments')}
                    </div>
                ) : (
                    <>
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                        <div className="relative flex-1 min-w-[220px] max-w-[360px]">
                            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                            <Input
                                type="search"
                                value={searchText}
                                onChange={(e) => setSearchText(e.target.value)}
                                placeholder="Search FunctionID or 機能名"
                                className="h-8 pl-7 pr-2 text-xs"
                            />
                        </div>
                        <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
                            <SelectTrigger className="h-8 w-[180px] text-xs">
                                <SelectValue placeholder="Assignee" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All assignees</SelectItem>
                                <SelectItem value="unassigned">Unassigned</SelectItem>
                                {assigneeOptions.map((m) => (
                                    <SelectItem key={m.id} value={m.id}>
                                        {m.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as 'all' | TaskStatus)}>
                            <SelectTrigger className="h-8 w-[160px] text-xs">
                                <SelectValue placeholder="Status" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All statuses</SelectItem>
                                {STATUS_VALUES.map((s) => (
                                    <SelectItem key={s} value={s}>{s}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {hasActiveFilter && (
                            <button
                                type="button"
                                onClick={clearFilters}
                                className="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
                            >
                                <X className="h-3 w-3" />
                                Clear
                            </button>
                        )}
                        <span className="ml-auto text-xs text-slate-500 tabular-nums">
                            {filteredTasks.length} / {tasks.length}
                        </span>
                    </div>
                    {filteredTasks.length === 0 ? (
                        <div className="py-10 text-center text-slate-500 text-sm">
                            No tasks match the current filters.
                        </div>
                    ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse text-xs">
                            <thead>
                                <tr className="bg-slate-50 border-b border-slate-200">
                                    <th rowSpan={2} className="px-2 py-2 border-r border-slate-200 text-left font-medium text-slate-700 w-[50px]">{t('col_no')}</th>
                                    <th rowSpan={2} className="px-2 py-2 border-r border-slate-200 text-left font-medium text-slate-700 w-[110px]">{t('col_function_id')}</th>
                                    <th rowSpan={2} className="px-2 py-2 border-r border-slate-200 text-left font-medium text-slate-700 min-w-[160px]">{t('col_function_name_jp')}</th>
                                    <th rowSpan={2} className="px-2 py-2 border-r border-slate-200 text-left font-medium text-slate-700 w-[70px]">{t('col_difficulty')}</th>
                                    {visibleActivePhases.map((p) => (
                                        <th key={p.code} colSpan={7} className="px-2 py-2 border-l-2 border-slate-300 border-r border-slate-200 text-center font-semibold text-indigo-700 bg-indigo-50/40">
                                            {p.name}
                                        </th>
                                    ))}
                                </tr>
                                <tr className="bg-slate-50 border-b border-slate-200">
                                    {visibleActivePhases.map((p) => (
                                        <PhaseSubHeaders key={p.code} />
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {filteredTasks.map((task) => {
                                    const byCode = new Map(task.phases.map((p) => [p.phaseCode, p]));
                                    // When an assignee or status filter is active, blank out
                                    // phase cells that don't match — so filtering by a manager
                                    // who only owns documentation phases doesn't keep dev/test
                                    // cells visible with other employees on the same row.
                                    const cellMatchesFilters = (p: ProjectTaskPhaseAssignment) => {
                                        if (assigneeFilter !== 'all') {
                                            const ok = assigneeFilter === 'unassigned'
                                                ? !p.assigneeId
                                                : p.assigneeId === assigneeFilter;
                                            if (!ok) return false;
                                        }
                                        if (statusFilter !== 'all' && p.status !== statusFilter) {
                                            return false;
                                        }
                                        return true;
                                    };
                                    return (
                                        <tr key={task.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                                            <td className="px-2 py-1.5 border-r border-slate-100 font-mono text-slate-500">{task.rowNo}</td>
                                            <td className="px-2 py-1.5 border-r border-slate-100 font-mono">{task.functionId ?? '—'}</td>
                                            <td className="px-2 py-1.5 border-r border-slate-100 font-medium text-slate-700">{task.functionName}</td>
                                            <td className="px-2 py-1.5 border-r border-slate-100">
                                                <Badge variant="outline" className={DIFFICULTY_VARIANTS[task.difficulty]}>
                                                    {task.difficulty}
                                                </Badge>
                                            </td>
                                            {visibleActivePhases.map((p) => {
                                                const cell = byCode.get(p.code);
                                                if (!cell || !cellMatchesFilters(cell)) {
                                                    return <BlankPhaseCells key={p.code} />;
                                                }
                                                const tracking = trackingByPhaseId.get(cell.id);
                                                return (
                                                    <Fragment key={p.code}>
                                                        <td className="px-2 py-1 border-l-2 border-slate-200 text-right tabular-nums text-slate-600 w-[60px]">
                                                            <div className="flex items-center justify-end gap-1">
                                                                <span>{cell.estimatedHours}</span>
                                                                {tracking && tracking.variance.scheduleState !== 'pending' && (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => setDrillRow(tracking)}
                                                                        title={t('view_daily_progress')}
                                                                        className="cursor-pointer"
                                                                    >
                                                                        <ScheduleHealthBadge
                                                                            health={tracking.variance.health}
                                                                            varianceHours={tracking.variance.varianceHours}
                                                                            compact
                                                                        />
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td className="px-1.5 py-1 min-w-[150px]">
                                                            <Select
                                                                value={cell.assigneeId ?? ''}
                                                                onValueChange={(v) => update(cell.id, { assigneeId: v || null })}
                                                            >
                                                                <SelectTrigger className="h-7 text-xs">
                                                                    <SelectValue placeholder={t('unassigned_short')}>
                                                                        {cell.assigneeName ? (
                                                                            <span className="flex items-center gap-1">
                                                                                {cell.assigneeName}
                                                                                {cell.assigneeRankCode && (
                                                                                    <span className="text-[9px] text-slate-400">
                                                                                        ({cell.assigneeRankCode})
                                                                                    </span>
                                                                                )}
                                                                            </span>
                                                                        ) : t('unassigned_short')}
                                                                    </SelectValue>
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    {team.map((m) => (
                                                                        <SelectItem key={m.employeeId} value={m.employeeId}>
                                                                            {m.employeeName ?? m.employeeId}
                                                                        </SelectItem>
                                                                    ))}
                                                                </SelectContent>
                                                            </Select>
                                                        </td>
                                                        <td className="px-1.5 py-1 w-[125px]">
                                                            <Input
                                                                type="date"
                                                                className="h-7 text-xs px-1"
                                                                value={cell.plannedStart ?? ''}
                                                                onChange={(e) => update(cell.id, { plannedStart: e.target.value || null })}
                                                            />
                                                        </td>
                                                        <td className="px-1.5 py-1 w-[125px]">
                                                            <Input
                                                                type="date"
                                                                className="h-7 text-xs px-1"
                                                                value={cell.plannedEnd ?? ''}
                                                                onChange={(e) => update(cell.id, { plannedEnd: e.target.value || null })}
                                                            />
                                                        </td>
                                                        <td className="px-1.5 py-1 w-[125px]">
                                                            <Input
                                                                type="date"
                                                                className="h-7 text-xs px-1"
                                                                value={cell.actualStart ?? ''}
                                                                onChange={(e) => update(cell.id, { actualStart: e.target.value || null })}
                                                            />
                                                        </td>
                                                        <td className="px-1.5 py-1 w-[125px]">
                                                            <Input
                                                                type="date"
                                                                className="h-7 text-xs px-1"
                                                                value={cell.actualEnd ?? ''}
                                                                onChange={(e) => {
                                                                    const value = e.target.value || null;
                                                                    // Picking an actual_end means the phase is done —
                                                                    // auto-flip status to 完了 in the same PATCH so the
                                                                    // user doesn't have to update two cells.
                                                                    update(cell.id, value
                                                                        ? { actualEnd: value, status: '完了' }
                                                                        : { actualEnd: null });
                                                                }}
                                                            />
                                                        </td>
                                                        <td className="px-1.5 py-1 border-r border-slate-100 w-[110px]">
                                                            <Select
                                                                value={cell.status}
                                                                onValueChange={(v) => update(cell.id, { status: v as TaskStatus })}
                                                            >
                                                                <SelectTrigger className="h-7 text-xs">
                                                                    <SelectValue>
                                                                        <Badge variant="outline" className={STATUS_VARIANTS[cell.status]}>
                                                                            {cell.status}
                                                                        </Badge>
                                                                    </SelectValue>
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    {STATUS_VALUES.map((s) => (
                                                                        <SelectItem key={s} value={s}>{s}</SelectItem>
                                                                    ))}
                                                                </SelectContent>
                                                            </Select>
                                                        </td>
                                                    </Fragment>
                                                );
                                            })}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                    )}
                    </>
                )}
            </CardContent>
            <PhaseDrillDownDrawer
                open={!!drillRow}
                onClose={() => setDrillRow(null)}
                row={drillRow}
                isManager
            />
        </Card>
    );
}

// Seven blank cells matching the populated phase column widths. A single
// colSpan={7} cell shrinks because there's no content driving the widths;
// rendering each sub-column individually keeps the table aligned with rows
// that do have data.
function BlankPhaseCells() {
    return (
        <>
            <td className="px-2 py-1 border-l-2 border-slate-200 w-[60px] text-center text-slate-300">—</td>
            <td className="px-1.5 py-1 min-w-[150px]" />
            <td className="px-1.5 py-1 w-[125px]" />
            <td className="px-1.5 py-1 w-[125px]" />
            <td className="px-1.5 py-1 w-[125px]" />
            <td className="px-1.5 py-1 w-[125px]" />
            <td className="px-1.5 py-1 border-r border-slate-100 w-[110px]" />
        </>
    );
}

function PhaseSubHeaders() {
    const t = useTranslations();
    return (
        <>
            <th className="px-2 py-1.5 border-l-2 border-slate-300 text-right font-medium text-slate-600 bg-indigo-50/20">{t('col_hours_jp')}</th>
            <th className="px-2 py-1.5 text-left font-medium text-slate-600 bg-indigo-50/20">{t('col_assignee_jp')}</th>
            <th className="px-2 py-1.5 text-left font-medium text-slate-600 bg-indigo-50/20">{t('col_planned_start_jp')}</th>
            <th className="px-2 py-1.5 text-left font-medium text-slate-600 bg-indigo-50/20">{t('col_planned_end_jp')}</th>
            <th className="px-2 py-1.5 text-left font-medium text-slate-600 bg-indigo-50/20">{t('col_actual_start_jp')}</th>
            <th className="px-2 py-1.5 text-left font-medium text-slate-600 bg-indigo-50/20">{t('col_actual_end_jp')}</th>
            <th className="px-2 py-1.5 border-r border-slate-200 text-left font-medium text-slate-600 bg-indigo-50/20">{t('col_status_jp')}</th>
        </>
    );
}
