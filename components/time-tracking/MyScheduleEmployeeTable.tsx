'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Loader2, ListTree, PencilLine, Pencil, Trash2 } from 'lucide-react';
import {
    useProjectTaskAssignments,
    useProjectTaskMutations,
} from '@/lib/queries/projects';
import {
    useScheduleTrackingList,
    useLogProgress,
    useUpdateProgressLog,
    useDeleteProgressLog,
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

interface Props {
    projectId: string;
    employeeId: string;
}

export function MyScheduleEmployeeTable({ projectId, employeeId }: Props) {
    const t = useTranslations();
    const tasksQuery    = useProjectTaskAssignments(projectId);
    const asOf = useAsOfParam();
    const trackingQuery = useScheduleTrackingList(projectId, { per_page: 200, assignee_id: employeeId, ...(asOf ? { as_of: asOf } : {}) });

    const tasks        = useMemo(() => tasksQuery.data?.data ?? [], [tasksQuery.data]);
    const activePhases = useMemo(() => tasksQuery.data?.meta?.activePhases ?? [], [tasksQuery.data]);

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
            <div className="px-6 pt-3 pb-4 space-y-4">
                <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2 text-base">
                        <ListTree className="h-4 w-4 text-emerald-600" />
                        {t('my_schedule')}
                        {(tasksQuery.isFetching || trackingQuery.isFetching) && (
                            <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                        )}
                    </CardTitle>
                </div>
                {tasksQuery.isLoading ? (
                    <div className="py-10 text-center text-slate-400 text-sm">{t('loading_your_schedule')}</div>
                ) : myTasks.length === 0 ? (
                    <div className="py-10 text-center text-slate-400 text-sm">
                        {t('nothing_assigned_to_you')}
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
                                    {activePhases.map((p) => (
                                        <th key={p.code} colSpan={7} className={`px-2 py-2.5 border-l-2 border-slate-300 text-center font-semibold text-slate-700 text-[11px] ${PHASE_BG[p.code] ?? 'bg-slate-100'}`}>
                                            {p.name}
                                        </th>
                                    ))}
                                </tr>
                                <tr className="border-b-2 border-slate-300 bg-slate-50/80">
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
            </div>

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
    const tRow = useTranslations();
    const byCode = new Map(task.phases.map((p) => [p.phaseCode, p]));

    return (
        <tr className="border-b border-slate-100 hover:bg-slate-50/50">
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
                        <td key={p.code} colSpan={7} className="px-2 py-1.5 border-l-2 border-slate-300 border-r border-slate-100 text-center text-slate-300">
                            —
                        </td>
                    );
                }
                const isMine = cell.assigneeId === employeeId;
                const tracking = trackingByPhaseId.get(cell.id);

                return (
                    <Fragment key={p.code}>
                        <td className="px-2 py-1 border-l-2 border-slate-300 text-right tabular-nums text-slate-600 w-[60px]">
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
                            {isMine && <span className="ml-1 text-[10px] text-emerald-600">{tRow('you_marker')}</span>}
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
                                        title={tRow('log_progress_tooltip')}
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
    const t = useTranslations();
    const today = new Date().toISOString().slice(0, 10);
    const [logDate, setLogDate]        = useState(today);
    const [progressHours, setProgress] = useState('');
    const [usedHours, setUsed]         = useState('');
    const [note, setNote]              = useState('');
    const [actualStart, setActualStart] = useState<string>('');
    const [actualEnd, setActualEnd]     = useState<string>('');
    const [editingLogId, setEditingLogId] = useState<string | null>(null);

    const resetForm = () => {
        setLogDate(today);
        setProgress('');
        setUsed('');
        setNote('');
        setEditingLogId(null);
    };

    useEffect(() => {
        if (!phase) return;
        resetForm();
        setActualStart(phase.actualStart ?? '');
        setActualEnd(phase.actualEnd ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [phase?.id]);

    const logProgress = useLogProgress();
    const updateProgress = useUpdateProgressLog();
    const deleteProgress = useDeleteProgressLog();
    const { updatePhaseAssignment } = useProjectTaskMutations(projectId);

    const { data: prevLogs = [], isLoading: logsLoading } =
        usePhaseProgressLogs(open && phase ? phase.id : null);

    if (!phase) return null;

    const startEdit = (log: typeof prevLogs[number]) => {
        setEditingLogId(log.id);
        setLogDate(log.logDate);
        setProgress(String(log.progressHours));
        setUsed(String(log.usedHours));
        setNote(log.note ?? '');
    };

    const cancelEdit = () => resetForm();

    const handleDelete = (logId: string) => {
        if (!window.confirm(t('confirm_delete_log'))) return;
        deleteProgress.mutate(logId);
    };

    const save = () => {
        const p = parseFloat(progressHours);
        const u = parseFloat(usedHours);
        if (Number.isNaN(p) || Number.isNaN(u) || p < 0 || u < 0) return;

        if (editingLogId) {
            updateProgress.mutate(
                { id: editingLogId, logDate, progressHours: p, usedHours: u, note: note || null },
                { onSuccess: () => resetForm() },
            );
            return;
        }

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
                    const updates: Record<string, string | null> = {};
                    const normStart = actualStart || null;
                    const normEnd   = actualEnd   || null;
                    if (normStart !== (phase.actualStart ?? null)) updates.actualStart = normStart as never;
                    if (normEnd   !== (phase.actualEnd   ?? null)) updates.actualEnd   = normEnd   as never;
                    if (normEnd && phase.status !== '完了') {
                        updates.status = '完了' as never;
                    }
                    if (Object.keys(updates).length > 0) {
                        updatePhaseAssignment.mutate({ phaseAssignmentId: phase.id, updates: updates as never });
                    }
                    onClose();
                },
            },
        );
    };

    const inFlight = logProgress.isPending || updateProgress.isPending || updatePhaseAssignment.isPending;

    return (
        <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
            <DialogContent className="max-w-2xl p-0 gap-0 overflow-hidden">
                {/* Modal header */}
                <div className="bg-emerald-50 border-b border-emerald-200 px-6 pt-5 pb-4">
                    <DialogHeader className="gap-1.5">
                        <DialogTitle className="flex items-center gap-2 text-base">
                            {t('log_progress_title')}
                            <Badge variant="outline" className="text-[10px] font-normal border-emerald-300 text-emerald-700">{phase.phaseName}</Badge>
                        </DialogTitle>
                        <DialogDescription className="text-[13px] text-emerald-700/70">
                            {t('estimated_planned_summary', { hours: phase.estimatedHours, start: phase.plannedStart ?? '—', end: phase.plannedEnd ?? '—' })}
                        </DialogDescription>
                    </DialogHeader>
                </div>

                {/* Modal body */}
                <div className="px-6 py-5 space-y-5 max-h-[65vh] overflow-y-auto">
                    {/* Previous entries */}
                    <div className="space-y-2">
                        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{t('previous_entries')}</div>
                        {logsLoading ? (
                            <div className="h-12 animate-pulse bg-slate-100 rounded-lg" />
                        ) : prevLogs.length === 0 ? (
                            <p className="text-xs text-slate-400 italic">{t('no_prior_entries')}</p>
                        ) : (
                            <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-200 overflow-hidden">
                                <table className="w-full text-xs">
                                    <thead>
                                        <tr className="bg-slate-50 border-b border-slate-200">
                                            <th className="px-3 py-2 text-left font-medium text-slate-500 text-[10px] uppercase tracking-wide">{t('date')}</th>
                                            <th className="px-3 py-2 text-right font-medium text-slate-500 text-[10px] uppercase tracking-wide">{t('progress_h')}</th>
                                            <th className="px-3 py-2 text-right font-medium text-slate-500 text-[10px] uppercase tracking-wide">{t('used_h')}</th>
                                            <th className="px-3 py-2 text-right font-medium text-slate-500 text-[10px] uppercase tracking-wide">{t('extra_h')}</th>
                                            <th className="px-3 py-2 text-left font-medium text-slate-500 text-[10px] uppercase tracking-wide">{t('note_col')}</th>
                                            <th className="px-3 py-2 w-[60px]" />
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {prevLogs.map((log, i) => (
                                            <tr
                                                key={log.id}
                                                className={`${i < prevLogs.length - 1 ? 'border-b border-slate-100' : ''} ${editingLogId === log.id ? 'bg-emerald-50' : ''}`}
                                            >
                                                <td className="px-3 py-2 font-mono text-slate-600">{log.logDate}</td>
                                                <td className="px-3 py-2 text-right tabular-nums">{log.progressHours}</td>
                                                <td className="px-3 py-2 text-right tabular-nums">{log.usedHours}</td>
                                                <td className={`px-3 py-2 text-right tabular-nums ${log.lateHours > 0 ? 'text-amber-600 font-medium' : 'text-slate-400'}`}>
                                                    {log.lateHours > 0 ? `+${log.lateHours}` : '0'}
                                                </td>
                                                <td className="px-3 py-2 text-slate-600 max-w-[150px] truncate">
                                                    {log.note || '—'}
                                                </td>
                                                <td className="px-2 py-1.5 text-right">
                                                    {!log.isLocked ? (
                                                        <div className="flex items-center gap-0.5 justify-end">
                                                            <button
                                                                onClick={() => startEdit(log)}
                                                                title={t('edit_action')}
                                                                className="inline-flex items-center justify-center h-6 w-6 rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                                                            >
                                                                <Pencil className="h-3 w-3" />
                                                            </button>
                                                            <button
                                                                onClick={() => handleDelete(log.id)}
                                                                disabled={deleteProgress.isPending}
                                                                title={t('delete_action')}
                                                                className="inline-flex items-center justify-center h-6 w-6 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40"
                                                            >
                                                                <Trash2 className="h-3 w-3" />
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-slate-50 text-slate-400">
                                                            {t('locked')}
                                                        </Badge>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    {/* Editing banner */}
                    {editingLogId && (
                        <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs text-emerald-700">
                            <Pencil className="h-3 w-3 shrink-0" />
                            {t('editing_existing_log')}
                            <Button size="sm" variant="ghost" className="h-5 ml-auto text-xs px-2" onClick={cancelEdit}>
                                {t('cancel_edit')}
                            </Button>
                        </div>
                    )}

                    {/* Form fields */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="space-y-1">
                            <label className="text-xs font-medium text-slate-600">{t('log_date')}</label>
                            <Input type="date" value={logDate} onChange={(e) => setLogDate(e.target.value)} className="h-9 bg-white border-slate-300 shadow-sm" />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-medium text-slate-600">{t('progress_hours_today')}</label>
                            <Input
                                type="number"
                                min={0}
                                step={0.25}
                                value={progressHours}
                                onChange={(e) => setProgress(e.target.value)}
                                placeholder={t('up_to_hours', { hours: phase.estimatedHours })}
                                className="h-9 bg-white border-slate-300 shadow-sm"
                            />
                            <p className="text-[10px] text-slate-400">{t('progress_hours_help')}</p>
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-medium text-slate-600">{t('used_hours_today')}</label>
                            <Input
                                type="number"
                                min={0}
                                step={0.25}
                                value={usedHours}
                                onChange={(e) => setUsed(e.target.value)}
                                placeholder="e.g. 8"
                                className="h-9 bg-white border-slate-300 shadow-sm"
                            />
                            <p className="text-[10px] text-slate-400">{t('used_hours_help')}</p>
                        </div>
                    </div>

                    <div className="space-y-1">
                        <label className="text-xs font-medium text-slate-600">{t('note_optional')}</label>
                        <Textarea
                            rows={2}
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder={t('note_placeholder')}
                            className="bg-white border-slate-300 shadow-sm"
                        />
                    </div>

                    {/* Phase milestones */}
                    {!editingLogId && (
                        <div className="border-t border-slate-200 pt-4">
                            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">{t('phase_milestones_optional')}</div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <label className="text-xs font-medium text-slate-600">{t('actual_start_date_label')}</label>
                                    <Input type="date" value={actualStart} onChange={(e) => setActualStart(e.target.value)} className="h-9 bg-white border-slate-300 shadow-sm" />
                                    <p className="text-[10px] text-slate-400">{t('actual_start_help')}</p>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-medium text-slate-600">{t('actual_end_date_label')}</label>
                                    <Input type="date" value={actualEnd} onChange={(e) => setActualEnd(e.target.value)} className="h-9 bg-white border-slate-300 shadow-sm" />
                                    <p className="text-[10px] text-slate-400">{t('actual_end_help')}</p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Modal footer */}
                <div className="border-t border-slate-200 bg-slate-50/50 px-6 py-3.5 flex items-center justify-end gap-2.5">
                    <Button variant="outline" onClick={onClose} disabled={inFlight}>{t('cancel')}</Button>
                    <Button
                        onClick={save}
                        disabled={inFlight || progressHours === '' || usedHours === ''}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                        {inFlight ? t('saving') : editingLogId ? t('update_log') : t('save_log')}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
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
