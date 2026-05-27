'use client';

import { Fragment, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Loader2, ListTree, Search, X, Users } from 'lucide-react';
import {
    useProjectTaskAssignments,
    useProjectTaskMutations,
    useProjectTeam,
    useCheckReassignment,
    useReassignPhase,
} from '@/lib/queries/projects';
import { useScheduleTrackingList } from '@/lib/queries/scheduleTracking';
import { ScheduleHealthBadge } from '@/components/schedule-tracking/ScheduleHealthBadge';
import { useAsOfParam } from '@/components/SimulatedDateBar';
import { PhaseDrillDownDrawer } from '@/components/schedule-tracking/PhaseDrillDownDrawer';
import { ReassignConflictDialog } from '@/components/time-tracking/ReassignConflictDialog';
import type {
    ProjectTaskPhaseAssignment,
    ReassignmentCheck,
    ScheduleTrackingRow,
    TaskDifficulty,
    TaskStatus,
} from '@/types/business';

const PHASE_BG: Record<string, string> = {
    development:   'bg-blue-100',
    basic_doc:     'bg-violet-100',
    detail_doc:    'bg-purple-100',
    requirement:   'bg-teal-100',
    system_arch:   'bg-cyan-100',
    unit_test:     'bg-amber-100',
    combine_test:  'bg-orange-100',
    system_test:   'bg-emerald-100',
};

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
    const [showTeamStructure, setShowTeamStructure] = useState(false);

    // Phase reassignment with conflict detection
    const checkReassignment = useCheckReassignment(projectId);
    const reassignPhase = useReassignPhase(projectId);
    const [pendingReassignment, setPendingReassignment] = useState<{
        phaseId: string;
        phaseName: string;
        functionName: string;
        currentAssigneeName: string;
        currentPlannedStart: string | null;
        currentPlannedEnd: string | null;
        currentEstimatedHours: number;
        newAssigneeId: string;
        newAssigneeName: string;
        check: ReassignmentCheck;
    } | null>(null);

    const handleAssigneeChange = (cell: ProjectTaskPhaseAssignment, newAssigneeId: string | null, functionName: string) => {
        if (!newAssigneeId || newAssigneeId === cell.assigneeId) {
            if (!newAssigneeId) update(cell.id, { assigneeId: null });
            return;
        }
        checkReassignment.mutate(
            { phaseAssignmentId: cell.id, assigneeId: newAssigneeId },
            {
                onSuccess: (result) => {
                    if (!result.hasConflicts) {
                        reassignPhase.mutate({
                            phaseAssignmentId: cell.id,
                            assigneeId: newAssigneeId,
                            mode: 'direct',
                        });
                    } else {
                        const member = team.find((m) => m.employeeId === newAssigneeId);
                        setPendingReassignment({
                            phaseId: cell.id,
                            phaseName: `${cell.phaseName}`,
                            functionName,
                            currentAssigneeName: cell.assigneeName ?? '—',
                            currentPlannedStart: cell.plannedStart,
                            currentPlannedEnd: cell.plannedEnd,
                            currentEstimatedHours: cell.estimatedHours,
                            newAssigneeId,
                            newAssigneeName: member?.employeeName ?? newAssigneeId,
                            check: result,
                        });
                    }
                },
            },
        );
    };

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
        <Card className="shadow-sm border-[#e6e9ee]">
            <div className="px-6 space-y-6">
                <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2 text-base">
                        <ListTree className="h-4 w-4 text-indigo-600" />
                        {t('master_assign_table')}
                        {tasksQuery.isFetching && (
                            <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                        )}
                    </CardTitle>
                    <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 text-xs"
                        onClick={() => setShowTeamStructure(true)}
                        disabled={teamQuery.isLoading}
                    >
                        <Users className="h-3.5 w-3.5" />
                        {t('view_team_structure')}
                    </Button>
                </div>
                {tasksQuery.isLoading ? (
                    <div className="py-10 text-center text-slate-500 text-sm">{t('loading_task_assignments')}</div>
                ) : tasks.length === 0 ? (
                    <div className="py-10 text-center text-slate-500 text-sm">
                        {t('no_task_assignments')}
                    </div>
                ) : (
                    <>
                    <div className="flex flex-wrap items-center gap-2.5 rounded-lg bg-slate-50 border border-slate-200 px-3 py-2.5">
                        <div className="relative flex-1 min-w-[220px] max-w-[360px]">
                            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
                            <Input
                                type="search"
                                value={searchText}
                                onChange={(e) => setSearchText(e.target.value)}
                                placeholder="Search FunctionID or 機能名"
                                className="h-9 pl-8 pr-2 text-xs bg-white border-slate-300 shadow-sm"
                            />
                        </div>
                        <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
                            <SelectTrigger className="h-9 w-[180px] text-xs bg-white border-slate-300 shadow-sm">
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
                            <SelectTrigger className="h-9 w-[160px] text-xs bg-white border-slate-300 shadow-sm">
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
                                className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700 shadow-sm hover:bg-slate-50"
                            >
                                <X className="h-3 w-3" />
                                Clear
                            </button>
                        )}
                        <span className="ml-auto text-xs font-medium text-slate-500 tabular-nums">
                            {filteredTasks.length} / {tasks.length}
                        </span>
                    </div>
                    {filteredTasks.length === 0 ? (
                        <div className="py-10 text-center text-slate-500 text-sm">
                            No tasks match the current filters.
                        </div>
                    ) : (
                    <div className="overflow-x-auto rounded-lg border-2 border-slate-300">
                        <table className="w-full border-collapse text-xs">
                            <thead>
                                <tr className="border-b-2 border-slate-300">
                                    <th rowSpan={2} className="px-3 py-2.5 border-r-2 border-slate-300 text-left font-semibold text-slate-500 uppercase tracking-wider text-[10px] bg-slate-50 w-[50px]">{t('col_no')}</th>
                                    <th rowSpan={2} className="px-3 py-2.5 border-r-2 border-slate-300 text-left font-semibold text-slate-500 uppercase tracking-wider text-[10px] bg-slate-50 w-[110px]">{t('col_function_id')}</th>
                                    <th rowSpan={2} className="px-3 py-2.5 border-r-2 border-slate-300 text-left font-semibold text-slate-500 uppercase tracking-wider text-[10px] bg-slate-50 min-w-[160px]">{t('col_function_name_jp')}</th>
                                    <th rowSpan={2} className="px-3 py-2.5 border-r-2 border-slate-300 text-left font-semibold text-slate-500 uppercase tracking-wider text-[10px] bg-slate-50 w-[70px]">{t('col_difficulty')}</th>
                                    {visibleActivePhases.map((p) => (
                                        <th key={p.code} colSpan={7} className={`px-2 py-2.5 border-l-2 border-slate-300 text-center font-semibold text-slate-700 text-[11px] ${PHASE_BG[p.code] ?? 'bg-slate-100'}`}>
                                            {p.name}
                                        </th>
                                    ))}
                                </tr>
                                <tr className="border-b-2 border-slate-300 bg-slate-50/80">
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
                                                        <td className="px-2 py-1 border-l-2 border-slate-300 text-right tabular-nums text-slate-600 w-[60px]">
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
                                                                onValueChange={(v) => handleAssigneeChange(cell, v || null, task.functionName)}
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
            </div>
            <PhaseDrillDownDrawer
                open={!!drillRow}
                onClose={() => setDrillRow(null)}
                row={drillRow}
                isManager
            />
            {pendingReassignment && (
                <ReassignConflictDialog
                    open
                    check={pendingReassignment.check}
                    phaseName={pendingReassignment.phaseName}
                    functionName={pendingReassignment.functionName}
                    currentAssigneeName={pendingReassignment.currentAssigneeName}
                    currentPlannedStart={pendingReassignment.currentPlannedStart}
                    currentPlannedEnd={pendingReassignment.currentPlannedEnd}
                    currentEstimatedHours={pendingReassignment.currentEstimatedHours}
                    newAssigneeName={pendingReassignment.newAssigneeName}
                    isLoading={reassignPhase.isPending}
                    onCancel={() => setPendingReassignment(null)}
                    onSwap={(conflictPhaseId) => {
                        reassignPhase.mutate(
                            {
                                phaseAssignmentId: pendingReassignment.phaseId,
                                assigneeId: pendingReassignment.newAssigneeId,
                                mode: 'swap',
                                swapWithId: conflictPhaseId,
                            },
                            { onSettled: () => setPendingReassignment(null) },
                        );
                    }}
                />
            )}
            <TeamStructureDialog
                open={showTeamStructure}
                onClose={() => setShowTeamStructure(false)}
                team={team}
                isLoading={teamQuery.isLoading}
            />
        </Card>
    );
}

