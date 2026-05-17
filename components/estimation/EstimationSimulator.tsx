'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Trash2, Calculator, Save, ExternalLink, Clock, History, GitCompare, RotateCcw, Download, Sparkles, FileCheck2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useBusinessStore } from '@/store/businessStore';
import { Deal, EstimationResource, ProjectOverhead } from '@/types/business';
import type { Currency } from '@/lib/currencyConfig';
import {
    useEstimationVersions,
    useEstimationVersionDetail,
    useEstimationVersionMutations,
    useDownloadEstimationXlsx,
    useGenerateAIEstimationDraft,
    type AIEstimationDraft,
} from '@/lib/queries/estimationVersions';
import { AIDraftReviewPanel } from '@/components/estimation/AIDraftReviewPanel';
import { EstimationRoleBuilder } from '@/components/estimation/EstimationRoleBuilder';
import { ContractReadyDialog } from '@/components/estimation/ContractReadyDialog';
import { SuggestChangesFromNotesDialog } from '@/components/estimation/SuggestChangesFromNotesDialog';
import { MessageSquareText } from 'lucide-react';
import { useDealList, useDealMutations } from '@/lib/queries/deals';
import type { AISuggestedRole } from '@/types/aiTeamBuilder';
import type { GhostRole } from '@/types/business';
import { applySellMarkup, LABOR_OVERHEAD_PERCENTAGE } from '@/lib/calculations';
import toast from 'react-hot-toast';
import { formatMoney } from '@/lib/currency';
import { useTenantCurrency, useCurrencySymbol } from '@/hooks/useTenantCurrency';

/**
 * Median of a numeric array. Returns NaN for an empty input — callers
 * should check before using the result.
 */
function median(values: number[]): number {
    if (values.length === 0) return NaN;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
        ? (sorted[mid - 1] + sorted[mid]) / 2
        : sorted[mid];
}

