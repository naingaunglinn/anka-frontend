'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import toast from 'react-hot-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertTriangle, RefreshCw, Sparkles, Users } from 'lucide-react';
import {
    usePlanTeamPreview,
    useConfirmTeamPlan,
    type TeamPlanPreview,
    type TeamPlanProposed,
} from '@/lib/queries/projects';

interface Props {
    open: boolean;
    onClose: () => void;
    projectId: string | null;
    projectName?: string;
    /** Called after the user confirms and the team is persisted. The caller
     *  triggers the existing /assign-tasks flow from here. */
    onConfirmed: () => void;
}

const RANK_MATCH_VARIANTS: Record<TeamPlanProposed['rankMatch'], string> = {
    exact:     'bg-emerald-50 text-emerald-700 border-emerald-200',
    downgrade: 'bg-amber-50 text-amber-700 border-amber-200',
    upgrade:   'bg-sky-50 text-sky-700 border-sky-200',
    split:     'bg-indigo-50 text-indigo-700 border-indigo-200',
};

export function TeamPreviewDialog({ open, onClose, projectId, projectName, onConfirmed }: Props) {
    const t = useTranslations();
    const planPreview = usePlanTeamPreview(projectId ?? '');
    const confirmTeam = useConfirmTeamPlan(projectId ?? '');
    const [preview, setPreview] = useState<TeamPlanPreview | null>(null);

    // Cumulative pool of employee IDs the AI has already proposed in this
    // preview session. Each Regenerate click sends this set to the backend so
    // the next AI call picks from a different (smaller) pool. Reset whenever
    // the dialog opens for a (possibly different) project. The `kept` team
    // members are NEVER added here — they're preserved regardless.
    const [excludedIds, setExcludedIds] = useState<string[]>([]);
    const [regenerateCount, setRegenerateCount] = useState(0);

    useEffect(() => {
        if (!open || !projectId) {
            setPreview(null);
            setExcludedIds([]);
            setRegenerateCount(0);
            return;
        }
        setPreview(null);
        setExcludedIds([]);
        setRegenerateCount(0);
        planPreview.mutate(undefined, {
            onSuccess: (p) => setPreview(p),
        });
        // We intentionally only re-run when the dialog opens for a project.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, projectId]);

    const handleRegenerate = () => {
        if (!projectId || !preview) return;
        // Accumulate the IDs from the proposal being thrown away. The `kept`
        // team is untouched on the backend regardless of what we send here.
        const newExclusions = Array.from(
            new Set([...excludedIds, ...preview.proposed.map((p) => p.employeeId)]),
        );
        setExcludedIds(newExclusions);
        planPreview.mutate(
            { excludeEmployeeIds: newExclusions },
            {
                onSuccess: (p) => {
                    setPreview(p);
                    setRegenerateCount((n) => n + 1);
                },
            },
        );
    };

    const loading = planPreview.isPending && !preview;
    const proposed = preview?.proposed ?? [];
    const kept = preview?.kept ?? [];
    const unfilled = preview?.unfilled ?? [];
    const nothingToDo = preview && proposed.length === 0 && unfilled.length === 0;

    const handleConfirm = () => {
        if (!projectId || !preview) return;

        // Send only employeeId — the backend recomputes allocated_hours
        // from the project's xlsx in the same transaction, so any number we
        // pass would be discarded. Empty picks are intentional and valid:
        // they trigger a refresh-only flow that re-runs the allocator
        // against the latest xlsx (e.g. after a v2 estimation upload).
        const picks = proposed.map((p) => ({
            employeeId: p.employeeId,
        }));

        confirmTeam.mutate(picks, {
            onSuccess: (res) => {
                const msg = res.inserted > 0
                    ? t(res.inserted === 1 ? 'team_confirmed_singular' : 'team_confirmed_plural', { count: res.inserted })
                    : t('allocations_refreshed');
                toast.success(msg);
                onConfirmed();
                onClose();
            },
        });
    };

    const busy = planPreview.isPending || confirmTeam.isPending;

    return (
        <Dialog open={open} onOpenChange={(v) => !v && !busy && onClose()}>
            <DialogContent className="!max-w-none w-fit min-w-[64rem] p-6">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-indigo-500" />
                        {t('ai_team_preview')}
                        {projectName && <span className="text-sm font-normal text-slate-500">— {projectName}</span>}
                    </DialogTitle>
                </DialogHeader>

                {loading && (
                    <div className="py-8 text-center text-sm text-slate-500">
                        <div className="inline-flex h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-500 mb-3" />
                        <div>{t('asking_ai_to_fit_team')}</div>
                    </div>
                )}

                {!loading && preview && (
                    <div className="space-y-5">
                        {preview.allocation && (
                            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                                    <span>
                                        <span className="text-slate-500">{t('project_work_xlsx')}</span>{' '}
                                        <span className="font-semibold tabular-nums">{preview.allocation.grandTotal}h</span>
                                    </span>
                                    <span>
                                        <span className="text-slate-500">{t('sum_of_allocations')}</span>{' '}
                                        <span className="font-semibold tabular-nums">{preview.allocation.sumOfAllocations}h</span>
                                    </span>
                                    {preview.allocation.xlsxPath && (
                                        <span className="text-slate-400">{t('from_xlsx_path', { path: preview.allocation.xlsxPath })}</span>
                                    )}
                                </div>
                                <div className="mt-1 text-[11px] text-slate-500">
                                    {t('allocation_explainer')}
                                </div>
                            </div>
                        )}

                        {nothingToDo && (
                            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                                {preview.message ?? t('already_fully_staffed')}
                            </div>
                        )}

                        {kept.length > 0 && (
                            <section>
                                <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                                    <Users className="h-3.5 w-3.5" /> {t('already_on_the_team')}
                                </div>
                                <div className="rounded-md border border-slate-200">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>{t('employee')}</TableHead>
                                                <TableHead>{t('rank')}</TableHead>
                                                <TableHead>{t('capacity_role')}</TableHead>
                                                <TableHead className="text-right">{t('allocated_h')}</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {kept.map((k) => (
                                                <TableRow key={k.employeeId}>
                                                    <TableCell>{k.name ?? k.employeeId}</TableCell>
                                                    <TableCell>{k.rankCode ?? '—'}</TableCell>
                                                    <TableCell>{k.capacityRole ?? '—'}</TableCell>
                                                    <TableCell className="text-right">{k.allocatedHours}</TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            </section>
                        )}

                        {proposed.length > 0 && (
                            <section>
                                <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                                    {t('ai_proposed_additions')}
                                </div>
                                <div className="rounded-md border border-slate-200">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>{t('role_needed_rank')}</TableHead>
                                                <TableHead>{t('employee')}</TableHead>
                                                <TableHead>{t('rank')}</TableHead>
                                                <TableHead className="text-right">{t('allocated_h')}</TableHead>
                                                <TableHead>{t('fit')}</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {proposed.map((p, i) => (
                                                <TableRow key={`${p.ghostRoleId}-${p.employeeId}-${i}`}>
                                                    <TableCell className="whitespace-nowrap">
                                                        <div className="font-medium">{p.roleType}</div>
                                                        <div className="text-xs text-slate-500">{p.neededRank ?? t('unspecified_rank')}</div>
                                                    </TableCell>
                                                    <TableCell className="whitespace-nowrap">{p.employeeName ?? p.employeeId}</TableCell>
                                                    <TableCell className="whitespace-nowrap">{p.employeeRank ?? '—'}</TableCell>
                                                    <TableCell className="text-right tabular-nums whitespace-nowrap">{p.allocatedHours}</TableCell>
                                                    <TableCell className="whitespace-nowrap">
                                                        <Badge variant="outline" className={`text-xs ${RANK_MATCH_VARIANTS[p.rankMatch]}`}>
                                                            {p.rankMatch}
                                                        </Badge>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            </section>
                        )}

                        {unfilled.length > 0 && (
                            <section>
                                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
                                    <div className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-amber-700">
                                        <AlertTriangle className="h-3.5 w-3.5" /> {t('unfilled_roles')}
                                    </div>
                                    <ul className="space-y-1 text-sm text-amber-900">
                                        {unfilled.map((u, i) => (
                                            <li key={`${u.ghostRoleId}-${i}`}>• {u.reason}</li>
                                        ))}
                                    </ul>
                                </div>
                            </section>
                        )}
                    </div>
                )}

                <DialogFooter className="gap-2 sm:gap-2">
                    <Button variant="ghost" onClick={onClose} disabled={busy}>
                        {t('cancel')}
                    </Button>
                    <Button
                        variant="outline"
                        onClick={handleRegenerate}
                        disabled={busy || !preview}
                        className="gap-1.5"
                        title={t('regenerate_team_tooltip')}
                    >
                        <RefreshCw className={`h-3.5 w-3.5 ${planPreview.isPending && regenerateCount > 0 ? 'animate-spin' : ''}`} />
                        {planPreview.isPending && regenerateCount > 0 ? t('regenerating') : t('regenerate')}
                        {regenerateCount > 0 && (
                            <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                                {regenerateCount}
                            </span>
                        )}
                    </Button>
                    <Button
                        onClick={handleConfirm}
                        disabled={busy || !preview}
                    >
                        {confirmTeam.isPending ? t('confirming') : t('ok_confirm_assign_tasks')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
