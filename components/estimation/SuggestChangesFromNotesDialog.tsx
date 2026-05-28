'use client';

import { useEffect, useMemo, useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Sparkles, Plus, Minus, Pencil, Loader2 } from 'lucide-react';
import { useBusinessStore } from '@/store/businessStore';
import {
    useGenerateAIEstimationDelta,
    type AIEstimationDelta,
} from '@/lib/queries/estimationVersions';
import type { EstimationResource, ProjectOverhead, GhostRole } from '@/types/business';
import type { Currency } from '@/lib/currencyConfig';
import { formatMoney } from '@/lib/currency';
import toast from 'react-hot-toast';

interface SelectionState {
    resourceAdds: boolean[];
    resourceRemoves: boolean[];
    resourceModifies: boolean[];
    overheadAdds: boolean[];
    overheadRemoves: boolean[];
    overheadModifies: boolean[];
    roleAdds: boolean[];
    roleRemoves: boolean[];
    roleModifies: boolean[];
}

interface SuggestChangesFromNotesDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    dealId: string;
    currentResources: EstimationResource[];
    currentOverheads: ProjectOverhead[];
    currentRoles: GhostRole[];
    currency: Currency;
    /**
     * Called once the user accepts a subset of the AI delta. Receives the
     * applied resources/overheads/roles (already merged) plus the verbatim
     * notes that produced them — caller saves them as the next version.
     */
    onApply: (params: {
        resources: EstimationResource[];
        overheads: ProjectOverhead[];
        roles: GhostRole[];
        contextNotes: string;
    }) => Promise<void> | void;
}

// Human-friendly label for a capacity-role code. Falls back to the raw code
// for tenant-custom roles that aren't in the standard set.
function roleLabel(code: string): string {
    const known: Record<string, string> = {
        frontend: 'Frontend',
        backend: 'Backend',
        pm: 'PM',
        qa: 'QA',
        design: 'Design',
    };
    return known[code.toLowerCase().trim()] ?? code;
}

function buildDefaultSelection(delta: AIEstimationDelta | null): SelectionState {
    if (!delta) {
        return {
            resourceAdds: [], resourceRemoves: [], resourceModifies: [],
            overheadAdds: [], overheadRemoves: [], overheadModifies: [],
            roleAdds: [], roleRemoves: [], roleModifies: [],
        };
    }
    return {
        resourceAdds: delta.resources.add.map(() => true),
        resourceRemoves: delta.resources.remove.map(() => true),
        resourceModifies: delta.resources.modify.map(() => true),
        overheadAdds: delta.overheads.add.map(() => true),
        overheadRemoves: delta.overheads.remove.map(() => true),
        overheadModifies: delta.overheads.modify.map(() => true),
        roleAdds: delta.roles.add.map(() => true),
        roleRemoves: delta.roles.remove.map(() => true),
        roleModifies: delta.roles.modify.map(() => true),
    };
}

