'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table';
import { Loader2, ListTree, PencilLine } from 'lucide-react';
import {
    useProjectTaskAssignments,
    useProjectTaskMutations,
} from '@/lib/queries/projects';
import {
    useScheduleTrackingList,
    useLogProgress,
    usePhaseProgressLogs,
} from '@/lib/queries/scheduleTracking';
import { ScheduleHealthBadge } from '@/components/schedule-tracking/ScheduleHealthBadge';
import { useAsOfParam } from '@/components/SimulatedDateBar';
import type {
    ProjectTaskAssignment,
    ProjectTaskPhaseAssignment,
    ScheduleTrackingRow,
    TaskDifficulty,
    TaskStatus,
} from '@/types/business';

const DIFFICULTY_VARIANTS: Record<TaskDifficulty, string> = {
    '簡単':   'bg-slate-100 text-slate-700 border-slate-200',
    '普通':   'bg-amber-50 text-amber-700 border-amber-200',
    '難しい': 'bg-red-50 text-red-700 border-red-200',
};

const STATUS_VARIANTS: Record<TaskStatus, string> = {
    '未着手': 'bg-slate-100 text-slate-700 border-slate-200',
    '進行中': 'bg-indigo-50 text-indigo-700 border-indigo-200',
    '完了':   'bg-emerald-50 text-emerald-700 border-emerald-200',
};

interface Props {
    projectId: string;
    employeeId: string;
}

