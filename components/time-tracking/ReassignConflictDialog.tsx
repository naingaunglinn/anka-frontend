'use client';

import { useTranslations } from 'next-intl';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, ArrowDownUp, Clock } from 'lucide-react';
import type { ReassignmentCheck } from '@/types/business';

interface Props {
    open: boolean;
    check: ReassignmentCheck;
    phaseName: string;
    functionName: string;
    currentAssigneeName: string;
    currentPlannedStart: string | null;
    currentPlannedEnd: string | null;
    currentEstimatedHours: number;
    newAssigneeName: string;
    onCancel: () => void;
    onSwap: (conflictPhaseId: string) => void;
    isLoading?: boolean;
}

export function ReassignConflictDialog({
    open,
    check,
    phaseName,
    functionName,
    currentAssigneeName,
    currentPlannedStart,
    currentPlannedEnd,
    currentEstimatedHours,
    newAssigneeName,
    onCancel,
    onSwap,
    isLoading,
}: Props) {
    const t = useTranslations();

    return (
        <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
            <DialogContent className="max-w-[720px] p-0 gap-0 overflow-hidden">
                {/* Header */}
                <div className="bg-amber-50 border-b border-amber-200 px-6 pt-5 pb-4">
                    <DialogHeader className="gap-1.5">
                        <DialogTitle className="flex items-center gap-2.5 text-base text-amber-800">
                            <div className="flex items-center justify-center h-8 w-8 rounded-full bg-amber-100 shrink-0">
                                <AlertTriangle className="h-4.5 w-4.5 text-amber-600" />
                            </div>
                            {t('reassign_conflict_title')}
                        </DialogTitle>
                        <DialogDescription className="text-[13px] text-amber-700/80 pl-[42px]">
                            {newAssigneeName} already has phases scheduled during this period.
                        </DialogDescription>
                    </DialogHeader>
                </div>

                {/* Body */}
                <div className="px-6 py-5 space-y-5 max-h-[65vh] overflow-y-auto">
                    {/* Conflicting phases — two tables with swap button */}
                    <div>
                        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
                            {t('conflicting_phases')}
                        </div>

                        {/* Employee A — the phase being reassigned */}
                        <div className="mb-1.5">
                            <div className="text-[11px] font-medium text-slate-500 flex items-center gap-1.5 mb-1.5">
                                <span className="inline-block w-2 h-2 rounded-full bg-blue-400" />
                                {currentAssigneeName}
                                <span className="text-slate-400">({t('current')})</span>
                            </div>
                            <div className="rounded-lg border border-blue-200 bg-blue-50/40 overflow-hidden">
                                <table className="w-full text-xs">
                                    <thead>
                                        <tr className="bg-blue-50 border-b border-blue-200">
                                            <th className="text-left px-3 py-2 font-medium text-blue-700">{t('function_name')}</th>
                                            <th className="text-left px-3 py-2 font-medium text-blue-700">{t('phase')}</th>
                                            <th className="text-left px-3 py-2 font-medium text-blue-700">{t('dates')}</th>
                                            <th className="text-right px-3 py-2 font-medium text-blue-700">{t('hours')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <td className="px-3 py-2.5 font-medium text-slate-800">{functionName}</td>
                                            <td className="px-3 py-2.5">
                                                <Badge variant="outline" className="text-[10px] font-normal border-blue-300 text-blue-700">{phaseName}</Badge>
                                            </td>
                                            <td className="px-3 py-2.5 font-mono text-slate-600">
                                                {currentPlannedStart ?? '—'} → {currentPlannedEnd ?? '—'}
                                            </td>
                                            <td className="px-3 py-2.5 text-right font-medium text-slate-700">{currentEstimatedHours}h</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Swap button — equal spacing above and below */}
                        <div className="flex justify-center my-3">
                            {check.conflicts.length === 1 ? (
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-8 px-4 text-xs gap-1.5 border-slate-300 text-slate-600 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300"
                                    onClick={() => onSwap(check.conflicts[0].phaseAssignmentId)}
                                    disabled={isLoading}
                                    title={t('swap_with_this')}
                                >
                                    <ArrowDownUp className="h-3.5 w-3.5" />
                                    {t('swap')}
                                </Button>
                            ) : (
                                <div className="flex items-center justify-center h-8 w-8 rounded-full bg-slate-100 border border-slate-200">
                                    <ArrowDownUp className="h-4 w-4 text-slate-400" />
                                </div>
                            )}
                        </div>

                        {/* Employee B — conflicting phases */}
                        <div>
                            <div className="text-[11px] font-medium text-slate-500 flex items-center gap-1.5 mb-1.5">
                                <span className="inline-block w-2 h-2 rounded-full bg-amber-400" />
                                {newAssigneeName}
                                <span className="text-slate-400">({t('conflict')})</span>
                            </div>
                            <div className="rounded-lg border border-amber-200 bg-amber-50/40 overflow-hidden">
                                <table className="w-full text-xs">
                                    <thead>
                                        <tr className="bg-amber-50 border-b border-amber-200">
                                            <th className="text-left px-3 py-2 font-medium text-amber-700">{t('function_name')}</th>
                                            <th className="text-left px-3 py-2 font-medium text-amber-700">{t('phase')}</th>
                                            <th className="text-left px-3 py-2 font-medium text-amber-700">{t('dates')}</th>
                                            <th className="text-right px-3 py-2 font-medium text-amber-700">{t('hours')}</th>
                                            {check.conflicts.length > 1 && <th className="w-16" />}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {check.conflicts.map((c, i) => (
                                            <tr
                                                key={c.phaseAssignmentId}
                                                className={i < check.conflicts.length - 1 ? 'border-b border-amber-100' : ''}
                                            >
                                                <td className="px-3 py-2.5 font-medium text-slate-800">{c.functionName}</td>
                                                <td className="px-3 py-2.5">
                                                    <Badge variant="outline" className="text-[10px] font-normal border-amber-300 text-amber-700">{c.phaseName}</Badge>
                                                </td>
                                                <td className="px-3 py-2.5 font-mono text-slate-600">
                                                    {c.plannedStart} → {c.plannedEnd}
                                                </td>
                                                <td className="px-3 py-2.5 text-right font-medium text-slate-700">{c.estimatedHours}h</td>
                                                {check.conflicts.length > 1 && (
                                                    <td className="px-2 mt-3 py-2.5 text-center">
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            className="h-7 px-2 text-xs gap-1 border-amber-300 text-amber-700 hover:bg-amber-100"
                                                            onClick={() => onSwap(c.phaseAssignmentId)}
                                                            disabled={isLoading}
                                                            title={t('swap_with_this')}
                                                        >
                                                            <ArrowDownUp className="h-3 w-3" />
                                                            {t('swap')}
                                                        </Button>
                                                    </td>
                                                )}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>

                    {/* Remaining hours */}
                    <div className="flex items-center gap-2.5 rounded-lg bg-blue-50 border border-blue-100 px-4 py-3">
                        <Clock className="h-4 w-4 text-blue-500 shrink-0" />
                        <span className="text-xs text-blue-700">
                            {t('remaining_hours_info', { hours: check.remainingHours })}
                        </span>
                    </div>

                    {/* Warnings */}
                    {check.warnings.length > 0 && (
                        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
                            <div className="font-semibold mb-1">{t('warnings')}</div>
                            <ul className="list-disc pl-4 space-y-0.5">
                                {check.warnings.map((w, i) => <li key={i}>{w}</li>)}
                            </ul>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="border-t border-slate-200 bg-slate-50/50 px-6 py-3.5 flex items-center justify-end">
                    <Button variant="outline" onClick={onCancel} disabled={isLoading}>
                        {t('cancel')}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
