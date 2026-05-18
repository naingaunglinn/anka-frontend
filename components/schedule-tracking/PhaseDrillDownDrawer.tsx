'use client';

import { useTranslations } from 'next-intl';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Lock } from 'lucide-react';
import {
    usePhaseProgressLogs,
    useDeleteProgressLog,
    useUnlockProgressLog,
} from '@/lib/queries/scheduleTracking';
import type { ScheduleTrackingRow } from '@/types/business';

interface Props {
    open: boolean;
    onClose: () => void;
    row: ScheduleTrackingRow | null;
    isManager?: boolean; // controls visibility of unlock button
}

export function PhaseDrillDownDrawer({ open, onClose, row, isManager = false }: Props) {
    const t = useTranslations();
    const logsQuery = usePhaseProgressLogs(row?.id ?? null);
    const deleteLog = useDeleteProgressLog();
    const unlockLog = useUnlockProgressLog();
    const logs = logsQuery.data ?? [];

    if (!row) return null;

    return (
        <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
            <DialogContent className="max-w-3xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        {row.functionName}
                        <Badge variant="outline">{row.phaseName}</Badge>
                    </DialogTitle>
                </DialogHeader>

                <div className="text-xs text-[#8a8a8a] mt-1">
                    {t('planned_to_estimated_assignee', { start: row.plannedStart ?? '—', end: row.plannedEnd ?? '—', hours: row.estimatedHours, assignee: row.assigneeName ?? t('unassigned_label') })}
                </div>

                <div className="grid grid-cols-4 gap-3 mt-4 text-sm">
                    <div className="bg-[#fafbfc] rounded p-2">
                        <div className="text-[10px] uppercase text-[#8a8a8a]">{t('progress_label')}</div>
                        <div className="font-medium">{row.variance.cumulativeProgressHours} / {row.estimatedHours}h</div>
                    </div>
                    <div className="bg-[#fafbfc] rounded p-2">
                        <div className="text-[10px] uppercase text-[#8a8a8a]">{t('used_label')}</div>
                        <div className="font-medium">{row.variance.cumulativeUsedHours}h</div>
                    </div>
                    <div className="bg-[#fafbfc] rounded p-2">
                        <div className="text-[10px] uppercase text-[#8a8a8a]">{t('expected_today')}</div>
                        <div className="font-medium">{row.variance.expectedProgressHours}h</div>
                    </div>
                    <div className="bg-[#fafbfc] rounded p-2">
                        <div className="text-[10px] uppercase text-[#8a8a8a]">{t('variance')}</div>
                        <div className={`font-medium ${row.variance.varianceHours < 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                            {row.variance.varianceHours > 0 ? '+' : ''}{row.variance.varianceHours}h
                        </div>
                    </div>
                </div>

                <div className="mt-4">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>{t('date')}</TableHead>
                                <TableHead>{t('employee')}</TableHead>
                                <TableHead className="text-right">{t('progress_label')}</TableHead>
                                <TableHead className="text-right">{t('used_label')}</TableHead>
                                <TableHead>{t('note_col')}</TableHead>
                                <TableHead className="w-[120px]"></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {logsQuery.isLoading ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-6 text-[#8a8a8a] text-sm">{t('loading_logs')}</TableCell>
                                </TableRow>
                            ) : logs.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-6 text-[#8a8a8a] text-sm">{t('no_daily_logs')}</TableCell>
                                </TableRow>
                            ) : logs.map((log) => (
                                <TableRow key={log.id}>
                                    <TableCell className="whitespace-nowrap">{log.logDate}</TableCell>
                                    <TableCell>{log.employeeName ?? log.employeeId}</TableCell>
                                    <TableCell className="text-right font-medium">{log.progressHours}h</TableCell>
                                    <TableCell className="text-right font-medium">{log.usedHours}h</TableCell>
                                    <TableCell className="text-xs text-[#8a8a8a]">{log.note ?? '—'}</TableCell>
                                    <TableCell>
                                        {log.isLocked ? (
                                            <div className="flex items-center gap-1">
                                                <Badge variant="outline" className="text-xs bg-slate-50 text-slate-600">
                                                    <Lock className="h-3 w-3 mr-1" /> {t('locked')}
                                                </Badge>
                                                {isManager && (
                                                    <Button size="sm" variant="ghost" onClick={() => unlockLog.mutate(log.id)}>
                                                        {t('unlock')}
                                                    </Button>
                                                )}
                                            </div>
                                        ) : (
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                className="text-rose-700"
                                                disabled={deleteLog.isPending && deleteLog.variables === log.id}
                                                onClick={() => {
                                                    if (window.confirm(t('delete_log_confirm', { date: log.logDate, progress: log.progressHours, used: log.usedHours }))) {
                                                        deleteLog.mutate(log.id);
                                                    }
                                                }}
                                            >
                                                {deleteLog.isPending && deleteLog.variables === log.id ? t('deleting_dots') : t('delete')}
                                            </Button>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </DialogContent>
        </Dialog>
    );
}
