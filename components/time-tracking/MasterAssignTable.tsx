'use client';

import { Fragment, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Loader2, ListTree } from 'lucide-react';
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

    const update = (phaseAssignmentId: string, updates: Partial<ProjectTaskPhaseAssignment>) => {
        updatePhaseAssignment.mutate({ phaseAssignmentId, updates });
    };

    return (
        <Card className="shadow-sm border-[#e6e9ee]">
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="flex items-center gap-2 text-base">
                            <ListTree className="h-4 w-4 text-indigo-600" />
                            Master Assign Table
                        </CardTitle>
                        <CardDescription>
                            Per-phase owners from Estimate.xlsx (Web_Manhour_Detail).
                            Click any 担当者, date, or ステータス cell to edit.
                        </CardDescription>
                    </div>
                    {tasksQuery.isFetching && (
                        <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                    )}
                </div>
            </CardHeader>
            <CardContent>
                {tasksQuery.isLoading ? (
                    <div className="py-10 text-center text-slate-500 text-sm">Loading task assignments…</div>
                ) : tasks.length === 0 ? (
                    <div className="py-10 text-center text-slate-500 text-sm">
                        No task assignments yet. Click <strong>AI Task Assignment</strong> on a project above
                        to generate them from <code>Estimate.xlsx</code>.
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse text-xs">
                            <thead>
                                <tr className="bg-slate-50 border-b border-slate-200">
                                    <th rowSpan={2} className="px-2 py-2 border-r border-slate-200 text-left font-medium text-slate-700 w-[50px]">NO</th>
                                    <th rowSpan={2} className="px-2 py-2 border-r border-slate-200 text-left font-medium text-slate-700 w-[110px]">FunctionID</th>
                                    <th rowSpan={2} className="px-2 py-2 border-r border-slate-200 text-left font-medium text-slate-700 min-w-[160px]">機能名</th>
                                    <th rowSpan={2} className="px-2 py-2 border-r border-slate-200 text-left font-medium text-slate-700 w-[70px]">難易度</th>
                                    {activePhases.map((p) => (
                                        <th key={p.code} colSpan={7} className="px-2 py-2 border-l-2 border-slate-300 border-r border-slate-200 text-center font-semibold text-indigo-700 bg-indigo-50/40">
                                            {p.name}
                                        </th>
                                    ))}
                                </tr>
                                <tr className="bg-slate-50 border-b border-slate-200">
                                    {activePhases.map((p) => (
                                        <PhaseSubHeaders key={p.code} />
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {tasks.map((t) => {
                                    const byCode = new Map(t.phases.map((p) => [p.phaseCode, p]));
                                    return (
                                        <tr key={t.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                                            <td className="px-2 py-1.5 border-r border-slate-100 font-mono text-slate-500">{t.rowNo}</td>
                                            <td className="px-2 py-1.5 border-r border-slate-100 font-mono">{t.functionId ?? '—'}</td>
                                            <td className="px-2 py-1.5 border-r border-slate-100 font-medium text-slate-700">{t.functionName}</td>
                                            <td className="px-2 py-1.5 border-r border-slate-100">
                                                <Badge variant="outline" className={DIFFICULTY_VARIANTS[t.difficulty]}>
                                                    {t.difficulty}
                                                </Badge>
                                            </td>
                                            {activePhases.map((p) => {
                                                const cell = byCode.get(p.code);
                                                if (!cell) {
                                                    return (
                                                        <td
                                                            key={p.code}
                                                            colSpan={7}
                                                            className="px-2 py-1.5 border-l-2 border-slate-200 border-r border-slate-100 text-center text-slate-300"
                                                        >
                                                            —
                                                        </td>
                                                    );
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
                                                                        title="View daily progress"
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
                                                                    <SelectValue placeholder="Unassigned">
                                                                        {cell.assigneeName ? (
                                                                            <span className="flex items-center gap-1">
                                                                                {cell.assigneeName}
                                                                                {cell.assigneeRankCode && (
                                                                                    <span className="text-[9px] text-slate-400">
                                                                                        ({cell.assigneeRankCode})
                                                                                    </span>
                                                                                )}
                                                                            </span>
                                                                        ) : 'Unassigned'}
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
                                                                onChange={(e) => update(cell.id, { actualEnd: e.target.value || null })}
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

function PhaseSubHeaders() {
    return (
        <>
            <th className="px-2 py-1.5 border-l-2 border-slate-300 text-right font-medium text-slate-600 bg-indigo-50/20">工数(h)</th>
            <th className="px-2 py-1.5 text-left font-medium text-slate-600 bg-indigo-50/20">担当者</th>
            <th className="px-2 py-1.5 text-left font-medium text-slate-600 bg-indigo-50/20">予定開始</th>
            <th className="px-2 py-1.5 text-left font-medium text-slate-600 bg-indigo-50/20">予定終了</th>
            <th className="px-2 py-1.5 text-left font-medium text-slate-600 bg-indigo-50/20">実績開始</th>
            <th className="px-2 py-1.5 text-left font-medium text-slate-600 bg-indigo-50/20">実績終了</th>
            <th className="px-2 py-1.5 border-r border-slate-200 text-left font-medium text-slate-600 bg-indigo-50/20">ステータス</th>
        </>
    );
}
