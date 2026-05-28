'use client';

import { useTranslations } from 'next-intl';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, ArrowDownUp, UserCheck, UserPlus, Info } from 'lucide-react';
import type { ReassignmentCheck, ReassignmentConflict, ReverseConflict } from '@/types/business';

// ── Step 0: Direct Assign Confirmation (no conflicts) ───────────────────────

interface DirectAssignProps {
    open: boolean;
    phaseName: string;
    functionName: string;
    currentAssigneeName: string;
    newAssigneeName: string;
    plannedStart: string | null;
    plannedEnd: string | null;
    estimatedHours: number;
    onConfirm: () => void;
    onCancel: () => void;
    isLoading?: boolean;
}

export function DirectAssignDialog({
    open,
    phaseName,
    functionName,
    currentAssigneeName,
    newAssigneeName,
    plannedStart,
    plannedEnd,
    estimatedHours,
    onConfirm,
    onCancel,
    isLoading,
}: DirectAssignProps) {
    const t = useTranslations();

    return (
        <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
            <DialogContent className="max-w-[440px] p-0 gap-0 overflow-hidden">
                <div className="bg-blue-50 border-b border-blue-200 px-6 pt-5 pb-4">
                    <DialogHeader className="gap-1.5">
                        <DialogTitle className="flex items-center gap-2.5 text-base text-blue-800">
                            <div className="flex items-center justify-center h-8 w-8 rounded-full bg-blue-100 shrink-0">
                                <UserPlus className="h-4.5 w-4.5 text-blue-600" />
                            </div>
                            {t('confirm_reassignment')}
                        </DialogTitle>
                        <DialogDescription className="text-[13px] text-blue-700/80 pl-[42px]">
                            {t.rich('confirm_reassignment_desc', {
                                from: currentAssigneeName,
                                to: newAssigneeName,
                                bold: (chunks) => <strong className="font-semibold text-blue-800">{chunks}</strong>,
                            })}
                        </DialogDescription>
                    </DialogHeader>
                </div>

                <div className="px-6 py-4">
                    <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3 text-xs text-slate-700 space-y-1.5">
                        <div className="flex justify-between">
                            <span className="text-slate-500">{t('function_name')}</span>
                            <span className="font-medium text-slate-800">{functionName}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-slate-500">{t('phase')}</span>
                            <Badge variant="outline" className="text-[10px] font-normal">{phaseName}</Badge>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-slate-500">{t('dates')}</span>
                            <span className="font-mono">{plannedStart ?? '—'} → {plannedEnd ?? '—'}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-slate-500">{t('hours')}</span>
                            <span className="font-medium">{estimatedHours}h</span>
                        </div>
                    </div>
                </div>

                <div className="border-t border-slate-200 bg-slate-50/50 px-6 py-3.5 flex items-center justify-end gap-2">
                    <Button variant="outline" onClick={onCancel} disabled={isLoading}>
                        {t('cancel')}
                    </Button>
                    <Button
                        onClick={onConfirm}
                        disabled={isLoading}
                        className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"
                    >
                        <UserCheck className="h-3.5 w-3.5" />
                        {t('confirm')}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}

// ── Step 1: Conflict Confirmation ───────────────────────────────────────────

interface ConflictConfirmProps {
    open: boolean;
    conflicts: ReassignmentConflict[];
    newAssigneeName: string;
    phaseName: string;
    onSwap: (conflict: ReassignmentConflict) => void;
    onAssignAnyway: () => void;
    onCancel: () => void;
    isLoading?: boolean;
}

export function ConflictConfirmDialog({
    open,
    conflicts,
    newAssigneeName,
    phaseName,
    onSwap,
    onAssignAnyway,
    onCancel,
    isLoading,
}: ConflictConfirmProps) {
    const t = useTranslations();

    return (
        <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
            <DialogContent className="max-w-[520px] p-0 gap-0 overflow-hidden">
                <div className="bg-amber-50 border-b border-amber-200 px-6 pt-5 pb-4">
                    <DialogHeader className="gap-1.5">
                        <DialogTitle className="flex items-center gap-2.5 text-base text-amber-800">
                            <div className="flex items-center justify-center h-8 w-8 rounded-full bg-amber-100 shrink-0">
                                <AlertTriangle className="h-4.5 w-4.5 text-amber-600" />
                            </div>
                            {t('reassign_conflict_title')}
                        </DialogTitle>
                        <DialogDescription className="text-[13px] text-amber-700/80 pl-[42px]">
                            {t.rich('conflict_confirm_desc', {
                                name: newAssigneeName,
                                count: conflicts.length,
                                bold: (chunks) => <strong className="font-semibold text-amber-800">{chunks}</strong>,
                            })}
                        </DialogDescription>
                    </DialogHeader>
                </div>

                <div className="px-6 py-4 space-y-3">
                    <div className="rounded-lg border border-amber-200 bg-amber-50/40 overflow-hidden">
                        <table className="w-full text-xs">
                            <thead>
                                <tr className="bg-amber-50 border-b border-amber-200">
                                    <th className="text-left px-3 py-2 font-medium text-amber-700">{t('function_name')}</th>
                                    <th className="text-left px-3 py-2 font-medium text-amber-700">{t('phase')}</th>
                                    <th className="text-left px-3 py-2 font-medium text-amber-700">{t('dates')}</th>
                                    <th className="text-right px-3 py-2 font-medium text-amber-700">{t('hours')}</th>
                                    {conflicts.length > 1 && <th className="w-20" />}
                                </tr>
                            </thead>
                            <tbody>
                                {conflicts.map((c, i) => (
                                    <tr key={c.phaseAssignmentId} className={i < conflicts.length - 1 ? 'border-b border-amber-100' : ''}>
                                        <td className="px-3 py-2.5 font-medium text-slate-800">{c.functionName}</td>
                                        <td className="px-3 py-2.5">
                                            <Badge variant="outline" className="text-[10px] font-normal border-amber-300 text-amber-700">{c.phaseName}</Badge>
                                        </td>
                                        <td className="px-3 py-2.5 font-mono text-slate-600">{c.plannedStart} → {c.plannedEnd}</td>
                                        <td className="px-3 py-2.5 text-right font-medium text-slate-700">{c.estimatedHours}h</td>
                                        {conflicts.length > 1 && (
                                            <td className="px-2 py-2.5 text-center">
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className="h-7 px-2 text-xs gap-1 border-amber-300 text-amber-700 hover:bg-amber-100"
                                                    onClick={() => onSwap(c)}
                                                    disabled={isLoading}
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

                    <div className="flex items-start gap-2 rounded-lg bg-slate-100 border border-slate-200 px-3 py-2.5">
                        <Info className="h-3.5 w-3.5 text-slate-500 shrink-0 mt-0.5" />
                        <span className="text-[11px] text-slate-600">{t('assign_anyway_warning')}</span>
                    </div>
                </div>

                <div className="border-t border-slate-200 bg-slate-50/50 px-6 py-3.5 flex items-center justify-end gap-2">
                    <Button variant="outline" onClick={onCancel} disabled={isLoading}>
                        {t('cancel')}
                    </Button>
                    <Button
                        variant="outline"
                        onClick={onAssignAnyway}
                        disabled={isLoading}
                        className="gap-1.5 border-slate-300 text-slate-700 hover:bg-slate-100"
                    >
                        <UserCheck className="h-3.5 w-3.5" />
                        {t('assign_anyway')}
                    </Button>
                    {conflicts.length === 1 && (
                        <Button
                            onClick={() => onSwap(conflicts[0])}
                            disabled={isLoading}
                            className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"
                        >
                            <ArrowDownUp className="h-3.5 w-3.5" />
                            {t('try_swap')}
                        </Button>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}

// ── Step 2: Swap Confirmation / Warning ─────────────────────────────────────
// Green theme when no reverse conflicts (safe swap preview).
// Orange/red theme when reverse conflicts exist (warning).

interface SwapWarningProps {
    open: boolean;
    currentAssigneeName: string;
    newAssigneeName: string;
    phaseName: string;
    functionName: string;
    currentPlannedStart: string | null;
    currentPlannedEnd: string | null;
    currentEstimatedHours: number;
    swapConflict: ReassignmentConflict;
    reverseConflicts: ReverseConflict[];
    onConfirmSwap: () => void;
    onCancel: () => void;
    isLoading?: boolean;
}

export function SwapWarningDialog({
    open,
    currentAssigneeName,
    newAssigneeName,
    phaseName,
    functionName,
    currentPlannedStart,
    currentPlannedEnd,
    currentEstimatedHours,
    swapConflict,
    reverseConflicts,
    onConfirmSwap,
    onCancel,
    isLoading,
}: SwapWarningProps) {
    const t = useTranslations();

    const relevantReverse = reverseConflicts.find((rc) => rc.swapPhaseId === swapConflict.phaseAssignmentId);
    const hasWarning = !!relevantReverse;

    return (
        <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
            <DialogContent className="max-w-[680px] p-0 gap-0 overflow-hidden">
                {/* Header — green when clean, orange when conflicts */}
                <div className={`border-b px-6 pt-5 pb-4 ${hasWarning ? 'bg-orange-50 border-orange-200' : 'bg-emerald-50 border-emerald-200'}`}>
                    <DialogHeader className="gap-1.5">
                        <DialogTitle className={`flex items-center gap-2.5 text-base ${hasWarning ? 'text-orange-800' : 'text-emerald-800'}`}>
                            <div className={`flex items-center justify-center h-8 w-8 rounded-full shrink-0 ${hasWarning ? 'bg-orange-100' : 'bg-emerald-100'}`}>
                                {hasWarning
                                    ? <AlertTriangle className="h-4.5 w-4.5 text-orange-600" />
                                    : <ArrowDownUp className="h-4.5 w-4.5 text-emerald-600" />
                                }
                            </div>
                            {hasWarning ? t('swap_warning_title') : t('swap_confirm_title')}
                        </DialogTitle>
                        <DialogDescription className={`text-[13px] pl-[42px] ${hasWarning ? 'text-orange-700/80' : 'text-emerald-700/80'}`}>
                            {hasWarning
                                ? t.rich('swap_warning_desc', {
                                    nameA: currentAssigneeName,
                                    nameB: newAssigneeName,
                                    bold: (chunks) => <strong className="font-semibold text-orange-800">{chunks}</strong>,
                                })
                                : t.rich('swap_confirm_desc', {
                                    nameA: currentAssigneeName,
                                    nameB: newAssigneeName,
                                    bold: (chunks) => <strong className="font-semibold text-emerald-800">{chunks}</strong>,
                                })
                            }
                        </DialogDescription>
                    </DialogHeader>
                </div>

                <div className="px-6 py-5 space-y-4 max-h-[60vh] overflow-y-auto">
                    <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                        {t('swap_preview')}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        {/* A gets B's phase */}
                        <div className="rounded-lg border border-blue-200 bg-blue-50/40 p-3">
                            <div className="text-[11px] font-medium text-blue-700 mb-2 flex items-center gap-1.5">
                                <span className="inline-block w-2 h-2 rounded-full bg-blue-400" />
                                <strong className="font-bold">{currentAssigneeName}</strong> ← {t('receives')}
                            </div>
                            <div className="text-xs text-slate-700 space-y-1">
                                <div><span className="text-slate-500">{t('phase')}:</span> {swapConflict.phaseName}</div>
                                <div><span className="text-slate-500">{t('function_name')}:</span> {swapConflict.functionName}</div>
                                <div className="font-mono text-[11px]">{swapConflict.plannedStart} → {swapConflict.plannedEnd}</div>
                                <div className="font-medium">{swapConflict.estimatedHours}h</div>
                            </div>
                        </div>

                        {/* B gets A's phase */}
                        <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-3">
                            <div className="text-[11px] font-medium text-amber-700 mb-2 flex items-center gap-1.5">
                                <span className="inline-block w-2 h-2 rounded-full bg-amber-400" />
                                <strong className="font-bold">{newAssigneeName}</strong> ← {t('receives')}
                            </div>
                            <div className="text-xs text-slate-700 space-y-1">
                                <div><span className="text-slate-500">{t('phase')}:</span> {phaseName}</div>
                                <div><span className="text-slate-500">{t('function_name')}:</span> {functionName}</div>
                                <div className="font-mono text-[11px]">{currentPlannedStart ?? '—'} → {currentPlannedEnd ?? '—'}</div>
                                <div className="font-medium">{currentEstimatedHours}h</div>
                            </div>
                        </div>
                    </div>

                    {/* No conflicts — green confirmation message */}
                    {!hasWarning && (
                        <div className="flex items-center gap-2.5 rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3">
                            <ArrowDownUp className="h-4 w-4 text-emerald-500 shrink-0" />
                            <span className="text-xs text-emerald-700">{t('swap_no_conflicts')}</span>
                        </div>
                    )}

                    {/* Reverse conflicts for A */}
                    {relevantReverse && (
                        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
                            <div className="flex items-start gap-2 mb-2">
                                <Info className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                                <span className="text-xs font-semibold text-red-800">
                                    {t.rich('reverse_conflict_warning', {
                                        name: currentAssigneeName,
                                        bold: (chunks) => <strong className="font-bold">{chunks}</strong>,
                                    })}
                                </span>
                            </div>
                            <div className="rounded border border-red-200 bg-white/60 overflow-hidden mt-2">
                                <table className="w-full text-xs">
                                    <thead>
                                        <tr className="bg-red-50/80 border-b border-red-200">
                                            <th className="text-left px-3 py-1.5 font-medium text-red-700">{t('function_name')}</th>
                                            <th className="text-left px-3 py-1.5 font-medium text-red-700">{t('phase')}</th>
                                            <th className="text-left px-3 py-1.5 font-medium text-red-700">{t('dates')}</th>
                                            <th className="text-right px-3 py-1.5 font-medium text-red-700">{t('hours')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {relevantReverse.conflicts.map((c, i) => (
                                            <tr key={c.phaseAssignmentId} className={i < relevantReverse.conflicts.length - 1 ? 'border-b border-red-100' : ''}>
                                                <td className="px-3 py-2 text-slate-800">{c.functionName}</td>
                                                <td className="px-3 py-2">
                                                    <Badge variant="outline" className="text-[10px] font-normal border-red-300 text-red-700">{c.phaseName}</Badge>
                                                </td>
                                                <td className="px-3 py-2 font-mono text-slate-600">{c.plannedStart} → {c.plannedEnd}</td>
                                                <td className="px-3 py-2 text-right font-medium text-slate-700">{c.estimatedHours}h</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>

                <div className="border-t border-slate-200 bg-slate-50/50 px-6 py-3.5 flex items-center justify-end gap-2">
                    <Button variant="outline" onClick={onCancel} disabled={isLoading}>
                        {t('cancel')}
                    </Button>
                    <Button
                        onClick={onConfirmSwap}
                        disabled={isLoading}
                        className={`gap-1.5 text-white ${hasWarning ? 'bg-orange-600 hover:bg-orange-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}
                    >
                        <ArrowDownUp className="h-3.5 w-3.5" />
                        {t('confirm_swap')}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
