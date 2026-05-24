'use client';

import { useTranslations } from 'next-intl';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table';
import { AlertTriangle, ArrowRightLeft, CalendarClock } from 'lucide-react';
import type { ReassignmentCheck } from '@/types/business';

interface Props {
    open: boolean;
    check: ReassignmentCheck;
    phaseName: string;
    newAssigneeName: string;
    onCancel: () => void;
    onReadjust: () => void;
    onSwap?: (conflictPhaseId: string) => void;
    isLoading?: boolean;
}

export function ReassignConflictDialog({
    open,
    check,
    phaseName,
    newAssigneeName,
    onCancel,
    onReadjust,
    onSwap,
    isLoading,
}: Props) {
    const t = useTranslations();

    return (
        <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-amber-700">
                        <AlertTriangle className="h-5 w-5" />
                        {t('reassign_conflict_title')}
                    </DialogTitle>
                    <DialogDescription>
                        {t('reassign_conflict_desc', { employee: newAssigneeName, phase: phaseName })}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 mt-2">
                    <div className="space-y-1.5">
                        <div className="text-xs font-medium text-slate-700">{t('conflicting_phases')}</div>
                        <div className="max-h-40 overflow-y-auto rounded-md border border-amber-200 bg-amber-50/30">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="h-8 text-xs">{t('function_name')}</TableHead>
                                        <TableHead className="h-8 text-xs">{t('phase')}</TableHead>
                                        <TableHead className="h-8 text-xs">{t('dates')}</TableHead>
                                        <TableHead className="h-8 text-xs text-right">{t('hours')}</TableHead>
                                        {onSwap && <TableHead className="h-8 text-xs w-[60px]" />}
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {check.conflicts.map((c) => (
                                        <TableRow key={c.phaseAssignmentId}>
                                            <TableCell className="py-1.5 text-xs font-medium">{c.functionName}</TableCell>
                                            <TableCell className="py-1.5 text-xs">
                                                <Badge variant="outline" className="text-[10px]">{c.phaseName}</Badge>
                                            </TableCell>
                                            <TableCell className="py-1.5 text-xs font-mono">{c.plannedStart} → {c.plannedEnd}</TableCell>
                                            <TableCell className="py-1.5 text-xs text-right">{c.estimatedHours}h</TableCell>
                                            {onSwap && (
                                                <TableCell className="py-1 text-right">
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        className="h-6 px-2 text-xs"
                                                        onClick={() => onSwap(c.phaseAssignmentId)}
                                                        disabled={isLoading}
                                                        title={t('swap_with_this')}
                                                    >
                                                        <ArrowRightLeft className="h-3 w-3" />
                                                    </Button>
                                                </TableCell>
                                            )}
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </div>

                    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                        {t('remaining_hours_info', { hours: check.remainingHours })}
                    </div>

                    {check.readjustedDates && (
                        <div className="space-y-1.5">
                            <div className="text-xs font-medium text-slate-700 flex items-center gap-1">
                                <CalendarClock className="h-3.5 w-3.5" />
                                {t('readjust_preview')}
                            </div>
                            <div className="rounded-md border border-emerald-200 bg-emerald-50/30 px-3 py-2 text-xs">
                                <span className="font-medium">{phaseName}</span>
                                {' → '}
                                <span className="font-mono">{check.readjustedDates.plannedStart} → {check.readjustedDates.plannedEnd}</span>
                            </div>

                            {check.cascadePreview.length > 0 && (
                                <div className="space-y-1">
                                    <div className="text-[10px] text-slate-500 uppercase tracking-wide">{t('cascade_shifts')}</div>
                                    <div className="max-h-28 overflow-y-auto space-y-1">
                                        {check.cascadePreview.map((c) => (
                                            <div key={c.phaseAssignmentId} className="rounded border border-slate-200 bg-white px-2 py-1 text-xs flex items-center gap-2">
                                                <span className="font-medium">{c.functionName} ({c.phaseName})</span>
                                                <span className="text-slate-400 font-mono line-through">{c.originalStart}→{c.originalEnd}</span>
                                                <span className="text-emerald-600 font-mono">{c.newStart}→{c.newEnd}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {check.warnings.length > 0 && (
                        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                            <div className="font-medium mb-1">{t('warnings')}</div>
                            <ul className="list-disc pl-4 space-y-0.5">
                                {check.warnings.map((w, i) => <li key={i}>{w}</li>)}
                            </ul>
                        </div>
                    )}
                </div>

                <DialogFooter className="gap-2">
                    <Button variant="ghost" onClick={onCancel} disabled={isLoading}>
                        {t('cancel')}
                    </Button>
                    {check.readjustedDates && (
                        <Button onClick={onReadjust} disabled={isLoading} className="bg-emerald-600 hover:bg-emerald-700">
                            {isLoading ? t('saving') : t('readjust_schedule')}
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