// ── Team Structure Dialog ────────────────────────────────────────────────────

function TeamStructureDialog({
    open,
    onClose,
    team,
    isLoading,
}: {
    open: boolean;
    onClose: () => void;
    team: import('@/types/business').ProjectTeamAssignment[];
    isLoading: boolean;
}) {
    const t = useTranslations();

    const grouped = useMemo(() => {
        const map = new Map<string, typeof team>();
        for (const m of team) {
            const dept = m.departmentName ?? t('no_department');
            if (!map.has(dept)) map.set(dept, []);
            map.get(dept)!.push(m);
        }
        return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
    }, [team, t]);

    return (
        <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
            <DialogContent className="max-w-[560px] p-0 gap-0 overflow-hidden">
                <div className="px-6 pt-5 pb-4 border-b border-slate-200">
                    <DialogHeader className="gap-1">
                        <DialogTitle className="flex items-center gap-2 text-base">
                            <Users className="h-4.5 w-4.5 text-indigo-600" />
                            {t('view_team_structure')}
                        </DialogTitle>
                        <DialogDescription className="text-[13px]">
                            {team.length} {t('members')}
                        </DialogDescription>
                    </DialogHeader>
                </div>
                <div className="px-6 py-4 max-h-[60vh] overflow-y-auto">
                    {isLoading ? (
                        <div className="py-10 text-center text-slate-400 text-sm">
                            <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
                            {t('loading')}...
                        </div>
                    ) : team.length === 0 ? (
                        <div className="py-10 text-center text-slate-400 text-sm">
                            {t('no_team_members')}
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {grouped.map(([dept, members]) => (
                                <div key={dept}>
                                    <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
                                        {dept}
                                    </div>
                                    <div className="rounded-lg border border-slate-200 overflow-hidden">
                                        <table className="w-full text-xs">
                                            <thead>
                                                <tr className="bg-slate-50 border-b border-slate-200">
                                                    <th className="text-left px-3 py-2 font-medium text-slate-600">{t('name')}</th>
                                                    <th className="text-left px-3 py-2 font-medium text-slate-600">{t('rank')}</th>
                                                    <th className="text-right px-3 py-2 font-medium text-slate-600">{t('allocated_hours')}</th>
                                                    <th className="text-left px-3 py-2 font-medium text-slate-600">{t('source')}</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {members.map((m, i) => (
                                                    <tr
                                                        key={m.id}
                                                        className={i < members.length - 1 ? 'border-b border-slate-100' : ''}
                                                    >
                                                        <td className="px-3 py-2.5 font-medium text-slate-800">
                                                            {m.employeeName ?? m.employeeId}
                                                        </td>
                                                        <td className="px-3 py-2.5 text-slate-600">
                                                            {m.rankName ?? '—'}
                                                            {m.rankCode && (
                                                                <span className="ml-1 text-[10px] text-slate-400">({m.rankCode})</span>
                                                            )}
                                                        </td>
                                                        <td className="px-3 py-2.5 text-right font-mono text-slate-700">
                                                            {m.allocatedHours}h
                                                        </td>
                                                        <td className="px-3 py-2.5">
                                                            <Badge
                                                                variant="outline"
                                                                className={
                                                                    m.assignmentSource === 'ai'
                                                                        ? 'text-[10px] border-indigo-200 text-indigo-600 bg-indigo-50'
                                                                        : 'text-[10px] border-slate-200 text-slate-500'
                                                                }
                                                            >
                                                                {m.assignmentSource === 'ai' ? 'AI' : m.assignmentSource === 'deal_transfer' ? 'Deal' : 'Manual'}
                                                            </Badge>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}

// Seven blank cells matching the populated phase column widths. A single
// colSpan={7} cell shrinks because there's no content driving the widths;
// rendering each sub-column individually keeps the table aligned with rows
// that do have data.
function BlankPhaseCells() {
    return (
        <>
            <td className="px-2 py-1 border-l-2 border-slate-300 w-[60px] text-center text-slate-300">—</td>
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
    const sub = "px-2 py-2 text-left font-medium text-slate-500 text-[10px] uppercase tracking-wide whitespace-nowrap";
    return (
        <>
            <th className={`${sub} border-l-2 border-slate-300 text-right`}>{t('col_hours_jp')}</th>
            <th className={sub}>{t('col_assignee_jp')}</th>
            <th className={sub}>{t('col_planned_start_jp')}</th>
            <th className={sub}>{t('col_planned_end_jp')}</th>
            <th className={sub}>{t('col_actual_start_jp')}</th>
            <th className={sub}>{t('col_actual_end_jp')}</th>
            <th className={`${sub} border-r border-slate-200`}>{t('col_status_jp')}</th>
        </>
    );
}