export function MyScheduleEmployeeTable({ projectId, employeeId }: Props) {
    const tasksQuery    = useProjectTaskAssignments(projectId);
    const asOf = useAsOfParam();
    const trackingQuery = useScheduleTrackingList(projectId, { per_page: 200, assignee_id: employeeId, ...(asOf ? { as_of: asOf } : {}) });

    const tasks        = useMemo(() => tasksQuery.data?.data ?? [], [tasksQuery.data]);
    const activePhases = useMemo(() => tasksQuery.data?.meta.activePhases ?? [], [tasksQuery.data]);

    const trackingByPhaseId = useMemo(() => {
        const m = new Map<string, ScheduleTrackingRow>();
        for (const row of trackingQuery.data?.data ?? []) m.set(row.id, row);
        return m;
    }, [trackingQuery.data]);

    const myTasks = useMemo(
        () => tasks.filter((t) => t.phases.some((p) => p.assigneeId === employeeId)),
        [tasks, employeeId],
    );

    const [openPhase, setOpenPhase] = useState<ProjectTaskPhaseAssignment | null>(null);

    return (
        <Card className="shadow-sm border-[#e6e9ee]">
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="flex items-center gap-2 text-base">
                            <ListTree className="h-4 w-4 text-emerald-600" />
                            My Schedule
                        </CardTitle>
                        <CardDescription>
                            Phases assigned to you across this project. Click the pencil icon on any of your phases to log today&apos;s progress.
                        </CardDescription>
                    </div>
                    {(tasksQuery.isFetching || trackingQuery.isFetching) && (
                        <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                    )}
                </div>
            </CardHeader>
            <CardContent>
                {tasksQuery.isLoading ? (
                    <div className="py-10 text-center text-slate-500 text-sm">Loading your schedule…</div>
                ) : myTasks.length === 0 ? (
                    <div className="py-10 text-center text-slate-500 text-sm">
                        Nothing is assigned to you in this project yet.
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
                                        <th key={p.code} colSpan={7} className="px-2 py-2 border-l-2 border-slate-300 border-r border-slate-200 text-center font-semibold text-emerald-700 bg-emerald-50/40">
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
                                {myTasks.map((t) => (
                                    <TaskRow
                                        key={t.id}
                                        task={t}
                                        activePhases={activePhases}
                                        employeeId={employeeId}
                                        trackingByPhaseId={trackingByPhaseId}
                                        onOpenForm={(phase) => setOpenPhase(phase)}
                                    />
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </CardContent>

            <LogProgressModal
                open={!!openPhase}
                phase={openPhase}
                projectId={projectId}
                onClose={() => setOpenPhase(null)}
            />
        </Card>
    );
}

function TaskRow({
    task,
    activePhases,
    employeeId,
    trackingByPhaseId,
    onOpenForm,
}: {
    task: ProjectTaskAssignment;
    activePhases: { code: string; name: string; order: number }[];
    employeeId: string;
    trackingByPhaseId: Map<string, ScheduleTrackingRow>;
    onOpenForm: (phase: ProjectTaskPhaseAssignment) => void;
}) {
    const byCode = new Map(task.phases.map((p) => [p.phaseCode, p]));

    return (
        <tr className="border-b border-slate-100 hover:bg-slate-50/30">
            <td className="px-2 py-1.5 border-r border-slate-100 font-mono text-slate-500">{task.rowNo}</td>
            <td className="px-2 py-1.5 border-r border-slate-100 font-mono">{task.functionId ?? '—'}</td>
            <td className="px-2 py-1.5 border-r border-slate-100 font-medium text-slate-700">{task.functionName}</td>
            <td className="px-2 py-1.5 border-r border-slate-100">
                <Badge variant="outline" className={DIFFICULTY_VARIANTS[task.difficulty]}>
                    {task.difficulty}
                </Badge>
            </td>
            {activePhases.map((p) => {
                const cell = byCode.get(p.code as ProjectTaskPhaseAssignment['phaseCode']);
                if (!cell) {
                    return (
                        <td key={p.code} colSpan={7} className="px-2 py-1.5 border-l-2 border-slate-200 border-r border-slate-100 text-center text-slate-300">
                            —
                        </td>
                    );
                }
                const isMine = cell.assigneeId === employeeId;
                const tracking = trackingByPhaseId.get(cell.id);

                return (
                    <Fragment key={p.code}>
                        <td className="px-2 py-1 border-l-2 border-slate-200 text-right tabular-nums text-slate-600 w-[60px]">
                            <div className="flex items-center justify-end gap-1">
                                <span>{cell.estimatedHours}</span>
                                {tracking && tracking.variance.scheduleState !== 'pending' && (
                                    <ScheduleHealthBadge
                                        health={tracking.variance.health}
                                        varianceHours={tracking.variance.varianceHours}
                                        compact
                                    />
                                )}
                            </div>
                        </td>
                        <td className={`px-2 py-1 min-w-[140px] text-xs ${isMine ? 'font-medium text-emerald-700' : 'text-slate-500'}`}>
                            {cell.assigneeName ?? <span className="text-slate-300">—</span>}
                            {isMine && <span className="ml-1 text-[10px] text-emerald-600">(you)</span>}
                        </td>
                        <td className="px-2 py-1 text-xs text-slate-500 w-[100px]">{cell.plannedStart ?? '—'}</td>
                        <td className="px-2 py-1 text-xs text-slate-500 w-[100px]">{cell.plannedEnd ?? '—'}</td>
                        <td className="px-2 py-1 text-xs text-slate-500 w-[100px]">{cell.actualStart ?? '—'}</td>
                        <td className="px-2 py-1 text-xs text-slate-500 w-[100px]">{cell.actualEnd ?? '—'}</td>
                        <td className="px-1.5 py-1 border-r border-slate-100 w-[120px]">
                            <div className="flex items-center justify-between gap-1">
                                <Badge variant="outline" className={STATUS_VARIANTS[cell.status]}>
                                    {cell.status}
                                </Badge>
                                {isMine && (
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-6 w-6 p-0"
                                        onClick={() => onOpenForm(cell)}
                                        title="Log progress"
                                    >
                                        <PencilLine className="h-3.5 w-3.5 text-emerald-600" />
                                    </Button>
                                )}
                            </div>
                        </td>
                    </Fragment>
                );
            })}
        </tr>
    );
}

function LogProgressModal({
    open,
    phase,
    projectId,
    onClose,
}: {
    open: boolean;
    phase: ProjectTaskPhaseAssignment | null;
    projectId: string;
    onClose: () => void;
}) {
    const today = new Date().toISOString().slice(0, 10);
    const [logDate, setLogDate]        = useState(today);
    const [progressHours, setProgress] = useState('');
    const [usedHours, setUsed]         = useState('');
    const [note, setNote]              = useState('');
    const [actualStart, setActualStart] = useState<string>('');
    const [actualEnd, setActualEnd]     = useState<string>('');

    // Reset form when a new phase opens.
    useEffect(() => {
        if (!phase) return;
        setLogDate(today);
        setProgress('');
        setUsed('');
        setNote('');
        setActualStart(phase.actualStart ?? '');
        setActualEnd(phase.actualEnd ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [phase?.id]);

    const logProgress = useLogProgress();
    const { updatePhaseAssignment } = useProjectTaskMutations(projectId);

    // Prior progress logs for this phase. Hook is gated on null when the modal
    // is closed (see usePhaseProgressLogs.enabled), so no request fires until
    // the user actually opens the modal for a phase. After save, useLogProgress
    // invalidates the same query key, so reopening the modal shows the new row.
    const { data: prevLogs = [], isLoading: logsLoading } =
        usePhaseProgressLogs(open && phase ? phase.id : null);

    if (!phase) return null;

    const save = () => {
        const p = parseFloat(progressHours);
        const u = parseFloat(usedHours);
        if (Number.isNaN(p) || Number.isNaN(u) || p < 0 || u < 0) return;

        // Always post today's progress log.
        logProgress.mutate(
            {
                phaseAssignmentId: phase.id,
                progressHours: p,
                usedHours: u,
                note: note || undefined,
                logDate,
            },
            {
                onSuccess: () => {
                    // If actual_start or actual_end changed, PATCH the phase row too.
                    const updates: Record<string, string | null> = {};
                    const normStart = actualStart || null;
                    const normEnd   = actualEnd   || null;
                    if (normStart !== (phase.actualStart ?? null)) updates.actualStart = normStart as never;
                    if (normEnd   !== (phase.actualEnd   ?? null)) updates.actualEnd   = normEnd   as never;
                    if (Object.keys(updates).length > 0) {
                        updatePhaseAssignment.mutate({ phaseAssignmentId: phase.id, updates: updates as never });
                    }
                    onClose();
                },
            },
        );
    };

    const inFlight = logProgress.isPending || updatePhaseAssignment.isPending;

    return (
        <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        Log progress
                        <Badge variant="outline" className="text-xs">{phase.phaseName}</Badge>
                    </DialogTitle>
                    <DialogDescription>
                        Estimated {phase.estimatedHours}h · Planned {phase.plannedStart} → {phase.plannedEnd}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 mt-2">
                    <div className="space-y-1.5">
                        <div className="text-xs font-medium text-slate-700">Previous entries</div>
                        {logsLoading ? (
                            <div className="h-12 animate-pulse bg-slate-100 rounded-md" />
                        ) : prevLogs.length === 0 ? (
                            <p className="text-xs text-slate-400 italic">
                                No prior entries — this will be the first log for this phase.
                            </p>
                        ) : (
                            <div className="max-h-40 overflow-y-auto rounded-md border border-slate-200">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="h-8 text-xs">Date</TableHead>
                                            <TableHead className="h-8 text-xs text-right">Progress (h)</TableHead>
                                            <TableHead className="h-8 text-xs text-right">Used (h)</TableHead>
                                            <TableHead className="h-8 text-xs">Note</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {prevLogs.map((log) => (
                                            <TableRow key={log.id}>
                                                <TableCell className="py-1.5 text-xs font-mono">{log.logDate}</TableCell>
                                                <TableCell className="py-1.5 text-xs text-right">{log.progressHours}</TableCell>
                                                <TableCell className="py-1.5 text-xs text-right">{log.usedHours}</TableCell>
                                                <TableCell className="py-1.5 text-xs text-slate-600">
                                                    {log.note ? (log.note.length > 40 ? log.note.slice(0, 40) + '…' : log.note) : '—'}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="space-y-1">
                            <label className="text-xs text-slate-600">Log date</label>
                            <Input type="date" value={logDate} onChange={(e) => setLogDate(e.target.value)} />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-slate-600">Progress hours (today)</label>
                            <Input
                                type="number"
                                min={0}
                                step={0.25}
                                value={progressHours}
                                onChange={(e) => setProgress(e.target.value)}
                                placeholder={`up to ${phase.estimatedHours}`}
                            />
                            <p className="text-[10px] text-slate-400">How much of the planned work you completed today.</p>
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-slate-600">Used hours (today)</label>
                            <Input
                                type="number"
                                min={0}
                                step={0.25}
                                value={usedHours}
                                onChange={(e) => setUsed(e.target.value)}
                                placeholder="e.g. 8"
                            />
                            <p className="text-[10px] text-slate-400">Clock time you actually spent today.</p>
                        </div>
                    </div>

                    <div className="space-y-1">
                        <label className="text-xs text-slate-600">Note (optional)</label>
                        <Textarea
                            rows={2}
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder="Anything worth flagging — blockers, scope changes, surprises…"
                        />
                    </div>

                    <div className="border-t border-slate-200 pt-3">
                        <div className="text-xs font-medium text-slate-700 mb-2">Phase milestones (optional)</div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div className="space-y-1">
                                <label className="text-xs text-slate-600">Actual start date</label>
                                <Input type="date" value={actualStart} onChange={(e) => setActualStart(e.target.value)} />
                                <p className="text-[10px] text-slate-400">Set the first day you actually started this phase.</p>
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs text-slate-600">Actual end date</label>
                                <Input type="date" value={actualEnd} onChange={(e) => setActualEnd(e.target.value)} />
                                <p className="text-[10px] text-slate-400">Set only when the phase is fully complete — it locks in the final variance.</p>
                            </div>
                        </div>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="ghost" onClick={onClose} disabled={inFlight}>Cancel</Button>
                    <Button onClick={save} disabled={inFlight || progressHours === '' || usedHours === ''}>
                        {inFlight ? 'Saving…' : 'Save log'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function PhaseSubHeaders() {
    return (
        <>
            <th className="px-2 py-1.5 border-l-2 border-slate-300 text-right font-medium text-slate-600 bg-emerald-50/20">工数(h)</th>
            <th className="px-2 py-1.5 text-left font-medium text-slate-600 bg-emerald-50/20">担当者</th>
            <th className="px-2 py-1.5 text-left font-medium text-slate-600 bg-emerald-50/20">予定開始</th>
            <th className="px-2 py-1.5 text-left font-medium text-slate-600 bg-emerald-50/20">予定終了</th>
            <th className="px-2 py-1.5 text-left font-medium text-slate-600 bg-emerald-50/20">実績開始</th>
            <th className="px-2 py-1.5 text-left font-medium text-slate-600 bg-emerald-50/20">実績終了</th>
            <th className="px-2 py-1.5 border-r border-slate-200 text-left font-medium text-slate-600 bg-emerald-50/20">ステータス</th>
        </>
    );
}