function CompareBanner({
    versionId,
    currentResources,
    currentOverheads,
    currentMargin,
    currency,
    onClose,
}: {
    versionId: string
    currentResources: EstimationResource[]
    currentOverheads: ProjectOverhead[]
    currentMargin: number
    currency: Currency
    onClose: () => void
}) {
    // The version-list endpoint returns counts only — not the actual resources
    // array. Fetch the full version detail here so the diff table reflects
    // real saved values, not always-empty placeholders.
    const detailQuery = useEstimationVersionDetail(versionId)
    const detail = detailQuery.data
    const store = useBusinessStore()

    const headerLabel = detail
        ? `Comparing with v${detail.versionNumber}${detail.notes ? ` · ${detail.notes}` : ''}`
        : 'Loading comparison...'

    // Resources from the API may carry either snake_case or camelCase keys
    // depending on which mapper produced them; normalize before indexing.
    const saved = (detail?.resources ?? []).map(r => ({
        roleId: r.roleId ?? r.role_id ?? '',
        hours:  Number(r.hours ?? 0),
    }))
    const savedMap   = new Map(saved.map(r => [r.roleId, r.hours]))
    const currentMap = new Map(currentResources.map(r => [r.roleId, r.hours]))
    const allRoleIds = [...new Set([...savedMap.keys(), ...currentMap.keys()])]

    const savedOverheads = (detail?.overheads ?? []).map(o => ({
        name: o.name ?? '',
        cost: Number(o.cost ?? 0),
    }))
    const savedOverheadMap   = new Map(savedOverheads.map(o => [o.name, o.cost]))
    const currentOverheadMap = new Map(currentOverheads.map(o => [o.name, o.cost]))
    const allOverheadNames = [...new Set([...savedOverheadMap.keys(), ...currentOverheadMap.keys()])]

    const savedMargin  = detail?.targetMargin ?? 0
    const marginDiff   = currentMargin - savedMargin

    function diffClass(d: number) {
        if (d > 0) return 'text-rose-600'
        if (d < 0) return 'text-emerald-600'
        return 'text-slate-700'
    }

    return (
        <div className="border-t bg-blue-50 p-4 space-y-2">
            <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-blue-700 uppercase tracking-wider">
                    {headerLabel}
                </p>
                <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={onClose}>Close</Button>
            </div>

            {detailQuery.isLoading && (
                <p className="text-xs text-slate-500 italic">Loading saved version data...</p>
            )}

            {detailQuery.isError && (
                <p className="text-xs text-rose-600">
                    Could not load that version&apos;s details.
                    <Button variant="link" size="sm" className="h-auto px-1 text-xs text-rose-600" onClick={() => detailQuery.refetch()}>Retry</Button>
                </p>
            )}

            {detail && (
                <div className="space-y-3">
                    <div className="grid grid-cols-3 gap-4 text-xs">
                        <div className="font-medium text-slate-500">Role</div>
                        <div className="font-medium text-slate-500 text-right">Saved (v{detail.versionNumber})</div>
                        <div className="font-medium text-slate-500 text-right">Current</div>
                        {allRoleIds.length === 0 ? (
                            <div className="col-span-3 text-slate-500 italic">No resources in either version.</div>
                        ) : allRoleIds.map(roleId => {
                            const role = store.roles.find(r => r.id === roleId)
                            const savedH = savedMap.get(roleId) ?? 0
                            const currH  = currentMap.get(roleId) ?? 0
                            const diff   = currH - savedH
                            return (
                                <div key={roleId} className="contents">
                                    <div className="text-slate-700">{role?.title ?? roleId}</div>
                                    <div className="text-right text-slate-500">{savedH}h</div>
                                    <div className={`text-right font-medium ${diffClass(diff)}`}>
                                        {currH}h {diff !== 0 ? `(${diff > 0 ? '+' : ''}${diff})` : ''}
                                    </div>
                                </div>
                            )
                        })}
                    </div>

                    {allOverheadNames.length > 0 && (
                        <div className="grid grid-cols-3 gap-4 text-xs pt-2 border-t border-blue-100">
                            <div className="font-medium text-slate-500">Overhead</div>
                            <div className="font-medium text-slate-500 text-right">Saved</div>
                            <div className="font-medium text-slate-500 text-right">Current</div>
                            {allOverheadNames.map(name => {
                                const savedC = savedOverheadMap.get(name) ?? 0
                                const currC  = currentOverheadMap.get(name) ?? 0
                                const diff   = currC - savedC
                                return (
                                    <div key={name} className="contents">
                                        <div className="text-slate-700">{name}</div>
                                        <div className="text-right text-slate-500">{formatMoney(savedC, currency)}</div>
                                        <div className={`text-right font-medium ${diffClass(diff)}`}>
                                            {formatMoney(currC, currency)} {diff !== 0 ? `(${diff > 0 ? '+' : ''}${formatMoney(diff, currency)})` : ''}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}

                    <div className="grid grid-cols-3 gap-4 text-xs pt-2 border-t border-blue-100">
                        <div className="text-slate-700">Target Margin</div>
                        <div className="text-right text-slate-500">{savedMargin}%</div>
                        <div className={`text-right font-medium ${diffClass(marginDiff)}`}>
                            {currentMargin}% {marginDiff !== 0 ? `(${marginDiff > 0 ? '+' : ''}${marginDiff})` : ''}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

interface EstimationSimulatorProps {
    initialDealId?: string;
}

export function EstimationSimulator({ initialDealId = '' }: EstimationSimulatorProps) {
    const router = useRouter();
    const store = useBusinessStore();
    const qc = useQueryClient();
    const currency = useTenantCurrency();
    const symbol = useCurrencySymbol();
    const { updateDeal } = useDealMutations();

    // Self-fetch the deal list so the Target Deal picker is populated even
    // when the user lands on /estimation directly. The hook syncs results
    // into the Zustand store as a side-effect, so store.deals (read below)
    // ends up populated either way.
    useDealList();

    // UI selections
    const [selectedDealId, setSelectedDealId] = useState<string>(initialDealId);
    const [dirty, setDirty] = useState(false);
    const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
    const [compareWithId, setCompareWithId] = useState<string | null>(null);
    const [versionNotes, setVersionNotes] = useState('');
    const [showHistory, setShowHistory] = useState(false);
    const [contractReadyOpen, setContractReadyOpen] = useState(false);
    const [regenerateConfirmOpen, setRegenerateConfirmOpen] = useState(false);
    const [suggestFromNotesOpen, setSuggestFromNotesOpen] = useState(false);

    // Version queries
    const versionsQuery = useEstimationVersions(selectedDealId || null);
    const { saveVersion, restoreVersion } = useEstimationVersionMutations();
    const { downloadVersion, isDownloading } = useDownloadEstimationXlsx();
    const { generate: generateAi, isGenerating: isGeneratingAi, reset: resetAi } = useGenerateAIEstimationDraft();
    const [aiDraft, setAiDraft] = useState<AIEstimationDraft | null>(null);
    const versions = versionsQuery.data ?? [];
    const currentVersion = versions[0]; // latest (sorted desc)
    const totalVersions = versions.length;
    const nextVersion = (currentVersion?.versionNumber ?? 0) + 1;

    // Pre-fetch the latest saved version's full payload so we can detect
    // no-op saves locally without an extra round-trip on click. The hook
    // is no-op when currentVersion is missing (first save on a deal).
    const latestVersionDetailQuery = useEstimationVersionDetail(currentVersion?.id ?? null);
    const latestVersionDetail = latestVersionDetailQuery.data;

    // Local estimation state before saving
    const [resources, setResources] = useState<EstimationResource[]>([]);
    const [overheads, setOverheads] = useState<ProjectOverhead[]>([]);
    const [margin, setMargin] = useState([30]);

    // Form inputs
    const [newFeature, setNewFeature] = useState('');
    const [newRoleId, setNewRoleId] = useState('');
    const [newHours, setNewHours] = useState('');
    const [newOverheadName, setNewOverheadName] = useState('');
    const [newOverheadCost, setNewOverheadCost] = useState('');

    // Tracks which deal we've populated local state from so the load-effect
    // doesn't clobber in-progress edits when store.deals updates in place
    // (e.g. background refetches from useDealList). loadFromDeal is called
    // again explicitly after a Restore to refresh the form.
    const loadedDealIdRef = useRef<string | null>(null);

    const loadFromDeal = (deal: Deal) => {
        // Only load real saved scope rows — never auto-seed from ghostRoles.
        // Ghost roles are displayed in their own "Project Roles" table above,
        // and the scope table should stay empty until the user runs Generate
        // with AI or adds rows manually. Previously this seeded synthetic
        // "Backend Team / Frontend Team" rows that the user couldn't tell
        // apart from real scope.
        setResources(deal.estimationResources ?? []);
        setOverheads(deal.projectOverheads || []);
        setMargin([deal.targetMargin || 30]);
        setDirty(false);
        setLastSavedAt(null);
    };

    useEffect(() => {
        // Clear state when no deal is selected.
        if (!selectedDealId) {
            setResources([]);
            setOverheads([]);
            setMargin([30]);
            setDirty(false);
            setLastSavedAt(null);
            loadedDealIdRef.current = null;
            return;
        }
        // Skip if this deal's state is already loaded — prevents background
        // store.deals refetches from clobbering unsaved local edits.
        if (loadedDealIdRef.current === selectedDealId) return;
        const deal = store.deals.find(d => d.id === selectedDealId);
        if (!deal) return; // wait for store to populate
        loadedDealIdRef.current = selectedDealId;
        loadFromDeal(deal);
        // loadFromDeal is intentionally referenced via closure; including it
        // in deps would defeat the once-per-deal guard above.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedDealId, store.deals, store.roles]);

    // Debounced auto-save on edits. When the user mutates resources / overheads
    // / margin and `dirty` flips true, schedule a PATCH to deal.estimation_resources
    // + deal.deal_overheads after 800ms of inactivity. AI generation persists
    // synchronously inside handleGenerateAi, so it sets dirty=false explicitly
    // — this effect only handles row/overhead edits the user makes afterward.
    const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => {
        if (!selectedDealId) return;
        if (!dirty) return;
        // Cancel any previously-scheduled save — the user is still typing.
        if (autoSaveTimerRef.current) {
            clearTimeout(autoSaveTimerRef.current);
        }
        autoSaveTimerRef.current = setTimeout(async () => {
            try {
                await updateDeal.mutateAsync({
                    id: selectedDealId,
                    updates: {
                        estimationResources: resources,
                        projectOverheads: overheads,
                        targetMargin: margin[0],
                    },
                });
                setDirty(false);
            } catch (err) {
                // Keep dirty=true so the next edit re-triggers; toast once so
                // the user knows the row they just changed didn't make it.
                console.error('Auto-save failed:', err);
                toast.error('Could not save changes — your edits are still in the UI but not on the deal.');
            }
        }, 800);
        return () => {
            if (autoSaveTimerRef.current) {
                clearTimeout(autoSaveTimerRef.current);
                autoSaveTimerRef.current = null;
            }
        };
        // updateDeal is a stable mutation ref from useDealMutations; including
        // it would re-trigger the timer on every render.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dirty, resources, overheads, margin, selectedDealId]);

    const handleAdd = () => {
        if (!newFeature || !newHours || !newRoleId) return;
        setResources([...resources, {
            id: crypto.randomUUID(),
            featureName: newFeature,
            roleId: newRoleId,
            hours: Number(newHours),
        }]);
        setNewFeature('');
        setNewHours('');
        setDirty(true);
    };

    const handleRemove = (id: string) => {
        setResources(resources.filter(r => r.id !== id));
        setDirty(true);
    };

    const handleAddOverhead = () => {
        if (!newOverheadName || !newOverheadCost) return;
        setOverheads([...overheads, {
            id: crypto.randomUUID(),
            name: newOverheadName,
            cost: Number(newOverheadCost)
        }]);
        setNewOverheadName('');
        setNewOverheadCost('');
        setDirty(true);
    };

    const handleRemoveOverhead = (id: string) => {
        setOverheads(overheads.filter(o => o.id !== id));
        setDirty(true);
    };

    const handleGenerateAi = async () => {
        if (!selectedDealId) return;
        // Regenerate guard: if there's already scope/overhead data on the deal,
        // open the confirm modal instead of clobbering it. AI generation persists
        // straight to the DB, so a second click would overwrite whatever the user
        // had. The modal's confirm handler calls runAiGeneration() directly.
        const hasExistingData = resources.length > 0 || overheads.length > 0;
        if (hasExistingData) {
            setRegenerateConfirmOpen(true);
            return;
        }
        await runAiGeneration();
    };

    const runAiGeneration = async () => {
        if (!selectedDealId) return;

        // Snapshot pre-AI state in case the persist step fails — we restore
        // these so the user doesn't end up with AI output in the UI that
        // didn't actually save.
        const prevResources = resources;
        const prevOverheads = overheads;

        try {
            const draft = await generateAi(selectedDealId);

            // Join AI sheet2 features with sheet3 dev_hours by function_id.
            // Each manhour row carries a `role` (verbatim org role title picked
            // by Claude per-feature). Resolve to roleId via store.roles; fall
            // back to store.roles[0] when no match (rare; toasted).
            const fallbackRoleId = store.roles[0]?.id;
            if (!fallbackRoleId) {
                toast.error('No roles defined for your tenant — add at least one role before generating an AI draft.');
                return;
            }
            const titleToRoleId = new Map(
                store.roles.map(r => [r.title.toLowerCase().trim(), r.id]),
            );
            const manhourByFunctionId = new Map(
                draft.sheet3Manhours.map(m => [m.functionId, m]),
            );

            let unmatched = 0;
            const aiResources: EstimationResource[] = draft.sheet2Features.map((f) => {
                const mh = manhourByFunctionId.get(f.functionId);
                const titleKey = (mh?.role ?? '').toLowerCase().trim();
                const resolvedRoleId = titleKey ? titleToRoleId.get(titleKey) : undefined;
                if (mh?.role && !resolvedRoleId) unmatched++;
                return {
                    id: `ai-${f.functionId}`,
                    featureName: f.name,
                    roleId: resolvedRoleId ?? fallbackRoleId,
                    employeeId: mh?.suggestedEmployeeId ?? null,
                    hours: Math.round(mh?.devHours ?? 0),
                };
            });
            if (unmatched > 0) {
                toast(`${unmatched} feature${unmatched === 1 ? '' : 's'} fell back to the default role — AI returned a role name not in your organization.`);
            }

            // Regenerate REPLACES, doesn't append. The confirmation above
            // makes this an explicit choice — the user opted to overwrite.
            const aiOverheads: ProjectOverhead[] = (draft.projectOverheads ?? []).map((o, i) => ({
                id: `ai-ovh-${Date.now()}-${i}`,
                name: o.name,
                cost: Math.round(o.cost),
            }));

            // Persist immediately to the deal columns. On success we'll mirror
            // into local state; on failure we keep the previous state visible
            // so the user doesn't see "AI output" that isn't saved.
            try {
                await updateDeal.mutateAsync({
                    id: selectedDealId,
                    updates: {
                        estimationResources: aiResources,
                        projectOverheads: aiOverheads,
                    },
                });
            } catch (saveErr) {
                console.error('Failed to persist AI draft to deal:', saveErr);
                toast.error('AI ran but could not save to the deal — try again.');
                // Restore pre-AI state — refetch will repopulate from server too,
                // but setting here avoids a flash of stale data.
                setResources(prevResources);
                setOverheads(prevOverheads);
                return;
            }

            setResources(aiResources);
            setOverheads(aiOverheads);
            setAiDraft(draft);
            setDirty(false); // already saved
            const ovhSuffix = aiOverheads.length > 0
                ? ` and ${aiOverheads.length} predicted overhead${aiOverheads.length === 1 ? '' : 's'}`
                : '';
            toast.success(`AI generated ${aiResources.length} features${ovhSuffix} — saved to deal.`);
        } catch {
            // Hook already toasted via normalizeError; nothing to add here.
        }
    };

    const handleDiscardAiDraft = () => {
        // Reset local state to whatever was loaded from the deal originally.
        // Doesn't preserve any manual edits the user made between Generate
        // and Discard — documented in chg-010 risk.
        resetAi();
        setAiDraft(null);
        const deal = store.deals.find(d => d.id === selectedDealId);
        if (deal) {
            loadFromDeal(deal);
        }
    };

    const handleSave = async () => {
        if (!selectedDealId) return;

        // Belt-and-suspenders for the disabled-button guard below: don't
        // create a byte-identical version row if something slipped through
        // (e.g. the button was enabled while the detail query was in flight).
        if (isUnchangedFromSaved) {
            toast('No changes to save — current state matches the latest saved version.');
            return;
        }

        const nextVer = (currentVersion?.versionNumber ?? 0) + 1;
        // When the version came from an AI draft, ride the per-sheet
        // metadata along as sentinel rows in the resources JSONB. The
        // XLSX writer reads these on export to populate Sheet 1 summary
        // numbers and Sheet 5 monthly allocations. Sentinels are skipped
        // by the controller when syncing the estimation_resources table.
        const aiSentinels: Record<string, unknown>[] = [];
        if (aiDraft) {
            aiSentinels.push({
                _sheet1_summary: {
                    rough_estimate_hours: aiDraft.sheet1Summary.roughEstimateHours,
                    requirement_study_hours: aiDraft.sheet1Summary.requirementStudyHours,
                    web_development_hours: aiDraft.sheet1Summary.webDevelopmentHours,
                    environment_setup_hours: aiDraft.sheet1Summary.environmentSetupHours,
                    total_hours_per_person: aiDraft.sheet1Summary.totalHoursPerPerson,
                    total_days_per_person: aiDraft.sheet1Summary.totalDaysPerPerson,
                    total_months_per_person: aiDraft.sheet1Summary.totalMonthsPerPerson,
                },
            });
            aiSentinels.push({
                _sheet5_team_stack: aiDraft.sheet5TeamStack.map(t => ({
                    role: t.role,
                    count: t.count,
                    monthly_allocation: t.monthlyAllocation,
                })),
            });
        }
        try {
            await saveVersion.mutateAsync({
                dealId: selectedDealId,
                resources: [
                    ...aiSentinels,
                    ...resources.map(r => ({
                        roleId: r.roleId,
                        employeeId: r.employeeId ?? null,
                        featureName: r.featureName,
                        hours: r.hours,
                    })),
                ],
                overheads,
                targetMargin: margin[0],
                notes: versionNotes || undefined,
            });
            setDirty(false);
            setLastSavedAt(new Date().toLocaleString());
            setVersionNotes('');
            toast.success(`Estimation v${nextVer} saved!`);
        } catch {
            toast.error('Failed to save estimation version');
        }
    };

    const handleRestore = async (versionId: string, versionNumber: number) => {
        if (!window.confirm(`Restore v${versionNumber}? Current changes will be overwritten.`)) return;
        setShowHistory(false);
        try {
            await restoreVersion.mutateAsync(versionId);
            // The mutation onSuccess invalidates ['deals'] and the versions
            // list, but invalidation alone doesn't wait for the refetch — we
            // need fresh deal data in the store before reading it. Force the
            // refetch (and the versions list too, in case the backend created
            // an audit row).
            await qc.refetchQueries({ queryKey: ['deals'] });
            await qc.refetchQueries({ queryKey: ['estimation-versions'] });
            // Use the latest store snapshot AFTER the refetch resolves.
            const deal = useBusinessStore.getState().deals.find(d => d.id === selectedDealId);
            if (deal) {
                // Bypass the once-per-deal guard since the deal data itself changed.
                loadedDealIdRef.current = selectedDealId;
                loadFromDeal(deal);
            }
            toast.success(`Restored to v${versionNumber}`);
        } catch {
            toast.error('Failed to restore version');
        }
    };

    // Cost-rate strategy returns the agency's per-hour COST (what the employee
    // costs us). The estimator sells time at `cost × SELL_PRICE_MULTIPLIER`
    // (cost + 15% absorbed overhead) — see `sellRateForResource` below.
    //   1. Active employees with this jobRoleId → median(costPerHour).
    //   2. No matching employees but role exists with a positive rate →
    //      role.rate × costToBillRatio (default 0.40).
    //   3. Nothing → fallbackHourlyCost (default 50 in tenant currency).
    // Both fallbacks are tenant-tunable via /organization → Salary Structure.
    const costRateForRole = (roleId: string): number => {
        const rates = store.employees
            .filter(e => e.jobRoleId === roleId && e.status === 'Active')
            .map(e => e.costPerHour)
            .filter((r): r is number => typeof r === 'number' && Number.isFinite(r) && r > 0);
        if (rates.length > 0) return median(rates);

        const role = store.roles.find(r => r.id === roleId);
        if (role && role.rate > 0) return role.rate * store.companySettings.costToBillRatio;

        return store.companySettings.fallbackHourlyCost;
    };

    const costRateForResource = (res: EstimationResource): number => {
        if (res.employeeId) {
            const emp = store.employees.find(e => e.id === res.employeeId);
            if (emp && typeof emp.costPerHour === 'number' && Number.isFinite(emp.costPerHour) && emp.costPerHour > 0) {
                return emp.costPerHour;
            }
        }
        return costRateForRole(res.roleId);
    };

    // Sell rate is what the estimation displays + uses for the labor total.
    // Cost rate + 15% absorbed overhead. Same multiplier surfaces as the
    // "Sell / Hr" column on /organization → Employees.
    const sellRateForResource = (res: EstimationResource): number => applySellMarkup(costRateForResource(res));

    // Labor line uses the SELL rate so the per-hour markup is already baked
    // in. The old "Overhead & Buffer (15%)" display line is gone — it's now
    // priced into the rate itself.
    const laborCost = resources.reduce(
        (sum, res) => sum + res.hours * sellRateForResource(res),
        0,
    );

    const projectOverheadTotal = overheads.reduce((sum, o) => sum + o.cost, 0);
    const totalCost = laborCost + projectOverheadTotal;

    // Slider is capped at 80% so margin/100 stays well below 1, but clamp
    // explicitly here so a future cap change can't silently produce price=0.
    const clampedMarginPct = Math.min(95, Math.max(0, margin[0]));
    const targetMarginDecimal = clampedMarginPct / 100;
    const suggestedPrice = totalCost / (1 - targetMarginDecimal);
    const expectedProfit = suggestedPrice - totalCost;

    // Stable signature of the local edit state for "is this identical to
    // what's already saved?" checks. Resources and overheads are sorted
    // before serialising so reordering rows isn't treated as a change.
    const localSignature = (() => {
        const r = resources
            .map(x => `${x.roleId}|${x.featureName}|${x.hours}`)
            .sort().join(',');
        const o = overheads
            .map(x => `${x.name}|${x.cost}`)
            .sort().join(',');
        return `${margin[0]}::${r}::${o}`;
    })();

    const savedSignature = (() => {
        if (!latestVersionDetail) return null;
        const r = (latestVersionDetail.resources ?? [])
            .map(x => `${x.roleId ?? x.role_id ?? ''}|${x.featureName ?? x.feature_name ?? ''}|${x.hours ?? 0}`)
            .sort().join(',');
        const o = (latestVersionDetail.overheads ?? [])
            .map(x => `${x.name ?? ''}|${x.cost ?? 0}`)
            .sort().join(',');
        return `${latestVersionDetail.targetMargin}::${r}::${o}`;
    })();

    // True only when there's a saved version AND the local state matches it
    // exactly. With no saved version (first save on a deal) we always allow
    // saving so the user can capture v1.
    const isUnchangedFromSaved = savedSignature !== null && localSignature === savedSignature;

    // The `dirty` flag flips on any user edit but doesn't reset when the user
    // reverts back to saved state. Combine with the signature check so the
    // Draft/Saved indicator and the Save button reflect actual diff, not
    // just "user touched something".
    const hasUnsavedChanges = dirty && !isUnchangedFromSaved;

    // Switching deals replaces all local state via the useEffect at the top
    // of the component — silently dumping any unsaved edits. Intercept the
    // Select's change handler and confirm before discarding work. Native
    // confirm matches the existing pattern (handleRestore uses the same).
    const handleDealChange = (newDealId: string) => {
        if (newDealId === selectedDealId) return;
        if (hasUnsavedChanges) {
            const ok = window.confirm(
                'You have unsaved changes on this estimation. Switch deals and discard them?',
            );
            if (!ok) return;
        }
        // Reset comparison / history panels — they're tied to the previous
        // deal's versions and would otherwise display stale data after the
        // switch.
        setCompareWithId(null);
        setShowHistory(false);
        setSelectedDealId(newDealId);
    };

    // Reality-check the simulator output against what the client said they'd
    // spend. A 5% tolerance forgives small price/budget gaps that are
    // typical negotiation room. Anything beyond that is flagged inline so
    // the salesperson sees the problem next to the price they're about to
    // quote, instead of discovering it later when the client pushes back.
    const selectedDeal = store.deals.find(d => d.id === selectedDealId);
    const clientBudget = selectedDeal?.clientBudget ?? 0;
    const BUDGET_TOLERANCE = 1.05;
    const exceedsBudget = clientBudget > 0 && suggestedPrice > clientBudget * BUDGET_TOLERANCE;
    const budgetOverage = exceedsBudget ? suggestedPrice - clientBudget : 0;
    const budgetOveragePercent = exceedsBudget && clientBudget > 0
        ? (budgetOverage / clientBudget) * 100
        : 0;

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">

                <Card className="shadow-sm border-slate-100 bg-slate-50">
                    <CardHeader className="pb-4">
                        <CardTitle className="text-sm uppercase tracking-wider text-slate-500">Target Deal</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center gap-3">
                            <Select value={selectedDealId} onValueChange={handleDealChange}>
                                <SelectTrigger className="w-full bg-white">
                                    <SelectValue placeholder="Select a deal from CRM to estimate..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {store.deals.map(deal => (
                                        <SelectItem key={deal.id} value={deal.id}>
                                            {deal.name} ({deal.client || 'No client'})
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {selectedDealId && (
                                <Button variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={() => router.push(`/crm/${selectedDealId}`)}>
                                    <ExternalLink className="h-3.5 w-3.5" /> View Deal
                                </Button>
                            )}
                        </div>
                    </CardContent>
                </Card>

                {selectedDealId && (
                    <Card className="shadow-sm border-slate-100">
                        <CardHeader className="pb-3 border-b">
                            <div className="flex justify-between items-center flex-wrap gap-3">
                                <div>
                                    <CardTitle className="text-base">Estimate Versions</CardTitle>
                                    <CardDescription className="text-xs">Track saved estimates, compare versions, and export to XLSX.</CardDescription>
                                </div>
                                <div className="flex items-center gap-3 flex-wrap">
                                    <div className="flex items-center gap-2 text-xs text-slate-500">
                                        <Clock className="h-3.5 w-3.5" />
                                        <span className="font-medium text-slate-700">
                                            v{currentVersion?.versionNumber ?? 0}{hasUnsavedChanges ? '+' : ''}
                                        </span>
                                        <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium"
                                            style={{
                                                background: hasUnsavedChanges ? '#fef3c7' : '#d1fae5',
                                                color: hasUnsavedChanges ? '#92400e' : '#065f46',
                                            }}
                                        >
                                            {hasUnsavedChanges ? 'Draft' : 'Saved'}
                                        </span>
                                        {lastSavedAt && (
                                            <span className="text-slate-400">· {lastSavedAt}</span>
                                        )}
                                    </div>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-7 gap-1 text-xs"
                                        onClick={() => setShowHistory(!showHistory)}
                                    >
                                        <History className="h-3 w-3" />
                                        {totalVersions} versions
                                    </Button>
                                    {/* Pick any saved version to compare the live draft against,
                                        not just v[N-1]. The "__none__" sentinel is the explicit
                                        Stop-Comparing affordance — used because Radix Select rejects
                                        SelectItems with empty-string values. */}
                                    <Select
                                        value={compareWithId ?? '__placeholder__'}
                                        onValueChange={(val) => setCompareWithId(val === '__none__' ? null : val)}
                                        disabled={versions.length === 0}
                                    >
                                        <SelectTrigger className="h-7 px-2 gap-1 text-xs w-auto min-w-[110px]">
                                            <GitCompare className="h-3 w-3" />
                                            <SelectValue placeholder="Compare to..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {compareWithId && (
                                                <SelectItem value="__none__">— Stop comparing</SelectItem>
                                            )}
                                            {versions.map((v) => (
                                                <SelectItem key={v.id} value={v.id}>
                                                    v{v.versionNumber}{v.notes ? ` · ${v.notes}` : ''}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        </CardHeader>
                        {showHistory && versions.length > 0 && (
                            <div className="border-t bg-slate-50 p-4 space-y-2">
                                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3">Version History</p>
                                {versions.map((v, idx) => (
                                    <div key={v.id} className="flex items-center justify-between p-3 bg-white rounded-lg border border-slate-100">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-semibold text-slate-800">v{v.versionNumber}</span>
                                                <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-100 text-slate-500 font-medium">
                                                    {v.resourceCount} resources · {v.overheadCount} overheads
                                                </span>
                                                {idx === 0 && (
                                                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-100 text-emerald-700 font-medium">Latest</span>
                                                )}
                                                {v.hasContextNotes && (
                                                    <span
                                                        className="px-1.5 py-0.5 rounded text-[10px] bg-amber-100 text-amber-800 font-medium inline-flex items-center gap-1"
                                                        title={v.contextNotes ?? 'Has meeting notes attached'}
                                                    >
                                                        <MessageSquareText className="h-3 w-3" />
                                                        notes
                                                    </span>
                                                )}
                                            </div>
                                            {v.notes && (
                                                <p className="text-xs text-slate-500 mt-1">{v.notes}</p>
                                            )}
                                            <p className="text-xs text-slate-400 mt-0.5">{v.createdAt ? new Date(v.createdAt).toLocaleString() : ''}</p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Button
                                                variant={compareWithId === v.id ? 'default' : 'outline'}
                                                size="sm"
                                                className="h-7 gap-1 text-xs"
                                                onClick={() => setCompareWithId(compareWithId === v.id ? null : v.id)}
                                            >
                                                <GitCompare className="h-3 w-3" />
                                                {compareWithId === v.id ? 'Comparing' : 'Compare'}
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="h-7 gap-1 text-xs"
                                                disabled={!!isDownloading[v.id]}
                                                onClick={() => {
                                                    const dealName = store.deals.find(d => d.id === selectedDealId)?.name?.replace(/\s+/g, '_') || 'estimation';
                                                    downloadVersion(v.id, `${dealName}_v${v.versionNumber}.xlsx`);
                                                }}
                                            >
                                                <Download className="h-3 w-3" />
                                                {isDownloading[v.id] ? 'Exporting…' : 'Export XLSX'}
                                            </Button>
                                            {idx > 0 && (
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="h-7 gap-1 text-xs"
                                                    onClick={() => handleRestore(v.id, v.versionNumber)}
                                                >
                                                    <RotateCcw className="h-3 w-3" /> Restore
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                        {compareWithId && (
                            <CompareBanner
                                versionId={compareWithId}
                                currentResources={resources}
                                currentOverheads={overheads}
                                currentMargin={margin[0]}
                                currency={currency}
                                onClose={() => setCompareWithId(null)}
                            />
                        )}
                    </Card>
                )}

                {selectedDeal && (
                    <Card className="shadow-sm border-slate-100">
                        <CardHeader className="pb-4 border-b">
                            <CardTitle className="text-lg flex items-center gap-2">
                                <Sparkles className="h-4 w-4 text-indigo-600" />
                                AI Project Planner
                            </CardTitle>
                            <CardDescription>
                                Build the role mix and generate the project scope from the deal context. <span className="font-medium text-[#171717]">Build AI Team</span> suggests roles + cost; <span className="font-medium text-[#171717]">Generate with AI</span> turns the deal into scope rows and predicted overheads.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <EstimationRoleBuilder
                                dealId={selectedDeal.id}
                                dealName={selectedDeal.name}
                                dealClient={selectedDeal.client}
                                clientBudget={selectedDeal.clientBudget ?? 0}
                                timelineMonths={selectedDeal.timelineMonths ?? 0}
                                workloadHours={selectedDeal.workloadHours ?? 0}
                                workloadDescription={selectedDeal.workloadDescription ?? ''}
                                onAccept={async (roles: AISuggestedRole[]) => {
                                    // Map AI's role suggestions onto the deal's ghost-role shape.
                                    // The ghost-role IDs are server-assigned on persist, so we
                                    // intentionally omit `id` here — the mapper drops empty ids.
                                    const ghostRoles: GhostRole[] = roles.map(r => ({
                                        id: '',
                                        roleType: r.roleType,
                                        quantity: r.quantity,
                                        months: r.months,
                                        minMonthlySalary: r.minMonthlySalary,
                                        maxMonthlySalary: r.maxMonthlySalary,
                                    }));
                                    try {
                                        await updateDeal.mutateAsync({
                                            id: selectedDeal.id,
                                            updates: { ghostRoles },
                                        });
                                        toast.success('Roles saved to deal');
                                    } catch (err) {
                                        console.error('Failed to save AI roles to deal:', err);
                                        toast.error('Could not save the roles — please try again.');
                                    }
                                }}
                                extraAction={
                                    <div className="flex flex-col gap-2 h-full">
                                        <Button
                                            onClick={handleGenerateAi}
                                            disabled={!selectedDealId || isGeneratingAi}
                                            className="w-full bg-violet-600 hover:bg-violet-700 text-white gap-2 disabled:opacity-60"
                                            size="lg"
                                            title="Generate scope rows and predicted overheads from the deal context using Claude"
                                        >
                                            <Sparkles className="h-4 w-4" />
                                            {isGeneratingAi ? 'Generating with AI...' : 'Generate with AI'}
                                        </Button>
                                        <Button
                                            onClick={() => setSuggestFromNotesOpen(true)}
                                            disabled={!selectedDealId || resources.length === 0}
                                            className="w-full bg-amber-600 hover:bg-amber-700 text-white gap-2 disabled:opacity-60"
                                            size="lg"
                                            title={resources.length === 0
                                                ? 'Generate or add scope first, then come back here to apply meeting feedback.'
                                                : 'Paste meeting minutes / chat — AI proposes scope and overhead changes for review.'}
                                        >
                                            <MessageSquareText className="h-4 w-4" />
                                            Suggest changes from notes
                                        </Button>
                                    </div>
                                }
                            />
                        </CardContent>
                    </Card>
                )}

                {selectedDeal && (selectedDeal.ghostRoles?.length ?? 0) > 0 && (
                    <Card className="shadow-sm border-slate-100">
                        <CardHeader className="pb-4 border-b">
                            <CardTitle className="text-lg">Project Roles</CardTitle>
                            <CardDescription>
                                The role mix saved on this deal. Generated by AI Team Builder above, or set manually on the deal page.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="p-0">
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-slate-50">
                                        <TableHead>Role</TableHead>
                                        <TableHead className="text-right">Qty</TableHead>
                                        <TableHead className="text-right">Months</TableHead>
                                        <TableHead className="text-right">Monthly salary range</TableHead>
                                        <TableHead className="text-right">Estimated cost</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {(selectedDeal.ghostRoles ?? []).map((gr, i) => {
                                        const avg = ((gr.minMonthlySalary ?? 0) + (gr.maxMonthlySalary ?? 0)) / 2
                                        const total = gr.quantity * gr.months * avg
                                        const labelByRoleType: Record<string, string> = {
                                            frontend: 'Frontend Engineer',
                                            backend: 'Backend Engineer',
                                            design: 'Product Designer',
                                            qa: 'QA Engineer',
                                            pm: 'Project Manager',
                                        }
                                        return (
                                            <TableRow key={gr.id || `gr-${i}`}>
                                                <TableCell>
                                                    <div className="font-medium text-[#171717]">{labelByRoleType[gr.roleType] ?? gr.roleType}</div>
                                                    <div className="text-[10px] uppercase tracking-wider text-[#8a8a8a]">{gr.roleType}</div>
                                                </TableCell>
                                                <TableCell className="text-right">{gr.quantity}</TableCell>
                                                <TableCell className="text-right">{gr.months}</TableCell>
                                                <TableCell className="text-right tabular-nums">
                                                    {formatMoney(gr.minMonthlySalary, currency)} – {formatMoney(gr.maxMonthlySalary, currency)}
                                                </TableCell>
                                                <TableCell className="text-right tabular-nums font-medium">
                                                    {formatMoney(total, currency)}
                                                </TableCell>
                                            </TableRow>
                                        )
                                    })}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                )}

                <Card className={`shadow-sm border-slate-100 ${!selectedDealId ? 'opacity-50 pointer-events-none' : ''}`}>
                    <CardHeader className="pb-4 border-b">
                        <CardTitle className="text-lg">Project Scope & Labor</CardTitle>
                        <CardDescription>Itemize the project scope to calculate base developer costs.</CardDescription>
                    </CardHeader>
                    {aiDraft && (
                        <AIDraftReviewPanel
                            draft={aiDraft}
                            onDiscard={handleDiscardAiDraft}
                        />
                    )}
                    <CardContent className="p-0">
                        <Table>
                            <TableHeader className="bg-slate-50">
                                <TableRow>
                                    <TableHead>Feature</TableHead>
                                    <TableHead>Role</TableHead>
                                    <TableHead className="text-right">Sell Rate / Hr</TableHead>
                                    <TableHead className="text-right">Hours</TableHead>
                                    <TableHead className="text-right">Amount</TableHead>
                                    <TableHead className="w-[50px]"></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {resources.map((res) => {
                                    const role = store.roles.find(r => r.id === res.roleId);
                                    // Display the SELL rate (cost + 15% absorbed overhead) — matches
                                    // the "Sell / Hr" column on /organization Employees and keeps the
                                    // per-row Amount consistent with the Labor Cost total below.
                                    const sellRate = sellRateForResource(res);
                                    return (
                                        <TableRow key={res.id}>
                                            <TableCell className="font-medium">{res.featureName}</TableCell>
                                            <TableCell>{role?.title || 'Unknown Role'}</TableCell>
                                            <TableCell className="text-right">{formatMoney(sellRate, currency)}</TableCell>
                                            <TableCell className="text-right">{res.hours}</TableCell>
                                            <TableCell className="text-right font-medium">{formatMoney(res.hours * sellRate, currency)}</TableCell>
                                            <TableCell>
                                                <Button variant="ghost" size="icon" className="h-8 w-8 text-rose-500 hover:text-rose-600 hover:bg-rose-50" onClick={() => handleRemove(res.id)}>
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>

                        <div className="p-4 bg-slate-50 border-t flex gap-3 items-end">
                            <div className="flex-1 space-y-1">
                                <label className="text-xs font-medium text-slate-500">Feature Name</label>
                                <Input value={newFeature} onChange={e => setNewFeature(e.target.value)} placeholder="e.g. User Profile" className="h-9 bg-white" />
                            </div>
                            <div className="w-[200px] space-y-1">
                                <label className="text-xs font-medium text-slate-500">Role</label>
                                <Select
                                value={newRoleId}
                                onValueChange={setNewRoleId}>
                                    <SelectTrigger className="h-9 bg-white">
                                        <SelectValue placeholder="Select role..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {store.roles.map(r => (
                                            <SelectItem key={r.id} value={r.id}>{r.title} (Bill: {formatMoney(r.rate, currency)})</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="w-[100px] space-y-1">
                                <label className="text-xs font-medium text-slate-500">Hours</label>
                                <Input type="number" min="1" value={newHours} onChange={e => setNewHours(e.target.value)} placeholder="0" className="h-9 bg-white" />
                            </div>
                            <Button onClick={handleAdd} className="h-9 bg-[#171717] gap-2">
                                <Plus className="h-4 w-4" /> Add
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                <Card className={`shadow-sm border-slate-100 ${!selectedDealId ? 'opacity-50 pointer-events-none' : ''}`}>
                    <CardHeader className="pb-4 border-b">
                        <CardTitle className="text-lg">Project-Specific Overhead</CardTitle>
                        <CardDescription>Add one-time expenses specific to this contract (travel, audits, specialized licenses).</CardDescription>
                    </CardHeader>
                    <CardContent className="p-0">
                        <Table>
                            <TableHeader className="bg-slate-50">
                                <TableRow>
                                    <TableHead>Overhead Category / Description</TableHead>
                                    <TableHead className="text-right">Project Cost</TableHead>
                                    <TableHead className="w-[50px]"></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {overheads.map((ov) => (
                                    <TableRow key={ov.id}>
                                        <TableCell className="font-medium">{ov.name}</TableCell>
                                        <TableCell className="text-right font-medium text-rose-600">{formatMoney(ov.cost, currency)}</TableCell>
                                        <TableCell>
                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-rose-500 hover:text-rose-600 hover:bg-rose-50" onClick={() => handleRemoveOverhead(ov.id)}>
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {overheads.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={3} className="text-center text-muted-foreground py-6">No specific overheads added.</TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>

                        <div className="p-4 bg-slate-50 border-t flex gap-3 items-end">
                            <div className="flex-1 space-y-1">
                                <label className="text-xs font-medium text-slate-500">Expense Name</label>
                                <Input value={newOverheadName} onChange={e => setNewOverheadName(e.target.value)} placeholder="e.g. Security Audit Firm" className="h-9 bg-white" />
                            </div>
                            <div className="w-[150px] space-y-1">
                                <label className="text-xs font-medium text-slate-500">Cost ({symbol})</label>
                                <Input type="number" min="0" value={newOverheadCost} onChange={e => setNewOverheadCost(e.target.value)} placeholder="0" className="h-9 bg-white" />
                            </div>
                            <Button onClick={handleAddOverhead} className="h-9 bg-[#171717] gap-2">
                                <Plus className="h-4 w-4" /> Add
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <div className={`space-y-6 ${!selectedDealId ? 'opacity-50 pointer-events-none' : ''}`}>
                <Card className="shadow-sm border-slate-100 bg-white">
                    <CardHeader className="pb-4">
                        <CardTitle className="flex items-center gap-2 text-lg">
                            <Calculator className="h-5 w-5 text-blue-500" />
                            Margin Simulator
                        </CardTitle>
                        <CardDescription className="text-muted-foreground">Drag to target margin</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="space-y-4">
                            <div className="flex justify-between items-center">
                                <span className="text-sm font-medium text-slate-700">Target Margin</span>
                                <span className="text-2xl font-bold text-emerald-500">{margin[0]}%</span>
                            </div>
                            <Slider
                                value={margin}
                                onValueChange={setMargin}
                                max={80}
                                min={10}
                                step={1}
                                className="py-4"
                            />
                        </div>

                        <div className="pt-4 border-t border-slate-100 space-y-4">
                            <div className="flex justify-between items-center text-sm">
                                <span
                                    className="text-slate-500"
                                    title={`Per-hour rate already includes the ${LABOR_OVERHEAD_PERCENTAGE}% absorbed company overhead — see /organization Employees "Sell / Hr".`}
                                >
                                    Labor Cost
                                </span>
                                <span className="font-medium text-slate-800">{formatMoney(laborCost, currency)}</span>
                            </div>
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-500">Project Overhead</span>
                                <span className="font-medium text-rose-500">{formatMoney(projectOverheadTotal, currency)}</span>
                            </div>
                            <div className="flex justify-between items-center text-sm font-semibold border-t border-slate-100 pt-2">
                                <span className="text-slate-700">Total Project Cost</span>
                                <span className="text-slate-800">{formatMoney(totalCost, currency)}</span>
                            </div>
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-500">Expected Profit</span>
                                <span className="font-medium text-emerald-500">+{formatMoney(expectedProfit, currency)}</span>
                            </div>
                            <div className="pt-2 flex justify-between items-end border-t border-slate-100">
                                <span className="text-sm font-medium text-slate-700">Suggested Price</span>
                                    <span className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-500 to-emerald-500">
                                    {formatMoney(suggestedPrice, currency)}
                                </span>
                            </div>

                            {clientBudget > 0 && (
                                <div className="flex justify-between items-center text-xs pt-1">
                                    <span className="text-slate-400">vs. Client Budget</span>
                                    <span className={exceedsBudget ? 'text-rose-600 font-medium' : 'text-slate-500'}>
                                        {formatMoney(clientBudget, currency)}
                                    </span>
                                </div>
                            )}
                        </div>

                        {exceedsBudget && (
                            <div className="rounded-md border border-rose-200 bg-rose-50 p-3 space-y-1">
                                <p className="text-xs font-semibold text-rose-700 uppercase tracking-wider">
                                    Suggested price exceeds budget
                                </p>
                                <p className="text-xs text-rose-700">
                                    {formatMoney(budgetOverage, currency)} over the client&apos;s {formatMoney(clientBudget, currency)} budget
                                    {' '}({budgetOveragePercent.toFixed(1)}%). Lower the target margin or reduce scope before quoting.
                                </p>
                            </div>
                        )}

                        <div className="pt-2">
                            <label className="text-xs font-medium text-slate-500 mb-1 block">Version Notes (optional)</label>
                            <Input
                                value={versionNotes}
                                onChange={e => setVersionNotes(e.target.value)}
                                placeholder="What changed in this version?"
                                className="h-8 text-xs bg-white border-slate-200 text-slate-800 placeholder:text-slate-400"
                            />
                        </div>

                        <Button
                            onClick={handleSave}
                            disabled={!selectedDealId || isUnchangedFromSaved || saveVersion.isPending}
                            className="w-full bg-blue-600 hover:bg-blue-700 text-white gap-2 disabled:opacity-60"
                        >
                            <Save className="h-4 w-4" />
                            {saveVersion.isPending
                                ? 'Snapshotting...'
                                : isUnchangedFromSaved
                                    ? 'No changes since last version'
                                    : `Save Version v${nextVersion}${hasUnsavedChanges ? '+' : ''}`}
                        </Button>
                        <p className="text-[10px] text-slate-400 text-center -mt-1">
                            Edits auto-save to the deal as you type. Save Version creates a checkpoint with XLSX.
                        </p>

                        {/* Contract Ready — manual B→A trigger. Pressed only when the
                            customer has agreed to a specific number. Independent of
                            Save Version (which can be pressed as often as needed).
                            Shows as enabled at qualified (B), disabled with tooltip
                            at lead (C), and replaced by a confirmed badge at
                            negotiation/won (A/S). */}
                        {selectedDeal && (
                            <div className="pt-3 border-t border-slate-100 space-y-1.5">
                                {selectedDeal.status === 'qualified' && (
                                    <>
                                        <Button
                                            onClick={() => setContractReadyOpen(true)}
                                            disabled={!selectedDealId}
                                            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
                                        >
                                            <FileCheck2 className="h-4 w-4" />
                                            Mark Contract Ready
                                        </Button>
                                        <p className="text-[10px] text-slate-400 text-center">
                                            Press this when the customer has agreed. Locks the terms and advances the deal to Rank A.
                                        </p>
                                    </>
                                )}
                                {selectedDeal.status === 'lead' && (
                                    <Button
                                        disabled
                                        className="w-full gap-2"
                                        title="Move the deal to Qualified (Rank B) before marking contract ready."
                                    >
                                        <FileCheck2 className="h-4 w-4" />
                                        Mark Contract Ready (Rank B required)
                                    </Button>
                                )}
                                {(selectedDeal.status === 'negotiation' || selectedDeal.status === 'won') && (
                                    <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 flex items-start gap-2">
                                        <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs font-semibold text-emerald-800">
                                                Contract terms confirmed
                                                {selectedDeal.finalConfirmedAt && (
                                                    <span className="font-normal text-emerald-700">
                                                        {' '}· {new Date(selectedDeal.finalConfirmedAt).toLocaleDateString()}
                                                    </span>
                                                )}
                                            </p>
                                            <p className="text-[11px] text-emerald-700 mt-0.5">
                                                Deal is at Rank {selectedDeal.status === 'won' ? 'S' : 'A'}. The agreed terms
                                                are locked; you can still save more versions for the record.
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {selectedDeal && (
                            <ContractReadyDialog
                                open={contractReadyOpen}
                                onOpenChange={setContractReadyOpen}
                                deal={selectedDeal}
                                suggestedPrice={suggestedPrice}
                                resources={resources}
                            />
                        )}

                        {selectedDealId && (
                            <SuggestChangesFromNotesDialog
                                open={suggestFromNotesOpen}
                                onOpenChange={setSuggestFromNotesOpen}
                                dealId={selectedDealId}
                                currentResources={resources}
                                currentOverheads={overheads}
                                currency={currency}
                                onApply={async ({ resources: nextResources, overheads: nextOverheads, contextNotes }) => {
                                    // 1. Persist applied changes to the deal so the auto-saved
                                    //    state matches what the new version snapshot will hold.
                                    //    Cancels the pending debounced auto-save (if any) since
                                    //    we're writing the same fields right now.
                                    if (autoSaveTimerRef.current) {
                                        clearTimeout(autoSaveTimerRef.current);
                                        autoSaveTimerRef.current = null;
                                    }
                                    await updateDeal.mutateAsync({
                                        id: selectedDealId,
                                        updates: {
                                            estimationResources: nextResources,
                                            projectOverheads: nextOverheads,
                                            targetMargin: margin[0],
                                        },
                                    });
                                    // Mirror locally so the UI doesn't flash old values while
                                    // the deal query refetches.
                                    setResources(nextResources);
                                    setOverheads(nextOverheads);
                                    setDirty(false);

                                    // 2. Auto-save as the next version with the notes attached.
                                    //    The user agreed to this in the AskUserQuestion flow —
                                    //    Apply = locked record.
                                    const nextVer = (currentVersion?.versionNumber ?? 0) + 1;
                                    await saveVersion.mutateAsync({
                                        dealId: selectedDealId,
                                        resources: nextResources.map(r => ({
                                            roleId: r.roleId,
                                            employeeId: r.employeeId ?? null,
                                            featureName: r.featureName,
                                            hours: r.hours,
                                        })),
                                        overheads: nextOverheads,
                                        targetMargin: margin[0],
                                        notes: 'Applied AI suggestions from meeting notes',
                                        contextNotes,
                                    });
                                    setLastSavedAt(new Date().toLocaleString());
                                    toast.success(`Applied changes — saved as v${nextVer} with notes attached.`);
                                }}
                            />
                        )}

                        {/* Replaces the native window.confirm that used to gate AI
                            regeneration. Lives inside the right-hand summary card so
                            the modal anchor mounts only when there's a selected deal. */}
                        <Dialog open={regenerateConfirmOpen} onOpenChange={setRegenerateConfirmOpen}>
                            <DialogContent className="sm:max-w-[460px]">
                                <DialogHeader>
                                    <div className="flex items-start gap-3">
                                        <div className="rounded-full bg-amber-100 p-2 mt-0.5">
                                            <AlertTriangle className="h-5 w-5 text-amber-600" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <DialogTitle>Replace current estimate?</DialogTitle>
                                            <DialogDescription className="mt-1.5">
                                                A fresh AI suggestion will replace the {resources.length} scope row{resources.length === 1 ? '' : 's'}
                                                {overheads.length > 0 && ` and ${overheads.length} overhead${overheads.length === 1 ? '' : 's'}`}
                                                {' '}currently on this deal, and save the new version to the database.
                                            </DialogDescription>
                                        </div>
                                    </div>
                                </DialogHeader>
                                <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                                    Tip: save a version first if you want to compare the AI&rsquo;s new draft against the current scope side-by-side.
                                </div>
                                <DialogFooter className="gap-2">
                                    <Button
                                        variant="outline"
                                        onClick={() => setRegenerateConfirmOpen(false)}
                                        disabled={isGeneratingAi}
                                    >
                                        Keep current estimate
                                    </Button>
                                    <Button
                                        className="bg-violet-600 hover:bg-violet-700 text-white gap-2"
                                        disabled={isGeneratingAi}
                                        onClick={async () => {
                                            setRegenerateConfirmOpen(false);
                                            await runAiGeneration();
                                        }}
                                    >
                                        <Sparkles className="h-4 w-4" />
                                        Replace &amp; regenerate
                                    </Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
