'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import toast from 'react-hot-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertTriangle, Plus, RefreshCw, Sparkles, Trash2, Users } from 'lucide-react';
import {
    usePlanTeamPreview,
    useConfirmTeamPlan,
    useAvailableEmployees,
    type AvailableEmployee,
    type TeamPlanPreview,
    type TeamPlanProposed,
    type TeamPlanRoleToFill,
} from '@/lib/queries/projects';
import { normalizeError } from '@/lib/errorHandler';

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

const MANUAL_BADGE_CLASS = 'bg-indigo-50 text-indigo-700 border-indigo-200';

/** Sentinel value for "no specific ghost role" in the Add-row dropdown. */
const NO_ROLE_VALUE = '__no_role__';

interface AdditionRow {
    /** null = "no specific role" (backend gives 1-month workable_hours fallback) */
    ghostRoleId: string | null;
    /** empty string = not yet picked */
    employeeId: string;
    /**
     * User-supplied allocated hours for this addition. null = "use the
     * computed default" (workable_hours × ghost_role.months). When the
     * user types into the Allocated (h) field, this captures the value
     * verbatim; clearing the field reverts to the default.
     */
    allocatedHours: number | null;
}

export function TeamPreviewDialog({ open, onClose, projectId, projectName, onConfirmed }: Props) {
    const t = useTranslations();
    const planPreview = usePlanTeamPreview(projectId ?? '');
    const confirmTeam = useConfirmTeamPlan(projectId ?? '');
    const availableQuery = useAvailableEmployees(projectId ?? '');
    const [preview, setPreview] = useState<TeamPlanPreview | null>(null);

    // Cumulative pool of employee IDs the AI has already proposed in this
    // preview session. Each Regenerate click sends this set to the backend so
    // the next AI call picks from a different (smaller) pool. Reset whenever
    // the dialog opens for a (possibly different) project. The `kept` team
    // members are NEVER added here — they're preserved regardless.
    const [excludedIds, setExcludedIds] = useState<string[]>([]);
    const [regenerateCount, setRegenerateCount] = useState(0);

    // Manual overrides for AI's proposed picks. Maps `proposed[i]` row-index
    // to the replacement employeeId from the idle pool. Sparse — only rows
    // the user explicitly changed get an entry. Cleared on dialog open and
    // when the user accepts a Regenerate (since the AI baseline is gone).
    const [overrides, setOverrides] = useState<Record<number, string>>({});

    // Net-new manual rows the user added beyond what AI proposed. Each row
    // carries an optional ghost_role_id so allocated_hours can be computed
    // from ghost_role.months × workable_hours server-side.
    const [additions, setAdditions] = useState<AdditionRow[]>([]);

    useEffect(() => {
        if (!open || !projectId) {
            setPreview(null);
            setExcludedIds([]);
            setRegenerateCount(0);
            setOverrides({});
            setAdditions([]);
            return;
        }
        setPreview(null);
        setExcludedIds([]);
        setRegenerateCount(0);
        setOverrides({});
        setAdditions([]);
        planPreview.mutate(undefined, {
            onSuccess: (p) => setPreview(p),
        });
        // We intentionally only re-run when the dialog opens for a project.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, projectId]);

    const availableEmployees = useMemo<AvailableEmployee[]>(
        () => availableQuery.data ?? [],
        [availableQuery.data],
    );
    const availableById = useMemo(() => {
        const m = new Map<string, AvailableEmployee>();
        for (const e of availableEmployees) m.set(e.employeeId, e);
        return m;
    }, [availableEmployees]);

    const proposed = useMemo(() => preview?.proposed ?? [], [preview?.proposed]);
    const kept = useMemo(() => preview?.kept ?? [], [preview?.kept]);
    const unfilled = useMemo(() => preview?.unfilled ?? [], [preview?.unfilled]);
    const rolesToFill = useMemo(() => preview?.rolesToFill ?? [], [preview?.rolesToFill]);
    const nothingToDo =
        preview && proposed.length === 0 && unfilled.length === 0 && additions.length === 0;

    // Employees that are already "spoken for" in this dialog session. Used to
    // filter the dropdown options so the user can't pick the same person in
    // two slots — the backend would reject duplicates anyway, this just
    // surfaces the rule before submit.
    const chosenIds = useMemo(() => {
        const set = new Set<string>();
        for (const k of kept) {
            if (k.employeeId) set.add(k.employeeId);
        }
        proposed.forEach((p, i) => {
            const eid = overrides[i] ?? p.employeeId;
            if (eid) set.add(eid);
        });
        for (const a of additions) {
            if (a.employeeId) set.add(a.employeeId);
        }
        return set;
    }, [kept, proposed, overrides, additions]);

    // Build the dropdown pool for a given row, EXCLUDING ids chosen elsewhere
    // but INCLUDING the row's own current pick (so the trigger still resolves
    // its label). Pass the row's current id via `keep`.
    const poolFor = (keep: string | undefined): AvailableEmployee[] => {
        return availableEmployees.filter(
            (e) => e.employeeId === keep || !chosenIds.has(e.employeeId),
        );
    };

    const hasManualEdits = Object.keys(overrides).length > 0 || additions.length > 0;

    const handleRegenerate = () => {
        if (!projectId || !preview) return;
        if (hasManualEdits) {
            const ok = window.confirm(t('manual_edits_will_be_lost'));
            if (!ok) return;
        }
        const newExclusions = Array.from(
            new Set([...excludedIds, ...preview.proposed.map((p) => p.employeeId)]),
        );
        setExcludedIds(newExclusions);
        setOverrides({});
        setAdditions([]);
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

    const handleConfirm = () => {
        if (!projectId || !preview) return;

        // ghostRoleId is REQUIRED downstream for the proposed rows — confirmTeamPlan
        // uses it to look up ghost_role.months and compute allocated_hours via
        // engagementAvailableHours(emp, project, months). Manual additions can
        // optionally omit it (sentinel "no role" → backend falls back to 1-month
        // workable_hours, which is fine for ad-hoc roster additions).
        const proposedPicks = proposed.map((p, i) => ({
            employeeId:  overrides[i] ?? p.employeeId,
            ghostRoleId: p.ghostRoleId,
        }));
        const additionPicks = additions
            .filter((a) => a.employeeId)
            .map((a) => {
                // If the user typed a value into the Allocated (h) input we
                // ship it verbatim; otherwise we omit allocated_hours so the
                // backend recomputes workable_hours × ghost_role.months.
                const emp = availableById.get(a.employeeId);
                const role = a.ghostRoleId
                    ? rolesToFill.find((r) => r.ghostRoleId === a.ghostRoleId)
                    : undefined;
                const computed = emp ? Math.round(emp.workableHours * (role?.months ?? 1)) : 0;
                const hours = a.allocatedHours ?? computed;
                return {
                    employeeId:  a.employeeId,
                    ghostRoleId: a.ghostRoleId ?? undefined,
                    allocatedHours: hours,
                };
            });
        const picks = [...proposedPicks, ...additionPicks];

        confirmTeam.mutate(picks, {
            onSuccess: (res) => {
                const manualCount =
                    Object.keys(overrides).length + additions.filter((a) => a.employeeId).length;
                const baseMsg = res.inserted > 0
                    ? t(res.inserted === 1 ? 'team_confirmed_singular' : 'team_confirmed_plural', { count: res.inserted })
                    : t('allocations_refreshed');
                toast.success(
                    manualCount > 0
                        ? `${baseMsg} (${t('manual_count_suffix', { count: manualCount })})`
                        : baseMsg,
                );
                onConfirmed();
                onClose();
            },
            onError: (err) => {
                // The race-guard 422 carries conflict names in the error body;
                // surface them in the toast so the user knows which row to fix.
                const resp = (err as { response?: { data?: { error?: string } } }).response;
                const msg = resp?.data?.error ?? normalizeError(err).message;
                toast.error(msg);
            },
        });
    };

    const addRow = () => {
        setAdditions((prev) => [...prev, { ghostRoleId: null, employeeId: '', allocatedHours: null }]);
    };

    const updateAddition = (idx: number, patch: Partial<AdditionRow>) => {
        setAdditions((prev) => prev.map((row, i) => (i === idx ? { ...row, ...patch } : row)));
    };

    const removeAddition = (idx: number) => {
        setAdditions((prev) => prev.filter((_, i) => i !== idx));
    };

    const loading = planPreview.isPending && !preview;
    const busy = planPreview.isPending || confirmTeam.isPending;
    const idlePoolReady = !availableQuery.isLoading;
    const canAddMore =
        idlePoolReady && availableEmployees.some((e) => !chosenIds.has(e.employeeId));

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

                        {(proposed.length > 0 || additions.length > 0) && (
                            <section>
                                <div className="mb-2 flex items-center justify-between">
                                    <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                                        {t('ai_proposed_additions')}
                                    </div>
                                    {availableQuery.isLoading && (
                                        <span className="text-[10px] text-slate-400">{t('loading_idle_pool')}</span>
                                    )}
                                </div>
                                <div className="rounded-md border border-slate-200">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>{t('role')}</TableHead>
                                                <TableHead>{t('employee')}</TableHead>
                                                <TableHead>{t('rank')}</TableHead>
                                                <TableHead className="text-right">{t('allocated_h')}</TableHead>
                                                <TableHead>{t('fit')}</TableHead>
                                                <TableHead className="w-[40px]"></TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {proposed.map((p, i) => {
                                                const overrideId = overrides[i];
                                                const isOverridden = overrideId !== undefined && overrideId !== p.employeeId;
                                                const overrideEmp = overrideId ? availableById.get(overrideId) : undefined;
                                                const displayEmpName = isOverridden
                                                    ? overrideEmp?.name ?? overrideId ?? p.employeeId
                                                    : p.employeeName ?? p.employeeId;
                                                const displayRank = isOverridden
                                                    ? overrideEmp?.rankCode ?? '—'
                                                    : p.employeeRank ?? '—';
                                                const displayHours = isOverridden && overrideEmp
                                                    ? Math.round(overrideEmp.workableHours * Math.max(1, p.months))
                                                    : p.allocatedHours;
                                                const currentValue = overrideId ?? p.employeeId;
                                                const pool = poolFor(currentValue);
                                                return (
                                                    <TableRow key={`${p.ghostRoleId}-${i}`}>
                                                        <TableCell className="whitespace-nowrap">
                                                            <div className="font-medium">{p.roleType}</div>
                                                            {p.neededRank && (
                                                                <div className="text-xs text-slate-500">{p.neededRank}</div>
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="whitespace-nowrap">
                                                            <Select
                                                                value={currentValue}
                                                                onValueChange={(v) => {
                                                                    setOverrides((prev) => {
                                                                        const next = { ...prev };
                                                                        if (v === p.employeeId) {
                                                                            delete next[i];
                                                                        } else {
                                                                            next[i] = v;
                                                                        }
                                                                        return next;
                                                                    });
                                                                }}
                                                                disabled={busy || !idlePoolReady}
                                                            >
                                                                <SelectTrigger className="h-8 min-w-[220px] text-xs">
                                                                    <SelectValue>
                                                                        <span className="flex items-center gap-1.5">
                                                                            {displayEmpName}
                                                                            {isOverridden && (
                                                                                <Badge variant="outline" className={`text-[9px] px-1 py-0 ${MANUAL_BADGE_CLASS}`}>
                                                                                    {t('manual_pick')}
                                                                                </Badge>
                                                                            )}
                                                                        </span>
                                                                    </SelectValue>
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    {/* AI's original suggestion stays at top, even if it's
                                                                        not in the current idle pool (it WAS idle at
                                                                        preview time — still a valid pick). */}
                                                                    <SelectItem value={p.employeeId}>
                                                                        <span className="flex items-center gap-1.5">
                                                                            {p.employeeName ?? p.employeeId}
                                                                            <span className="text-[10px] text-slate-400">— {t('ai_suggestion_label')}</span>
                                                                        </span>
                                                                    </SelectItem>
                                                                    {pool
                                                                        .filter((e) => e.employeeId !== p.employeeId)
                                                                        .map((e) => (
                                                                            <SelectItem key={e.employeeId} value={e.employeeId}>
                                                                                <span>
                                                                                    {e.name}
                                                                                    {e.rankCode && (
                                                                                        <span className="ml-1 text-[10px] text-slate-400">({e.rankCode})</span>
                                                                                    )}
                                                                                </span>
                                                                            </SelectItem>
                                                                        ))}
                                                                </SelectContent>
                                                            </Select>
                                                        </TableCell>
                                                        <TableCell className="whitespace-nowrap">{displayRank}</TableCell>
                                                        <TableCell className="text-right tabular-nums whitespace-nowrap">{displayHours}</TableCell>
                                                        <TableCell className="whitespace-nowrap">
                                                            {isOverridden ? (
                                                                <Badge variant="outline" className={`text-xs ${MANUAL_BADGE_CLASS}`}>
                                                                    {t('manual_pick')}
                                                                </Badge>
                                                            ) : (
                                                                <Badge variant="outline" className={`text-xs ${RANK_MATCH_VARIANTS[p.rankMatch]}`}>
                                                                    {p.rankMatch}
                                                                </Badge>
                                                            )}
                                                        </TableCell>
                                                        <TableCell />
                                                    </TableRow>
                                                );
                                            })}

                                            {additions.map((a, i) => {
                                                const emp = a.employeeId ? availableById.get(a.employeeId) : undefined;
                                                const role = a.ghostRoleId
                                                    ? rolesToFill.find((r: TeamPlanRoleToFill) => r.ghostRoleId === a.ghostRoleId)
                                                    : undefined;
                                                const months = role?.months ?? 1;
                                                const computedHours = emp ? Math.round(emp.workableHours * months) : 0;
                                                const pool = poolFor(a.employeeId || undefined);
                                                return (
                                                    <TableRow key={`addition-${i}`} className="bg-indigo-50/30">
                                                        <TableCell className="whitespace-nowrap">
                                                            <Select
                                                                value={a.ghostRoleId ?? NO_ROLE_VALUE}
                                                                onValueChange={(v) =>
                                                                    updateAddition(i, { ghostRoleId: v === NO_ROLE_VALUE ? null : v })
                                                                }
                                                                disabled={busy}
                                                            >
                                                                <SelectTrigger className="h-8 min-w-[160px] text-xs">
                                                                    <SelectValue placeholder={t('pick_ghost_role')} />
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    <SelectItem value={NO_ROLE_VALUE}>{t('pick_no_specific_role')}</SelectItem>
                                                                    {rolesToFill.map((r) => (
                                                                        <SelectItem key={r.ghostRoleId} value={r.ghostRoleId}>
                                                                            {r.roleType}
                                                                            {r.rankCode && (
                                                                                <span className="ml-1 text-[10px] text-slate-400">({r.rankCode})</span>
                                                                            )}
                                                                        </SelectItem>
                                                                    ))}
                                                                </SelectContent>
                                                            </Select>
                                                        </TableCell>
                                                        <TableCell className="whitespace-nowrap">
                                                            <Select
                                                                value={a.employeeId || ''}
                                                                onValueChange={(v) => updateAddition(i, { employeeId: v })}
                                                                disabled={busy || !idlePoolReady}
                                                            >
                                                                <SelectTrigger className="h-8 min-w-[220px] text-xs">
                                                                    <SelectValue placeholder={t('replace_with_idle_employee')} />
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    {pool.length === 0 ? (
                                                                        <div className="px-2 py-3 text-xs text-slate-400">
                                                                            {t('no_idle_employees')}
                                                                        </div>
                                                                    ) : (
                                                                        pool.map((e) => (
                                                                            <SelectItem key={e.employeeId} value={e.employeeId}>
                                                                                <span>
                                                                                    {e.name}
                                                                                    {e.rankCode && (
                                                                                        <span className="ml-1 text-[10px] text-slate-400">({e.rankCode})</span>
                                                                                    )}
                                                                                </span>
                                                                            </SelectItem>
                                                                        ))
                                                                    )}
                                                                </SelectContent>
                                                            </Select>
                                                        </TableCell>
                                                        <TableCell className="whitespace-nowrap">{emp?.rankCode ?? '—'}</TableCell>
                                                        <TableCell className="text-right tabular-nums whitespace-nowrap">
                                                            <Input
                                                                type="number"
                                                                min={0}
                                                                step={1}
                                                                value={a.allocatedHours ?? (computedHours || '')}
                                                                placeholder={computedHours ? String(computedHours) : '—'}
                                                                disabled={busy || !a.employeeId}
                                                                onChange={(e) => {
                                                                    const raw = e.target.value;
                                                                    updateAddition(i, {
                                                                        allocatedHours: raw === '' ? null : Math.max(0, Number(raw)),
                                                                    });
                                                                }}
                                                                className="h-8 w-24 text-right text-xs tabular-nums"
                                                            />
                                                        </TableCell>
                                                        <TableCell className="whitespace-nowrap">
                                                            <Badge variant="outline" className={`text-xs ${MANUAL_BADGE_CLASS}`}>
                                                                {t('manual_pick')}
                                                            </Badge>
                                                        </TableCell>
                                                        <TableCell>
                                                            <Button
                                                                size="sm"
                                                                variant="ghost"
                                                                className="h-7 w-7 p-0 text-rose-600"
                                                                onClick={() => removeAddition(i)}
                                                                disabled={busy}
                                                                title={t('remove')}
                                                            >
                                                                <Trash2 className="h-3.5 w-3.5" />
                                                            </Button>
                                                        </TableCell>
                                                    </TableRow>
                                                );
                                            })}
                                        </TableBody>
                                    </Table>
                                </div>
                                <div className="mt-2">
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={addRow}
                                        disabled={busy || !canAddMore}
                                        className="gap-1.5"
                                        title={canAddMore ? undefined : t('no_idle_employees')}
                                    >
                                        <Plus className="h-3.5 w-3.5" />
                                        {t('add_employee')}
                                    </Button>
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
