'use client';

import { useEffect, useState } from 'react';
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
    const capacityCheck = preview?.capacityCheck ?? [];
    const nothingToDo = preview && proposed.length === 0 && unfilled.length === 0;

    const formatMoney = (n: number) =>
        n >= 1_000_000
            ? `${(n / 1_000_000).toFixed(2)}M`
            : n >= 1_000
                ? `${(n / 1_000).toFixed(0)}K`
                : `${Math.round(n)}`;

    const handleConfirm = () => {
        if (!projectId || !preview) return;

        // ghostRoleId is sent so the backend can store
        // allocated_hours = workable_hours × ghost_role.months for each pick
        // (engagement-window capacity). Empty picks are valid: they trigger
        // a refresh-only flow that re-runs the allocator against the latest
        // xlsx (e.g. after a v2 estimation upload).
        const picks = proposed.map((p) => ({
            employeeId:  p.employeeId,
            ghostRoleId: p.ghostRoleId,
        }));

        confirmTeam.mutate(picks, {
            onSuccess: (res) => {
                const msg = res.inserted > 0
                    ? `Team confirmed — ${res.inserted} ${res.inserted === 1 ? 'member' : 'members'} added.`
                    : 'Allocations refreshed from the latest xlsx.';
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
                    <DialogTitle className="flex items-center gap-2 pr-8">
                        <Sparkles className="h-4 w-4 text-indigo-500 shrink-0" />
                        <span>AI Team Preview</span>
                        {projectName && <span className="text-sm font-normal text-slate-500 truncate">— {projectName}</span>}
                    </DialogTitle>
                </DialogHeader>

                {loading && (
                    <div className="py-8 text-center text-sm text-slate-500">
                        <div className="inline-flex h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-500 mb-3" />
                        <div>Asking the AI to fit the team…</div>
                    </div>
                )}

                {!loading && preview && (
                    <div className="space-y-5">
                        {preview.allocation && (
                            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                                    <span>
                                        <span className="text-slate-500">Project work (xlsx):</span>{' '}
                                        <span className="font-semibold tabular-nums">{preview.allocation.grandTotal}h</span>
                                    </span>
                                    <span>
                                        <span className="text-slate-500">Sum of allocations:</span>{' '}
                                        <span className="font-semibold tabular-nums">{preview.allocation.sumOfAllocations}h</span>
                                    </span>
                                    {preview.allocation.xlsxPath && (
                                        <span className="text-slate-400">— from {preview.allocation.xlsxPath}</span>
                                    )}
                                </div>
                                <div className="mt-1 text-[11px] text-slate-500">
                                    Allocated hours per member are distributed from the xlsx grand total, weighted by rank (Lead {'>'} Senior {'>'} Mid {'>'} Junior). Sum should match the project total ±rounding.
                                </div>
                            </div>
                        )}

                        {nothingToDo && (
                            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                                {preview.message ?? 'Planned team structure is already fully staffed.'}
                            </div>
                        )}

                        {kept.length > 0 && (
                            <section>
                                <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                                    <Users className="h-3.5 w-3.5" /> Already on the team
                                </div>
                                <div className="rounded-md border border-slate-200">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead className="whitespace-nowrap">Employee</TableHead>
                                                <TableHead className="whitespace-nowrap">Rank</TableHead>
                                                <TableHead className="whitespace-nowrap">Capacity role</TableHead>
                                                <TableHead className="text-right whitespace-nowrap">Months</TableHead>
                                                <TableHead className="text-right whitespace-nowrap">Allocated (h)</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {kept.map((k) => (
                                                <TableRow key={k.employeeId}>
                                                    <TableCell>
                                                        {k.name ?? k.employeeId}
                                                        {k.unmatched && (
                                                            <Badge variant="outline" className="ml-2 bg-amber-50 text-amber-700 border-amber-200 text-[10px]">
                                                                no matching role
                                                            </Badge>
                                                        )}
                                                    </TableCell>
                                                    <TableCell>{k.rankCode ?? '—'}</TableCell>
                                                    <TableCell>{k.capacityRole ?? '—'}</TableCell>
                                                    <TableCell className="text-right tabular-nums">{k.months || '—'}</TableCell>
                                                    <TableCell className="text-right tabular-nums">{Math.round(k.allocatedHours)}</TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                                <div className="mt-1 text-[11px] text-slate-500">
                                    Hours = workable_hours × engagement months from the matched ghost role. A member marked &quot;no matching role&quot; stays on the team but the planned structure has no slot for their capacity_role on this project.
                                </div>
                            </section>
                        )}

                        {capacityCheck.length > 0 && (
                            <section>
                                <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                                    Capacity check (per planned role)
                                </div>
                                <div className="rounded-md border border-slate-200">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead className="whitespace-nowrap">Role</TableHead>
                                                <TableHead className="text-right whitespace-nowrap">Hours budget</TableHead>
                                                <TableHead className="text-right whitespace-nowrap">Hours supply</TableHead>
                                                <TableHead className="text-right whitespace-nowrap">Cost budget</TableHead>
                                                <TableHead className="text-right whitespace-nowrap">Cost used</TableHead>
                                                <TableHead className="whitespace-nowrap">Status</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {capacityCheck.map((c) => {
                                                const shortHours = c.hoursShortfall > 0;
                                                const overCost   = c.costOverrun > 0;
                                                const ok         = !shortHours && !overCost;
                                                return (
                                                    <TableRow key={c.roleType}>
                                                        <TableCell className="whitespace-nowrap">
                                                            <div className="font-medium">{c.roleType}</div>
                                                            <div className="text-xs text-slate-500">
                                                                {c.quantity}× / up to {c.monthsMax} mo
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="text-right tabular-nums whitespace-nowrap">{Math.round(c.hoursBudget)}h</TableCell>
                                                        <TableCell className={`text-right tabular-nums whitespace-nowrap ${shortHours ? 'text-amber-700 font-semibold' : ''}`}>
                                                            {Math.round(c.hoursSupply)}h
                                                            {shortHours && <span className="ml-1 text-xs">(−{Math.round(c.hoursShortfall)})</span>}
                                                        </TableCell>
                                                        <TableCell className="text-right tabular-nums whitespace-nowrap">Ks{formatMoney(c.costBudget)}</TableCell>
                                                        <TableCell className={`text-right tabular-nums whitespace-nowrap ${overCost ? 'text-rose-700 font-semibold' : ''}`}>
                                                            Ks{formatMoney(c.costUsed)}
                                                            {overCost && <span className="ml-1 text-xs">(+{formatMoney(c.costOverrun)})</span>}
                                                        </TableCell>
                                                        <TableCell className="whitespace-nowrap">
                                                            {ok && <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs">ok</Badge>}
                                                            {shortHours && <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-xs">short</Badge>}
                                                            {overCost && <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200 text-xs ml-1">over budget</Badge>}
                                                        </TableCell>
                                                    </TableRow>
                                                );
                                            })}
                                        </TableBody>
                                    </Table>
                                </div>
                                <div className="mt-1 text-[11px] text-slate-500">
                                    Hours supply = Σ(workable_hours × engagement months) across kept + proposed. Cost used counts proposed picks only (kept members keep their original allocation).
                                </div>
                            </section>
                        )}

                        {proposed.length > 0 && (
                            <section>
                                <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                                    AI-proposed additions
                                </div>
                                <div className="rounded-md border border-slate-200">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead className="whitespace-nowrap">Role / needed rank</TableHead>
                                                <TableHead className="whitespace-nowrap">Employee</TableHead>
                                                <TableHead className="whitespace-nowrap">Rank</TableHead>
                                                <TableHead className="text-right whitespace-nowrap">Allocated (h)</TableHead>
                                                <TableHead className="whitespace-nowrap">Fit</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {proposed.map((p, i) => (
                                                <TableRow key={`${p.ghostRoleId}-${p.employeeId}-${i}`}>
                                                    <TableCell className="whitespace-nowrap">
                                                        <div className="font-medium">{p.roleType}</div>
                                                        <div className="text-xs text-slate-500">{p.neededRank ?? 'unspecified rank'}</div>
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
                                        <AlertTriangle className="h-3.5 w-3.5" /> Unfilled roles
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
                        Cancel
                    </Button>
                    <Button
                        variant="outline"
                        onClick={handleRegenerate}
                        disabled={busy || !preview}
                        className="gap-1.5"
                        title="Ask the AI for a different team — kept members stay."
                    >
                        <RefreshCw className={`h-3.5 w-3.5 ${planPreview.isPending && regenerateCount > 0 ? 'animate-spin' : ''}`} />
                        {planPreview.isPending && regenerateCount > 0 ? 'Regenerating…' : 'Regenerate'}
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
                        {confirmTeam.isPending ? 'Confirming…' : 'OK — confirm & assign tasks'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
