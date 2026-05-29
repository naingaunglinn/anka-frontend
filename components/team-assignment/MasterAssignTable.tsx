'use client';

import { Fragment, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Loader2, ListTree, Search, X, Users, ListFilter } from 'lucide-react';
import toast from 'react-hot-toast';
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
import { DirectAssignDialog, ConflictConfirmDialog, SwapWarningDialog } from '@/components/team-assignment/ReassignConflictDialog';
import { WorkingDayPicker } from '@/components/ui/working-day-picker';
import { useHolidays, expandHolidaysForYear } from '@/lib/queries/holidays';
import { useAuthStore } from '@/store/authStore';
import { hasPermission } from '@/lib/rbac';
import type {
    ProjectTaskPhaseAssignment,
    ReassignmentCheck,
    ReassignmentConflict,
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

function StatusBadge({ status }: { status: TaskStatus }) {
    return (
        <Badge variant="outline" className={`text-[10px] ${STATUS_VARIANTS[status]}`}>
            {status}
        </Badge>
    );
}

interface Props {
    projectId: string;
}

export function MasterAssignTable({ projectId }: Props) {
    const t = useTranslations();
    const tasksQuery = useProjectTaskAssignments(projectId);
    const teamQuery = useProjectTeam(projectId);
    const { updatePhaseAssignment, updatePhasePlannedDates } = useProjectTaskMutations(projectId);
    const holidaysQuery = useHolidays();
    const currentYear = new Date().getFullYear();
    const holidaysThisYear = useMemo(
        () => expandHolidaysForYear(holidaysQuery.data ?? [], currentYear),
        [holidaysQuery.data, currentYear],
    );
    const holidaysNextYear = useMemo(
        () => expandHolidaysForYear(holidaysQuery.data ?? [], currentYear + 1),
        [holidaysQuery.data, currentYear],
    );
    const holidaysMap = useMemo(
        () => ({ ...holidaysThisYear, ...holidaysNextYear }),
        [holidaysThisYear, holidaysNextYear],
    );
    const authUser = useAuthStore((s) => s.user);
    const canEditDates = hasPermission(authUser, 'manage_projects');
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

    // Phase reassignment — multi-step flow with confirmations
    const checkReassignment = useCheckReassignment(projectId);
    const reassignPhase = useReassignPhase(projectId);
    const [pendingCellId, setPendingCellId] = useState<string | null>(null);

    // Step 0 state: no conflicts, simple confirmation
    const [directAssign, setDirectAssign] = useState<{
        phaseId: string;
        phaseName: string;
        functionName: string;
        currentAssigneeName: string;
        plannedStart: string | null;
        plannedEnd: string | null;
        estimatedHours: number;
        newAssigneeId: string;
        newAssigneeName: string;
    } | null>(null);

    // Step 1 state: conflict detected, ask user Swap / Assign Anyway / Cancel
    const [conflictConfirm, setConflictConfirm] = useState<{
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

    // Step 2 state: swap selected, show reverse conflict warnings if any
    const [swapWarning, setSwapWarning] = useState<{
        phaseId: string;
        phaseName: string;
        functionName: string;
        currentAssigneeName: string;
        currentPlannedStart: string | null;
        currentPlannedEnd: string | null;
        currentEstimatedHours: number;
        newAssigneeId: string;
        newAssigneeName: string;
        swapConflict: ReassignmentConflict;
        check: ReassignmentCheck;
    } | null>(null);

    const handleAssigneeChange = (cell: ProjectTaskPhaseAssignment, newAssigneeId: string | null, functionName: string) => {
        if (!newAssigneeId || newAssigneeId === cell.assigneeId) {
            if (!newAssigneeId) update(cell.id, { assigneeId: null });
            return;
        }
        setPendingCellId(cell.id);
        checkReassignment.mutate(
            { phaseAssignmentId: cell.id, assigneeId: newAssigneeId },
            {
                onSuccess: (result) => {
                    setPendingCellId(null);
                    const member = team.find((m) => m.employeeId === newAssigneeId);
                    const assigneeName = member?.employeeName ?? newAssigneeId;

                    if (!result.hasConflicts) {
                        setDirectAssign({
                            phaseId: cell.id,
                            phaseName: `${cell.phaseName}`,
                            functionName,
                            currentAssigneeName: cell.assigneeName ?? '—',
                            plannedStart: cell.plannedStart,
                            plannedEnd: cell.plannedEnd,
                            estimatedHours: cell.estimatedHours,
                            newAssigneeId,
                            newAssigneeName: assigneeName,
                        });
                    } else {
                        setConflictConfirm({
                            phaseId: cell.id,
                            phaseName: `${cell.phaseName}`,
                            functionName,
                            currentAssigneeName: cell.assigneeName ?? '—',
                            currentPlannedStart: cell.plannedStart,
                            currentPlannedEnd: cell.plannedEnd,
                            currentEstimatedHours: cell.estimatedHours,
                            newAssigneeId,
                            newAssigneeName: assigneeName,
                            check: result,
                        });
                    }
                },
                onError: () => setPendingCellId(null),
            },
        );
    };

    const handleTrySwap = (conflict: ReassignmentConflict) => {
        if (!conflictConfirm) return;
        setSwapWarning({
            ...conflictConfirm,
            swapConflict: conflict,
            check: conflictConfirm.check,
        });
        setConflictConfirm(null);
    };

    const handleConfirmSwap = () => {
        if (!swapWarning) return;
        reassignPhase.mutate(
            {
                phaseAssignmentId: swapWarning.phaseId,
                assigneeId: swapWarning.newAssigneeId,
                mode: 'swap',
                swapWithId: swapWarning.swapConflict.phaseAssignmentId,
            },
            {
                onSuccess: (data) => {
                    const warnings = (data as { warnings?: string[] })?.warnings ?? [];
                    if (warnings.length > 0) {
                        toast(t('swap_completed_with_warnings'), { icon: '⚠️' });
                    } else {
                        toast.success(t('swap_success', {
                            nameA: swapWarning.currentAssigneeName,
                            nameB: swapWarning.newAssigneeName,
                        }));
                    }
                    setSwapWarning(null);
                },
                onError: () => setSwapWarning(null),
            },
        );
    };

    const handleDirectAssign = () => {
        if (!directAssign) return;
        reassignPhase.mutate(
            {
                phaseAssignmentId: directAssign.phaseId,
                assigneeId: directAssign.newAssigneeId,
                mode: 'direct',
            },
            {
                onSuccess: () => setDirectAssign(null),
                onError: () => setDirectAssign(null),
            },
        );
    };

    const handleAssignAnyway = () => {
        if (!conflictConfirm) return;
        reassignPhase.mutate(
            {
                phaseAssignmentId: conflictConfirm.phaseId,
                assigneeId: conflictConfirm.newAssigneeId,
                mode: 'assign_anyway',
            },
            {
                onSuccess: () => {
                    toast.success(t('assign_anyway_success', { name: conflictConfirm.newAssigneeName }));
                    setConflictConfirm(null);
                },
                onError: () => setConflictConfirm(null),
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

    const savePlannedDates = (phaseAssignmentId: string, plannedStart: string, plannedEnd: string) => {
        updatePhasePlannedDates.mutate({ phaseAssignmentId, plannedStart, plannedEnd });
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
                            <SelectTrigger className="h-9 w-[200px] text-xs bg-white border-slate-300 shadow-sm">
                                <SelectValue placeholder="Assignee">
                                    {assigneeFilter === 'all' ? (
                                        <span className="flex items-center gap-1.5">
                                            <Users className="h-3.5 w-3.5 text-slate-400" />
                                            All assignees
                                        </span>
                                    ) : assigneeFilter === 'unassigned' ? (
                                        <span className="text-slate-500 italic">Unassigned</span>
                                    ) : (
                                        <span className="flex items-center gap-1.5">
                                            <span className="flex items-center justify-center h-5 w-5 rounded-full bg-indigo-100 text-indigo-700 text-[9px] font-bold shrink-0">
                                                {(assigneeOptions.find((m) => m.id === assigneeFilter)?.name ?? '?').charAt(0).toUpperCase()}
                                            </span>
                                            <span className="truncate">{assigneeOptions.find((m) => m.id === assigneeFilter)?.name ?? assigneeFilter}</span>
                                        </span>
                                    )}
                                </SelectValue>
                            </SelectTrigger>
                            <SelectContent className="min-w-[220px]">
                                <SelectItem value="all">
                                    <span className="flex items-center gap-1.5">
                                        <Users className="h-3.5 w-3.5 text-slate-400" />
                                        All assignees
                                    </span>
                                </SelectItem>
                                <SelectItem value="unassigned">
                                    <span className="text-slate-500 italic">Unassigned</span>
                                </SelectItem>
                                {assigneeOptions.map((m) => (
                                    <SelectItem key={m.id} value={m.id}>
                                        <span className="flex items-center gap-2">
                                            <span className="flex items-center justify-center h-5 w-5 rounded-full bg-indigo-100 text-indigo-700 text-[9px] font-bold shrink-0">
                                                {(m.name ?? '?').charAt(0).toUpperCase()}
                                            </span>
                                            {m.name}
                                        </span>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as 'all' | TaskStatus)}>
                            <SelectTrigger className="h-9 w-[160px] text-xs bg-white border-slate-300 shadow-sm">
                                <SelectValue placeholder="Status">
                                    {statusFilter === 'all' ? (
                                        <span className="flex items-center gap-1.5">
                                            <ListFilter className="h-3.5 w-3.5 text-slate-400" />
                                            All statuses
                                        </span>
                                    ) : (
                                        <StatusBadge status={statusFilter} />
                                    )}
                                </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">
                                    <span className="flex items-center gap-1.5">
                                        <ListFilter className="h-3.5 w-3.5 text-slate-400" />
                                        All statuses
                                    </span>
                                </SelectItem>
                                {STATUS_VALUES.map((s) => (
                                    <SelectItem key={s} value={s}>
                                        <StatusBadge status={s} />
                                    </SelectItem>
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
                                                        <td className="px-1.5 py-1 w-[180px]">
                                                          <div className="relative">
                                                            {pendingCellId === cell.id && (
                                                                <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/80 rounded-md">
                                                                    <Loader2 className="h-4 w-4 animate-spin text-indigo-500" />
                                                                </div>
                                                            )}
                                                            {canEditDates ? (
                                                                <Select
                                                                    value={cell.assigneeId ?? ''}
                                                                    onValueChange={(v) => handleAssigneeChange(cell, v || null, task.functionName)}
                                                                    disabled={pendingCellId === cell.id}
                                                                >
                                                                    <SelectTrigger className="h-8 w-full text-xs bg-white border-slate-200 shadow-sm hover:border-slate-300 transition-colors overflow-hidden">
                                                                        <SelectValue placeholder={t('unassigned_short')}>
                                                                            {cell.assigneeName ? (
                                                                                <span className="flex items-center gap-1.5 overflow-hidden min-w-0">
                                                                                    <span className="flex items-center justify-center h-5 w-5 rounded-full bg-indigo-100 text-indigo-700 text-[9px] font-bold shrink-0">
                                                                                        {cell.assigneeName.charAt(0).toUpperCase()}
                                                                                    </span>
                                                                                    <span className="truncate min-w-0">{cell.assigneeName}</span>
                                                                                    {cell.assigneeRankCode && (
                                                                                        <Badge variant="outline" className="text-[8px] px-1 py-0 h-3.5 bg-slate-50 text-slate-500 border-slate-200 shrink-0">
                                                                                            {cell.assigneeRankCode}
                                                                                        </Badge>
                                                                                    )}
                                                                                </span>
                                                                            ) : (
                                                                                <span className="text-slate-400 italic">{t('unassigned_short')}</span>
                                                                            )}
                                                                        </SelectValue>
                                                                    </SelectTrigger>
                                                                    <SelectContent className="min-w-[220px]">
                                                                        {team.map((m) => (
                                                                            <SelectItem key={m.employeeId} value={m.employeeId}>
                                                                                <span className="flex items-center gap-2">
                                                                                    <span className="flex items-center justify-center h-5 w-5 rounded-full bg-indigo-100 text-indigo-700 text-[9px] font-bold shrink-0">
                                                                                        {(m.employeeName ?? '?').charAt(0).toUpperCase()}
                                                                                    </span>
                                                                                    <span>{m.employeeName ?? m.employeeId}</span>
                                                                                    {m.rankCode && (
                                                                                        <Badge variant="outline" className="text-[8px] px-1 py-0 h-3.5 bg-slate-50 text-slate-500 border-slate-200">
                                                                                            {m.rankCode}
                                                                                        </Badge>
                                                                                    )}
                                                                                </span>
                                                                            </SelectItem>
                                                                        ))}
                                                                    </SelectContent>
                                                                </Select>
                                                            ) : (
                                                                <span className="flex items-center gap-1.5 px-2 py-1.5 text-xs text-slate-700">
                                                                    {cell.assigneeName ? (
                                                                        <>
                                                                            <span className="flex items-center justify-center h-5 w-5 rounded-full bg-indigo-100 text-indigo-700 text-[9px] font-bold shrink-0">
                                                                                {cell.assigneeName.charAt(0).toUpperCase()}
                                                                            </span>
                                                                            <span className="truncate min-w-0">{cell.assigneeName}</span>
                                                                            {cell.assigneeRankCode && (
                                                                                <Badge variant="outline" className="text-[8px] px-1 py-0 h-3.5 bg-slate-50 text-slate-500 border-slate-200">
                                                                                    {cell.assigneeRankCode}
                                                                                </Badge>
                                                                            )}
                                                                        </>
                                                                    ) : (
                                                                        <span className="text-slate-400 italic">{t('unassigned_short')}</span>
                                                                    )}
                                                                </span>
                                                            )}
                                                          </div>
                                                        </td>
                                                        <td className="px-1.5 py-1 w-[105px]">
                                                            {canEditDates ? (
                                                                <span className="inline-flex items-center gap-1">
                                                                    <WorkingDayPicker
                                                                        value={cell.plannedStart}
                                                                        holidays={holidaysMap}
                                                                        max={cell.plannedEnd}
                                                                        disabled={updatePhasePlannedDates.isPending}
                                                                        placeholder="—"
                                                                        onChange={(next) => {
                                                                            if (!cell.plannedEnd) {
                                                                                savePlannedDates(cell.id, next, next);
                                                                            } else if (next > cell.plannedEnd) {
                                                                                savePlannedDates(cell.id, next, next);
                                                                            } else {
                                                                                savePlannedDates(cell.id, next, cell.plannedEnd);
                                                                            }
                                                                        }}
                                                                    />
                                                                    {cell.plannedDatesEditedAt && (
                                                                        <span
                                                                            className="text-amber-500 text-[11px] cursor-help"
                                                                            title={`Planned dates edited ${cell.plannedDatesEditedAt.slice(0, 10)} — variance is computed against current planned dates.`}
                                                                        >
                                                                            ⚠
                                                                        </span>
                                                                    )}
                                                                </span>
                                                            ) : (
                                                                <span className="inline-block h-7 leading-7 text-xs text-slate-700 tabular-nums">
                                                                    {cell.plannedStart?.replaceAll('-', '/') ?? '—'}
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td className="px-1.5 py-1 w-[105px]">
                                                            {canEditDates ? (
                                                                <WorkingDayPicker
                                                                    value={cell.plannedEnd}
                                                                    holidays={holidaysMap}
                                                                    min={cell.plannedStart}
                                                                    disabled={updatePhasePlannedDates.isPending || !cell.plannedStart}
                                                                    placeholder="—"
                                                                    onChange={(next) => {
                                                                        if (!cell.plannedStart) return;
                                                                        savePlannedDates(cell.id, cell.plannedStart, next);
                                                                    }}
                                                                />
                                                            ) : (
                                                                <span className="inline-block h-7 leading-7 text-xs text-slate-700 tabular-nums">
                                                                    {cell.plannedEnd?.replaceAll('-', '/') ?? '—'}
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td className="px-1.5 py-1 w-[105px]">
                                                            <span className="inline-block h-7 leading-7 text-xs text-slate-700 tabular-nums">
                                                                {cell.actualStart?.replaceAll('-', '/') ?? '—'}
                                                            </span>
                                                        </td>
                                                        <td className="px-1.5 py-1 w-[105px]">
                                                            <span className="inline-block h-7 leading-7 text-xs text-slate-700 tabular-nums">
                                                                {cell.actualEnd?.replaceAll('-', '/') ?? '—'}
                                                            </span>
                                                        </td>
                                                        <td className="px-1.5 py-1 border-r border-slate-100 w-[110px]">
                                                            <Select
                                                                value={cell.status}
                                                                onValueChange={(v) => update(cell.id, { status: v as TaskStatus })}
                                                            >
                                                                <SelectTrigger className="h-8 text-xs bg-white border-slate-200 shadow-sm hover:border-slate-300 transition-colors">
                                                                    <SelectValue>
                                                                        <StatusBadge status={cell.status} />
                                                                    </SelectValue>
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    {STATUS_VALUES.map((s) => (
                                                                        <SelectItem key={s} value={s}>
                                                                            <StatusBadge status={s} />
                                                                        </SelectItem>
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
            {directAssign && (
                <DirectAssignDialog
                    open
                    phaseName={directAssign.phaseName}
                    functionName={directAssign.functionName}
                    currentAssigneeName={directAssign.currentAssigneeName}
                    newAssigneeName={directAssign.newAssigneeName}
                    plannedStart={directAssign.plannedStart}
                    plannedEnd={directAssign.plannedEnd}
                    estimatedHours={directAssign.estimatedHours}
                    isLoading={reassignPhase.isPending}
                    onCancel={() => setDirectAssign(null)}
                    onConfirm={handleDirectAssign}
                />
            )}
            {conflictConfirm && (
                <ConflictConfirmDialog
                    open
                    conflicts={conflictConfirm.check.conflicts}
                    newAssigneeName={conflictConfirm.newAssigneeName}
                    phaseName={conflictConfirm.phaseName}
                    isLoading={reassignPhase.isPending}
                    onCancel={() => setConflictConfirm(null)}
                    onSwap={(conflict) => handleTrySwap(conflict)}
                    onAssignAnyway={handleAssignAnyway}
                />
            )}
            {swapWarning && (
                <SwapWarningDialog
                    open
                    currentAssigneeName={swapWarning.currentAssigneeName}
                    newAssigneeName={swapWarning.newAssigneeName}
                    phaseName={swapWarning.phaseName}
                    functionName={swapWarning.functionName}
                    currentPlannedStart={swapWarning.currentPlannedStart}
                    currentPlannedEnd={swapWarning.currentPlannedEnd}
                    currentEstimatedHours={swapWarning.currentEstimatedHours}
                    swapConflict={swapWarning.swapConflict}
                    reverseConflicts={swapWarning.check.reverseConflicts}
                    isLoading={reassignPhase.isPending}
                    onCancel={() => setSwapWarning(null)}
                    onConfirmSwap={handleConfirmSwap}
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
                                                    <th className="text-left px-3 py-2 font-medium text-slate-600">{t('role_rank')}</th>
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
                                                            {m.capacityRole ?? '—'}
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
            <td className="px-1.5 py-1 w-[180px]" />
            <td className="px-1.5 py-1 w-[105px]" />
            <td className="px-1.5 py-1 w-[105px]" />
            <td className="px-1.5 py-1 w-[105px]" />
            <td className="px-1.5 py-1 w-[105px]" />
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
