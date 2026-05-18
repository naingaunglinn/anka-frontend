'use client';

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
                    Planned: {row.plannedStart ?? '—'} → {row.plannedEnd ?? '—'} ・ Estimated {row.estimatedHours}h ・ Assignee: {row.assigneeName ?? 'unassigned'}
                </div>

                <div className="grid grid-cols-4 gap-3 mt-4 text-sm">
                    <div className="bg-[#fafbfc] rounded p-2">
                        <div className="text-[10px] uppercase text-[#8a8a8a]">Progress</div>
                        <div className="font-medium">{row.variance.cumulativeProgressHours} / {row.estimatedHours}h</div>
                    </div>
                    <div className="bg-[#fafbfc] rounded p-2">
                        <div className="text-[10px] uppercase text-[#8a8a8a]">Used</div>
                        <div className="font-medium">{row.variance.cumulativeUsedHours}h</div>
                    </div>
                    <div className="bg-[#fafbfc] rounded p-2">
                        <div className="text-[10px] uppercase text-[#8a8a8a]">Expected (today)</div>
                        <div className="font-medium">{row.variance.expectedProgressHours}h</div>
                    </div>
                    <div className="bg-[#fafbfc] rounded p-2">
                        <div className="text-[10px] uppercase text-[#8a8a8a]">Progress Status</div>
                        <div className={`font-medium ${row.variance.varianceHours < 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                            {row.variance.varianceHours > 0 ? '+' : ''}{row.variance.varianceHours}h
                        </div>
                    </div>
                </div>

                <div className="mt-4">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Date</TableHead>
                                <TableHead>Employee</TableHead>
                                <TableHead className="text-right">Progress</TableHead>
                                <TableHead className="text-right">Used</TableHead>
                                <TableHead>Note</TableHead>
                                <TableHead className="w-[120px]"></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {logsQuery.isLoading ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-6 text-[#8a8a8a] text-sm">Loading logs…</TableCell>
                                </TableRow>
                            ) : logs.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-6 text-[#8a8a8a] text-sm">No daily logs yet.</TableCell>
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
                                                    <Lock className="h-3 w-3 mr-1" /> Locked
                                                </Badge>
                                                {isManager && (
                                                    <Button size="sm" variant="ghost" onClick={() => unlockLog.mutate(log.id)}>
                                                        Unlock
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
                                                    if (window.confirm(`Delete the ${log.logDate} log (${log.progressHours}h progress / ${log.usedHours}h used)? This cannot be undone.`)) {
                                                        deleteLog.mutate(log.id);
                                                    }
                                                }}
                                            >
                                                {deleteLog.isPending && deleteLog.variables === log.id ? 'Deleting…' : 'Delete'}
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