function applyDelta(
    delta: AIEstimationDelta,
    selection: SelectionState,
    baseResources: EstimationResource[],
    baseOverheads: ProjectOverhead[],
    baseRoles: GhostRole[],
    rolesByTitle: Map<string, string>,
    fallbackRoleId: string,
    roleIdToCapCode: Map<string, string>,
): { resources: EstimationResource[]; overheads: ProjectOverhead[]; roles: GhostRole[] } {
    // Start by removing the accepted "remove" items (matched by feature_name).
    const removedFeatureNames = new Set(
        delta.resources.remove
            .filter((_, i) => selection.resourceRemoves[i])
            .map(r => r.featureName.toLowerCase().trim()),
    );
    const removedOverheadNames = new Set(
        delta.overheads.remove
            .filter((_, i) => selection.overheadRemoves[i])
            .map(r => r.name.toLowerCase().trim()),
    );

    let resources = baseResources
        .filter(r => !removedFeatureNames.has(r.featureName.toLowerCase().trim()));
    let overheads = baseOverheads
        .filter(o => !removedOverheadNames.has(o.name.toLowerCase().trim()));

    // Apply accepted modifies — match by feature_name / overhead name.
    const resourceModifies = new Map(
        delta.resources.modify
            .filter((_, i) => selection.resourceModifies[i])
            .map(m => [m.featureName.toLowerCase().trim(), m.newHours]),
    );
    const overheadModifies = new Map(
        delta.overheads.modify
            .filter((_, i) => selection.overheadModifies[i])
            .map(m => [m.name.toLowerCase().trim(), m.newCost]),
    );
    resources = resources.map(r => {
        const m = resourceModifies.get(r.featureName.toLowerCase().trim());
        return m !== undefined ? { ...r, hours: m } : r;
    });
    overheads = overheads.map(o => {
        const m = overheadModifies.get(o.name.toLowerCase().trim());
        return m !== undefined ? { ...o, cost: m } : o;
    });

    // Append accepted adds.
    const newResources: EstimationResource[] = delta.resources.add
        .filter((_, i) => selection.resourceAdds[i])
        .map(a => ({
            id: `ai-delta-${crypto.randomUUID()}`,
            featureName: a.featureName,
            roleId: rolesByTitle.get(a.role.toLowerCase().trim()) ?? fallbackRoleId,
            hours: a.hours,
            employeeId: null,
        }));
    const newOverheads: ProjectOverhead[] = delta.overheads.add
        .filter((_, i) => selection.overheadAdds[i])
        .map(a => ({
            id: `ai-delta-ovh-${crypto.randomUUID()}`,
            name: a.name,
            cost: a.cost,
            months: 1,
        }));

    // ── Roles (ghost roles) — matched by role_type ──────────────────────────
    // Ghost roles on the deal may store a UUID as roleType (mapped by the AI
    // Team Builder). The AI delta returns capacity codes ("backend", "pm", …).
    // Normalise to capacity code before comparing so matches succeed.
    const normalizeRoleType = (rt: string) =>
        (roleIdToCapCode.get(rt) ?? rt).toLowerCase().trim();

    const removedRoleTypes = new Set(
        delta.roles.remove
            .filter((_, i) => selection.roleRemoves[i])
            .map(r => r.roleType.toLowerCase().trim()),
    );
    let roles = baseRoles.filter(r => !removedRoleTypes.has(normalizeRoleType(r.roleType)));

    const roleModifies = new Map(
        delta.roles.modify
            .filter((_, i) => selection.roleModifies[i])
            .map(m => [m.roleType.toLowerCase().trim(), m]),
    );
    roles = roles.map(r => {
        const m = roleModifies.get(normalizeRoleType(r.roleType));
        return m
            ? {
                ...r,
                quantity: m.newQuantity,
                months: m.newMonths,
                minMonthlySalary: m.newMinMonthlySalary,
                maxMonthlySalary: m.newMaxMonthlySalary,
            }
            : r;
    });

    const newRoles: GhostRole[] = delta.roles.add
        .filter((_, i) => selection.roleAdds[i])
        .map(a => ({
            id: '',
            roleType: a.roleType as GhostRole['roleType'],
            quantity: a.quantity,
            months: a.months,
            minMonthlySalary: a.minMonthlySalary,
            maxMonthlySalary: a.maxMonthlySalary,
        }));

    return {
        resources: [...resources, ...newResources],
        overheads: [...overheads, ...newOverheads],
        roles: [...roles, ...newRoles],
    };
}

