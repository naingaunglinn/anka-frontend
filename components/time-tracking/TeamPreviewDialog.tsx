'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertTriangle, Sparkles, Users } from 'lucide-react';
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

    useEffect(() => {
        if (!open || !projectId) {
            setPreview(null);
            return;
        }
        setPreview(null);
        planPreview.mutate(undefined, {
            onSuccess: (p) => setPreview(p),
        });
        // We intentionally only re-run when the dialog opens for a project.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, projectId]);

    const loading = planPreview.isPending && !preview;
    const proposed = preview?.proposed ?? [];
    const kept = preview?.kept ?? [];
    const unfilled = preview?.unfilled ?? [];
    const nothingToDo = preview && proposed.length === 0 && unfilled.length === 0;

    const handleConfirm = () => {
        if (!projectId || !preview) return;

        const picks = proposed.map((p) => ({
            employeeId:     p.employeeId,
            allocatedHours: p.allocatedHours,
        }));

        if (picks.length === 0) {
            toast.success('Team already fully staffed.');
            onConfirmed();
            onClose();
            return;
        }

        confirmTeam.mutate(picks, {
            onSuccess: (res) => {
                toast.success(`Team confirmed — ${res.inserted} ${res.inserted === 1 ? 'member' : 'members'} added.`);
                onConfirmed();
                onClose();
            },
        });
    };

    const busy = planPreview.isPending || confirmTeam.isPending;

    return (
        <Dialog open={open} onOpenChange={(v) => !v && !busy && onClose()}>
            <DialogContent className="max-w-3xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-indigo-500" />
                        AI Team Preview
                        {projectName && <span className="text-sm font-normal text-slate-500">— {projectName}</span>}
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
                                                <TableHead>Employee</TableHead>
                                                <TableHead>Rank</TableHead>
                                                <TableHead>Capacity role</TableHead>
                                                <TableHead className="text-right">Allocated (h)</TableHead>
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
                                    AI-proposed additions
                                </div>
                                <div className="rounded-md border border-slate-200">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Role / needed rank</TableHead>
                                                <TableHead>Employee</TableHead>
                                                <TableHead>Rank</TableHead>
                                                <TableHead className="text-right">Allocated (h)</TableHead>
                                                <TableHead>Fit</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {proposed.map((p, i) => (
                                                <TableRow key={`${p.ghostRoleId}-${p.employeeId}-${i}`}>
                                                    <TableCell>
                                                        <div className="font-medium">{p.roleType}</div>
                                                        <div className="text-xs text-slate-500">{p.neededRank ?? 'unspecified rank'}</div>
                                                    </TableCell>
                                                    <TableCell>{p.employeeName ?? p.employeeId}</TableCell>
                                                    <TableCell>{p.employeeRank ?? '—'}</TableCell>
                                                    <TableCell className="text-right">{p.allocatedHours}</TableCell>
                                                    <TableCell>
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

                <DialogFooter>
                    <Button variant="ghost" onClick={onClose} disabled={busy}>
                        Cancel
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