export function SuggestChangesFromNotesDialog({
    open,
    onOpenChange,
    dealId,
    currentResources,
    currentOverheads,
    currentRoles,
    currency,
    onApply,
}: SuggestChangesFromNotesDialogProps) {
    const roles = useBusinessStore(s => s.roles);
    const employees = useBusinessStore(s => s.employees);
    const rolesByTitle = useMemo(
        () => new Map(roles.map(r => [r.title.toLowerCase().trim(), r.id])),
        [roles],
    );
    const rolesById = useMemo(
        () => new Map(roles.map(r => [r.id, r.title])),
        [roles],
    );
    const fallbackRoleId = roles[0]?.id ?? '';
    // Reverse map: role UUID → capacity code. The AI Team Builder saves ghost
    // roles with UUID roleTypes; the AI delta returns capacity codes. This map
    // lets applyDelta normalise UUIDs back to capacity codes for matching.
    const roleIdToCapCode = useMemo(() => {
        const m = new Map<string, string>();
        for (const r of roles) {
            const emps = employees.filter(e => e.jobRoleId === r.id && e.capacityRole);
            for (const e of emps) {
                if (e.capacityRole && !m.has(r.id)) {
                    m.set(r.id, e.capacityRole);
                }
            }
        }
        return m;
    }, [roles, employees]);

    const { suggest, isSuggesting, lastDelta, reset } = useGenerateAIEstimationDelta();
    const [notes, setNotes] = useState('');
    const [delta, setDelta] = useState<AIEstimationDelta | null>(null);
    const [selection, setSelection] = useState<SelectionState>(buildDefaultSelection(null));
    const [applying, setApplying] = useState(false);

    // Reset local state when the dialog closes. `reset` is a fresh arrow
    // function on every render of the parent hook, so including it in deps
    // here triggers an infinite update loop (setSelection always builds a new
    // object reference). The effect's only logical trigger is `open` — React
    // state setters are stable and don't need to be listed.
    useEffect(() => {
        if (open) return;
        setNotes('');
        setDelta(null);
        setSelection(buildDefaultSelection(null));
        reset();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const totalChanges = delta
        ? delta.resources.add.length + delta.resources.remove.length + delta.resources.modify.length
            + delta.overheads.add.length + delta.overheads.remove.length + delta.overheads.modify.length
            + delta.roles.add.length + delta.roles.remove.length + delta.roles.modify.length
        : 0;
    const acceptedCount = delta
        ? selection.resourceAdds.filter(Boolean).length
            + selection.resourceRemoves.filter(Boolean).length
            + selection.resourceModifies.filter(Boolean).length
            + selection.overheadAdds.filter(Boolean).length
            + selection.overheadRemoves.filter(Boolean).length
            + selection.overheadModifies.filter(Boolean).length
            + selection.roleAdds.filter(Boolean).length
            + selection.roleRemoves.filter(Boolean).length
            + selection.roleModifies.filter(Boolean).length
        : 0;

    const handleSuggest = async () => {
        if (notes.trim().length < 5) {
            toast.error('Paste at least a few sentences of meeting notes.');
            return;
        }
        try {
            const result = await suggest(
                dealId,
                notes.trim(),
                currentResources.map(r => ({
                    featureName: r.featureName,
                    role: rolesById.get(r.roleId),
                    hours: r.hours,
                })),
                currentOverheads.map(o => ({ name: o.name, cost: o.cost })),
                currentRoles.map(r => ({
                    roleType: roleIdToCapCode.get(r.roleType) ?? r.roleType,
                    quantity: r.quantity,
                    months: r.months,
                    minMonthlySalary: r.minMonthlySalary,
                    maxMonthlySalary: r.maxMonthlySalary,
                })),
            );
            setDelta(result);
            setSelection(buildDefaultSelection(result));
        } catch {
            // Hook already toasted via onError.
        }
    };

    const handleApply = async () => {
        if (!delta) return;
        if (acceptedCount === 0) {
            toast.error('Select at least one suggested change to apply.');
            return;
        }
        setApplying(true);
        try {
            const merged = applyDelta(
                delta,
                selection,
                currentResources,
                currentOverheads,
                currentRoles,
                rolesByTitle,
                fallbackRoleId,
                roleIdToCapCode,
            );
            await onApply({ ...merged, contextNotes: notes.trim() });
            onOpenChange(false);
        } catch (err) {
            console.error('Failed to apply delta:', err);
            toast.error('Could not apply the changes — please try again.');
        } finally {
            setApplying(false);
        }
    };

    const toggle = (
        section: keyof SelectionState,
        index: number,
    ) => {
        setSelection(s => ({
            ...s,
            [section]: s[section].map((v, i) => (i === index ? !v : v)),
        }));
    };

    const confidenceBadge = delta && (
        <span
            className={
                'px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider '
                + (delta.confidence === 'high'
                    ? 'bg-emerald-100 text-emerald-700'
                    : delta.confidence === 'low'
                        ? 'bg-rose-100 text-rose-700'
                        : 'bg-amber-100 text-amber-700')
            }
        >
            {delta.confidence} confidence
        </span>
    );

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[720px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-violet-600" />
                        Suggest changes from notes
                    </DialogTitle>
                    <DialogDescription>
                        Paste the meeting minutes or chat history below. AI will compare it to the current
                        estimation and propose a structured diff across scope, roles, and overhead
                        (add / remove / modify) for you to review.
                    </DialogDescription>
                </DialogHeader>

                {!delta && (
                    <div className="space-y-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="ctx-notes" className="text-xs">
                                Customer meeting notes <span className="text-rose-500">*</span>
                            </Label>
                            <Textarea
                                id="ctx-notes"
                                value={notes}
                                onChange={e => setNotes(e.target.value)}
                                rows={10}
                                placeholder={
                                    'Example:\n' +
                                    '— Customer wants to add SSO support (Google + Okta).\n' +
                                    '— Drop the analytics dashboard for now, will revisit in v2.\n' +
                                    '— Compliance audit required, budget for HIPAA review.\n' +
                                    '— Wants the integration phase shortened to 3 weeks.'
                                }
                            />
                            <p className="text-[11px] text-slate-400">
                                Required, minimum 5 characters. Will be saved alongside the next version.
                            </p>
                        </div>
                    </div>
                )}

                {delta && (
                    <div className="space-y-4">
                        <div className="rounded-md border border-slate-200 bg-slate-50 p-3 space-y-2">
                            <div className="flex items-center gap-2 text-xs">
                                <span className="font-semibold text-slate-700">Summary</span>
                                {confidenceBadge}
                            </div>
                            <p className="text-xs text-slate-600 leading-relaxed">{delta.summary}</p>
                        </div>

                        {totalChanges === 0 && (
                            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                                AI didn&rsquo;t find any specific changes in your notes. Try adding more detail
                                about what the customer wants different.
                            </div>
                        )}

                        {/* Scope changes */}
                        {(delta.resources.add.length + delta.resources.remove.length + delta.resources.modify.length) > 0 && (
                            <div className="space-y-2">
                                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Scope changes</p>
                                {delta.resources.add.map((r, i) => (
                                    <DiffRow
                                        key={`r-add-${i}`}
                                        kind="add"
                                        title={`${r.featureName} — ${r.role}`}
                                        meta={`${r.hours}h`}
                                        reason={r.reason}
                                        checked={selection.resourceAdds[i]}
                                        onToggle={() => toggle('resourceAdds', i)}
                                    />
                                ))}
                                {delta.resources.modify.map((r, i) => {
                                    const old = currentResources.find(x => x.featureName.toLowerCase().trim() === r.featureName.toLowerCase().trim());
                                    return (
                                        <DiffRow
                                            key={`r-mod-${i}`}
                                            kind="modify"
                                            title={r.featureName}
                                            meta={old ? `${old.hours}h → ${r.newHours}h` : `→ ${r.newHours}h`}
                                            reason={r.reason}
                                            checked={selection.resourceModifies[i]}
                                            onToggle={() => toggle('resourceModifies', i)}
                                            warning={!old ? 'No matching feature in current scope — change will be skipped.' : undefined}
                                        />
                                    );
                                })}
                                {delta.resources.remove.map((r, i) => {
                                    const exists = currentResources.some(x => x.featureName.toLowerCase().trim() === r.featureName.toLowerCase().trim());
                                    return (
                                        <DiffRow
                                            key={`r-rem-${i}`}
                                            kind="remove"
                                            title={r.featureName}
                                            meta="drop"
                                            reason={r.reason}
                                            checked={selection.resourceRemoves[i]}
                                            onToggle={() => toggle('resourceRemoves', i)}
                                            warning={!exists ? 'No matching feature in current scope — nothing to remove.' : undefined}
                                        />
                                    );
                                })}
                            </div>
                        )}

                        {/* Overhead changes */}
                        {(delta.overheads.add.length + delta.overheads.remove.length + delta.overheads.modify.length) > 0 && (
                            <div className="space-y-2">
                                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Overhead changes</p>
                                {delta.overheads.add.map((o, i) => (
                                    <DiffRow
                                        key={`o-add-${i}`}
                                        kind="add"
                                        title={o.name}
                                        meta={formatMoney(o.cost, currency)}
                                        reason={o.reason}
                                        checked={selection.overheadAdds[i]}
                                        onToggle={() => toggle('overheadAdds', i)}
                                    />
                                ))}
                                {delta.overheads.modify.map((o, i) => {
                                    const old = currentOverheads.find(x => x.name.toLowerCase().trim() === o.name.toLowerCase().trim());
                                    return (
                                        <DiffRow
                                            key={`o-mod-${i}`}
                                            kind="modify"
                                            title={o.name}
                                            meta={old ? `${formatMoney(old.cost, currency)} → ${formatMoney(o.newCost, currency)}` : `→ ${formatMoney(o.newCost, currency)}`}
                                            reason={o.reason}
                                            checked={selection.overheadModifies[i]}
                                            onToggle={() => toggle('overheadModifies', i)}
                                            warning={!old ? 'No matching overhead in current list — change will be skipped.' : undefined}
                                        />
                                    );
                                })}
                                {delta.overheads.remove.map((o, i) => {
                                    const exists = currentOverheads.some(x => x.name.toLowerCase().trim() === o.name.toLowerCase().trim());
                                    return (
                                        <DiffRow
                                            key={`o-rem-${i}`}
                                            kind="remove"
                                            title={o.name}
                                            meta="drop"
                                            reason={o.reason}
                                            checked={selection.overheadRemoves[i]}
                                            onToggle={() => toggle('overheadRemoves', i)}
                                            warning={!exists ? 'No matching overhead in current list — nothing to remove.' : undefined}
                                        />
                                    );
                                })}
                            </div>
                        )}

                        {/* Role changes (project staffing mix) */}
                        {(delta.roles.add.length + delta.roles.remove.length + delta.roles.modify.length) > 0 && (
                            <div className="space-y-2">
                                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Role changes</p>
                                {delta.roles.add.map((r, i) => (
                                    <DiffRow
                                        key={`role-add-${i}`}
                                        kind="add"
                                        title={roleLabel(r.roleType)}
                                        meta={`${r.quantity}× · ${r.months}mo · ${formatMoney(r.minMonthlySalary, currency)}–${formatMoney(r.maxMonthlySalary, currency)}/mo`}
                                        reason={r.reason}
                                        checked={selection.roleAdds[i]}
                                        onToggle={() => toggle('roleAdds', i)}
                                    />
                                ))}
                                {delta.roles.modify.map((r, i) => {
                                    const target = r.roleType.toLowerCase().trim();
                                    const old = currentRoles.find(x => (roleIdToCapCode.get(x.roleType) ?? x.roleType).toLowerCase().trim() === target);
                                    const newMeta = `${r.newQuantity}× · ${r.newMonths}mo · ${formatMoney(r.newMinMonthlySalary, currency)}–${formatMoney(r.newMaxMonthlySalary, currency)}/mo`;
                                    return (
                                        <DiffRow
                                            key={`role-mod-${i}`}
                                            kind="modify"
                                            title={roleLabel(r.roleType)}
                                            meta={old ? `${old.quantity}× · ${old.months}mo → ${newMeta}` : `→ ${newMeta}`}
                                            reason={r.reason}
                                            checked={selection.roleModifies[i]}
                                            onToggle={() => toggle('roleModifies', i)}
                                            warning={!old ? 'No matching role in the current mix — change will be skipped.' : undefined}
                                        />
                                    );
                                })}
                                {delta.roles.remove.map((r, i) => {
                                    const target = r.roleType.toLowerCase().trim();
                                    const exists = currentRoles.some(x => (roleIdToCapCode.get(x.roleType) ?? x.roleType).toLowerCase().trim() === target);
                                    return (
                                        <DiffRow
                                            key={`role-rem-${i}`}
                                            kind="remove"
                                            title={roleLabel(r.roleType)}
                                            meta="drop"
                                            reason={r.reason}
                                            checked={selection.roleRemoves[i]}
                                            onToggle={() => toggle('roleRemoves', i)}
                                            warning={!exists ? 'No matching role in the current mix — nothing to remove.' : undefined}
                                        />
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                <DialogFooter className="gap-2">
                    {!delta && (
                        <>
                            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSuggesting}>
                                Cancel
                            </Button>
                            <Button
                                onClick={handleSuggest}
                                disabled={isSuggesting || notes.trim().length < 5}
                                className="bg-violet-600 hover:bg-violet-700 text-white gap-2"
                            >
                                {isSuggesting ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Analyzing notes...
                                    </>
                                ) : (
                                    <>
                                        <Sparkles className="h-4 w-4" />
                                        Suggest changes
                                    </>
                                )}
                            </Button>
                        </>
                    )}
                    {delta && (
                        <>
                            <Button variant="ghost" onClick={() => { setDelta(null); reset(); }} disabled={applying}>
                                ← Edit notes
                            </Button>
                            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={applying}>
                                Cancel
                            </Button>
                            <Button
                                onClick={handleApply}
                                disabled={applying || acceptedCount === 0}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
                            >
                                {applying
                                    ? 'Applying...'
                                    : `Apply ${acceptedCount} change${acceptedCount === 1 ? '' : 's'} & save version`}
                            </Button>
                        </>
                    )}
                </DialogFooter>

                {lastDelta === null && isSuggesting && (
                    <p className="text-[11px] text-slate-400 text-center -mt-2">
                        This usually takes 30–60 seconds.
                    </p>
                )}
            </DialogContent>
        </Dialog>
    );
}

interface DiffRowProps {
    kind: 'add' | 'remove' | 'modify';
    title: string;
    meta: string;
    reason: string;
    checked: boolean;
    onToggle: () => void;
    warning?: string;
}

function DiffRow({ kind, title, meta, reason, checked, onToggle, warning }: DiffRowProps) {
    const palette = kind === 'add'
        ? { bg: 'bg-emerald-50', border: 'border-emerald-200', icon: <Plus className="h-3.5 w-3.5 text-emerald-700" />, label: 'Add', labelBg: 'bg-emerald-100 text-emerald-800' }
        : kind === 'remove'
            ? { bg: 'bg-rose-50', border: 'border-rose-200', icon: <Minus className="h-3.5 w-3.5 text-rose-700" />, label: 'Remove', labelBg: 'bg-rose-100 text-rose-800' }
            : { bg: 'bg-amber-50', border: 'border-amber-200', icon: <Pencil className="h-3.5 w-3.5 text-amber-700" />, label: 'Modify', labelBg: 'bg-amber-100 text-amber-800' };

    return (
        <label
            className={`flex items-start gap-3 rounded-md border p-3 cursor-pointer ${palette.bg} ${palette.border} ${!checked ? 'opacity-60' : ''}`}
        >
            <input
                type="checkbox"
                checked={checked}
                onChange={onToggle}
                className="mt-1 shrink-0"
            />
            <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                    {palette.icon}
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${palette.labelBg}`}>{palette.label}</span>
                    <span className="text-sm font-medium text-slate-800 truncate">{title}</span>
                    <span className="text-xs text-slate-500 ml-auto shrink-0 font-mono">{meta}</span>
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed">{reason}</p>
                {warning && (
                    <p className="text-[11px] text-rose-700 font-medium">⚠ {warning}</p>
                )}
            </div>
        </label>
    );
}
