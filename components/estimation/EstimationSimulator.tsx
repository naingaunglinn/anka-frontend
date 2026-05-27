'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Trash2, Calculator, Save, ExternalLink, Clock, History, GitCompare, RotateCcw, Download, Sparkles, FileCheck2, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
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
import { EstimationRoleBuilder, type EstimationRoleBuilderHandle } from '@/components/estimation/EstimationRoleBuilder';
import { ContractReadyDialog } from '@/components/estimation/ContractReadyDialog';
import { SendEstimateDialog } from '@/components/estimation/SendEstimateDialog';
import { SuggestChangesFromNotesDialog } from '@/components/estimation/SuggestChangesFromNotesDialog';
import { MessageSquareText } from 'lucide-react';
import { useDealList, useDealMutations } from '@/lib/queries/deals';
import type { AISuggestedRole } from '@/types/aiTeamBuilder';
import type { GhostRole } from '@/types/business';
import {
    applySellMarkup,
    applyBillingMarkup,
    LABOR_OVERHEAD_PERCENTAGE,
    BILLING_MARKUP_MULTIPLIER,
} from '@/lib/calculations';
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
    const t = useTranslations()
    // The version-list endpoint returns counts only — not the actual resources
    // array. Fetch the full version detail here so the diff table reflects
    // real saved values, not always-empty placeholders.
    const detailQuery = useEstimationVersionDetail(versionId)
    const detail = detailQuery.data
    const store = useBusinessStore()

    const headerLabel = detail
        ? `Comparing with v${detail.versionNumber}${detail.notes ? ` · ${detail.notes}` : ''}`
        : t('loading_comparison')

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
                <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={onClose}>{t('close')}</Button>
            </div>

            {detailQuery.isLoading && (
                <p className="text-xs text-slate-500 italic">{t('loading_saved_version')}</p>
            )}

            {detailQuery.isError && (
                <p className="text-xs text-rose-600">
                    {t('could_not_load_version')}
                    <Button variant="link" size="sm" className="h-auto px-1 text-xs text-rose-600" onClick={() => detailQuery.refetch()}>{t('retry')}</Button>
                </p>
            )}

            {detail && (
                <div className="space-y-3">
                    <div className="grid grid-cols-3 gap-4 text-xs">
                        <div className="font-medium text-slate-500">{t('role')}</div>
                        <div className="font-medium text-slate-500 text-right">{t('saved_v_label', { version: detail.versionNumber })}</div>
                        <div className="font-medium text-slate-500 text-right">{t('current')}</div>
                        {allRoleIds.length === 0 ? (
                            <div className="col-span-3 text-slate-500 italic">{t('no_resources_either_version')}</div>
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
                            <div className="font-medium text-slate-500">{t('overhead_col')}</div>
                            <div className="font-medium text-slate-500 text-right">{t('saved_col')}</div>
                            <div className="font-medium text-slate-500 text-right">{t('current')}</div>
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
                        <div className="text-slate-700">Derived Margin</div>
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
    const t = useTranslations();
    const router = useRouter();
    const store = useBusinessStore();
    const qc = useQueryClient();
    const currency = useTenantCurrency();
    const symbol = useCurrencySymbol();
    const eligibleDeptIds = new Set(
        store.departments.filter(d => d.isDeliveryEligible).map(d => d.id),
    );
    const deliveryRoles = store.roles.filter(r => r.departmentId && eligibleDeptIds.has(r.departmentId));
    // Map capacity-role codes (e.g. "backend") → delivery role ID so existing
    // ghost roles saved with capacity codes can display/match correctly.
    const capCodeToRoleId = new Map<string, string>();
    for (const dr of deliveryRoles) {
        const emps = store.employees.filter(e => e.jobRoleId === dr.id && e.capacityRole);
        for (const e of emps) {
            if (e.capacityRole && !capCodeToRoleId.has(e.capacityRole)) {
                capCodeToRoleId.set(e.capacityRole, dr.id);
            }
        }
    }
    const resolveRoleType = (rt: string) => capCodeToRoleId.get(rt) ?? rt;
    const resolveRoleLabel = (rt: string) => deliveryRoles.find(r => r.id === resolveRoleType(rt))?.title ?? rt;
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
    const versionNotesRef = useRef<HTMLInputElement>(null);
    const [showHistory, setShowHistory] = useState(false);
    const [contractReadyOpen, setContractReadyOpen] = useState(false);
    const [sendEstimateOpen, setSendEstimateOpen] = useState(false);
    const [regenerateConfirmOpen, setRegenerateConfirmOpen] = useState(false);
    const [suggestFromNotesOpen, setSuggestFromNotesOpen] = useState(false);
    const roleBuilderHandleRef = useRef<EstimationRoleBuilderHandle | null>(null);
    const [isBuildingTeam, setIsBuildingTeam] = useState(false);

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

    // Local estimation state before saving. `margin` is no longer user-input —
    // it's kept in state purely for the autosave payload (target_margin column)
    // and synced from derivedMarginPct below.
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
        // margin is auto-derived below from resources × 3× rule; the saved
        // value is overwritten on the next render. Seed once to keep the
        // autosave payload non-null until the derive effect fires.
        setMargin([deal.targetMargin || 0]);
        setDirty(false);
        setLastSavedAt(null);
    };

    useEffect(() => {
        // Clear state when no deal is selected.
        if (!selectedDealId) {
            setResources([]);
            setOverheads([]);
            setMargin([0]);
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
    // (which in turn re-derives margin) and `dirty` flips true, schedule a PATCH
    // to deal.estimation_resources + deal.deal_overheads after 800ms of inactivity.
    // AI generation persists synchronously inside handleGenerateAi, so it sets
    // dirty=false explicitly — this effect only handles row/overhead edits the
    // user makes afterward.
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
                toast.error(t('could_not_save_changes'));
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
                toast.error(t('no_roles_defined'));
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
                toast.error(t('ai_could_not_save'));
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
            toast.success(t('ai_generated_features', { count: aiResources.length, ovhSuffix }));
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
                notes: versionNotesRef.current?.value || undefined,
            });
            setDirty(false);
            setLastSavedAt(new Date().toLocaleString());
            if (versionNotesRef.current) versionNotesRef.current.value = '';
            toast.success(t('estimation_saved', { version: nextVer }));
        } catch {
            toast.error(t('failed_save_estimation'));
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
            toast.success(t('restored_to_v', { version: versionNumber }));
        } catch {
            toast.error(t('failed_restore_version'));
        }
    };

    // costRateForResource / costRateForRole now return the LOADED cost
    // (raw hourly salary + LABOR_OVERHEAD_PERCENTAGE absorbed overhead).
    // Matches the "Cost / Hr" column on /organization → Employees.
    //   1. Active employees with this jobRoleId → median(loaded costPerHour).
    //   2. No matching employees but role exists with a positive rate →
    //      role.rate × costToBillRatio × 1.15 (loaded fallback).
    //   3. Nothing → fallbackHourlyCost × 1.15.
    // Both fallbacks are tenant-tunable via /organization → Salary Structure.
    const costRateForRole = (roleId: string): number => {
        const rates = store.employees
            .filter(e => e.jobRoleId === roleId && e.status === 'Active')
            .map(e => e.costPerHour)
            .filter((r): r is number => typeof r === 'number' && Number.isFinite(r) && r > 0);
        if (rates.length > 0) return applySellMarkup(median(rates));

        const role = store.roles.find(r => r.id === roleId);
        if (role && role.rate > 0) return applySellMarkup(role.rate * store.companySettings.costToBillRatio);

        return applySellMarkup(store.companySettings.fallbackHourlyCost);
    };

    const costRateForResource = (res: EstimationResource): number => {
        if (res.employeeId) {
            const emp = store.employees.find(e => e.id === res.employeeId);
            if (emp && typeof emp.costPerHour === 'number' && Number.isFinite(emp.costPerHour) && emp.costPerHour > 0) {
                return applySellMarkup(emp.costPerHour);
            }
        }
        return costRateForRole(res.roleId);
    };

    // Sell rate is what we quote to the client per hour: loaded cost × 2.
    // Matches the "Sell / Hr" column on /organization → Employees.
    const sellRateForResource = (res: EstimationResource): number => applyBillingMarkup(costRateForResource(res));

    // Cost basis (what the project costs the agency) vs. labor sell (what we
    // bill the client for labor). Overheads pass through at cost — they're
    // pass-through expenses, not part of the 3× labor markup.
    const laborCostBasis = resources.reduce(
        (sum, res) => sum + res.hours * costRateForResource(res),
        0,
    );
    const laborSell = resources.reduce(
        (sum, res) => sum + res.hours * sellRateForResource(res),
        0,
    );

    const projectOverheadTotal = overheads.reduce((sum, o) => sum + o.cost, 0);
    const totalCost = laborCostBasis + projectOverheadTotal;

    // Price is fixed by the 3× rule; no margin slider input. Margin is the
    // derived output of (price − cost) / price, persisted to target_margin
    // for backwards compatibility with deal/version reports.
    const suggestedPrice = laborSell + projectOverheadTotal;
    const dealBudget = store.deals.find(d => d.id === selectedDealId)?.clientBudget ?? 0;
    const expectedProfit = dealBudget > 0 ? dealBudget - totalCost : suggestedPrice - totalCost;
    const derivedMarginPct = suggestedPrice > 0
        ? Math.min(100, Math.max(0, Math.round((expectedProfit / suggestedPrice) * 100)))
        : 0;

    // Mirror the derived margin into the `margin` state so the autosave payload
    // and CompareBanner pick it up. Guarded to avoid render loops.
    useEffect(() => {
        setMargin(prev => prev[0] === derivedMarginPct ? prev : [derivedMarginPct]);
    }, [derivedMarginPct]);

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

    // ── Project Roles inline editor ───────────────────────────────────────
    // Each helper writes the full ghostRoles array via updateDeal.mutateAsync
    // because the deal endpoint takes the whole array on update (no per-row
    // route). Optimistic feedback is handled by the mutation hook itself.
    const updateGhostRoleAt = (i: number, patch: Partial<GhostRole>) => {
        if (!selectedDeal) return;
        const next = (selectedDeal.ghostRoles ?? []).map((r, idx) => idx === i ? { ...r, ...patch } : r);
        void updateDeal.mutateAsync({ id: selectedDeal.id, updates: { ghostRoles: next } })
            .catch((err) => { console.error('Failed to update ghost role:', err); toast.error(t('could_not_save_roles')); });
    };
    const removeGhostRoleAt = (i: number) => {
        if (!selectedDeal) return;
        const next = (selectedDeal.ghostRoles ?? []).filter((_, idx) => idx !== i);
        void updateDeal.mutateAsync({ id: selectedDeal.id, updates: { ghostRoles: next } })
            .catch((err) => { console.error('Failed to remove ghost role:', err); toast.error(t('could_not_save_roles')); });
    };
    const addGhostRole = (role: Omit<GhostRole, 'id'>) => {
        if (!selectedDeal) return;
        const next = [...(selectedDeal.ghostRoles ?? []), { id: '', ...role }];
        void updateDeal.mutateAsync({ id: selectedDeal.id, updates: { ghostRoles: next } })
            .catch((err) => { console.error('Failed to add ghost role:', err); toast.error(t('could_not_save_roles')); });
    };

    // Add-Role form state. Reset after each successful add.
    const [newRoleType, setNewRoleType] = useState<string>('');
    const [newRoleQty, setNewRoleQty] = useState<string>('1');
    const [newRoleMonths, setNewRoleMonths] = useState<string>('');
    const [newRoleHours, setNewRoleHours] = useState<string>('');
    const handleAddProjectRole = () => {
        if (!newRoleType || !newRoleMonths) return;
        addGhostRole({
            roleType: newRoleType as GhostRole['roleType'],
            quantity: Math.max(1, Number(newRoleQty) || 1),
            months:   Math.max(1, Number(newRoleMonths) || 1),
            minMonthlySalary: 0,
            maxMonthlySalary: 0,
        });
        setNewRoleType(''); setNewRoleQty('1'); setNewRoleMonths(''); setNewRoleHours('');
    };
    const BUDGET_TOLERANCE = 1.05;
    const exceedsBudget = clientBudget > 0 && suggestedPrice > clientBudget * BUDGET_TOLERANCE;
    const budgetOverage = exceedsBudget ? suggestedPrice - clientBudget : 0;
    const budgetOveragePercent = exceedsBudget && clientBudget > 0
        ? (budgetOverage / clientBudget) * 100
        : 0;

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">

                <Card variant="plain" className="bg-slate-50">
                    <CardHeader className="pb-4">
                        <CardTitle className="text-sm uppercase tracking-wider text-slate-500">{t('target_deal')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center gap-3">
                            <Select value={selectedDealId} onValueChange={handleDealChange}>
                                <SelectTrigger className="w-full bg-white">
                                    <SelectValue placeholder={t('select_deal_from_crm')} />
                                </SelectTrigger>
                                <SelectContent>
                                    {store.deals.filter(d => d.status === 'lead' || d.status === 'qualified').map(deal => (
                                        <SelectItem key={deal.id} value={deal.id}>
                                            {deal.name} ({deal.client || t('no_client')})
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {selectedDealId && (
                                <Button variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={() => router.push(`/crm/${selectedDealId}`)}>
                                    <ExternalLink className="h-3.5 w-3.5" /> {t('view_deal')}
                                </Button>
                            )}
                        </div>
                    </CardContent>
                </Card>

                {selectedDealId && (
                    <Card variant="plain">
                        <CardHeader className="pb-3 border-b">
                            <div className="flex justify-between items-center flex-wrap gap-3">
                                <div>
                                    <CardTitle className="text-base">{t('estimate_versions')}</CardTitle>
                                    <CardDescription className="text-xs">{t('estimate_versions_desc')}</CardDescription>
                                </div>
                                <div className="flex items-center gap-3 flex-wrap">
                                    <div className="flex items-center gap-2 text-xs text-slate-500">
                                        <Clock className="h-3.5 w-3.5" />
                                        <span className="font-medium text-slate-700">
                                            v{currentVersion?.versionNumber ?? 0}{hasUnsavedChanges ? '+' : ''}
                                        </span>
                                        <Chip variant={hasUnsavedChanges ? 'warning' : 'success'} size="sm">
                                            {hasUnsavedChanges ? t('draft') : t('saved')}
                                        </Chip>
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
                                        {t('n_versions', { count: totalVersions })}
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
                                            <SelectValue placeholder={t('compare_to')} />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {compareWithId && (
                                                <SelectItem value="__none__">{t('stop_comparing')}</SelectItem>
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
                                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3">{t('version_history')}</p>
                                {versions.map((v, idx) => (
                                    <div key={v.id} className="flex items-center justify-between p-3 bg-white rounded-lg border border-slate-100">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-semibold text-slate-800">v{v.versionNumber}</span>
                                                <Chip variant="default" size="sm">
                                                    {t('resources_and_overheads', { r: v.resourceCount, o: v.overheadCount })}
                                                </Chip>
                                                {idx === 0 && (
                                                    <Chip variant="success" size="sm">{t('latest')}</Chip>
                                                )}
                                                {v.hasContextNotes && (
                                                    <Chip
                                                        variant="warning"
                                                        size="sm"
                                                        title={v.contextNotes ?? t('has_meeting_notes')}
                                                    >
                                                        <MessageSquareText className="h-3 w-3" />
                                                        {t('notes_short')}
                                                    </Chip>
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
                                                {compareWithId === v.id ? t('comparing') : t('compare')}
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
                                                {isDownloading[v.id] ? t('exporting') : t('export_xlsx')}
                                            </Button>
                                            {idx > 0 && (
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="h-7 gap-1 text-xs"
                                                    onClick={() => handleRestore(v.id, v.versionNumber)}
                                                >
                                                    <RotateCcw className="h-3 w-3" /> {t('restore')}
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

                {selectedDeal && (() => {
                    const hasScope = resources.length > 0;
                    const canBuild = (selectedDeal.clientBudget ?? 0) > 0 && (selectedDeal.timelineMonths ?? 0) > 0;
                    const smartBusy = isBuildingTeam || isGeneratingAi;

                    return (
                    <Card variant="plain">
                        <CardHeader className="pb-4 border-b">
                            <CardTitle className="text-lg flex items-center gap-2">
                                <Sparkles className="h-4 w-4 text-[var(--color-ai-600)]" />
                                {t('ai_project_planner')}
                            </CardTitle>
                            <CardDescription>
                                {t('ai_project_planner_desc')}
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                <Button
                                    type="button"
                                    onClick={() => {
                                        void handleGenerateAi();
                                        void roleBuilderHandleRef.current?.triggerBuild();
                                    }}
                                    disabled={smartBusy}
                                    className="w-full gap-2 disabled:opacity-60 transition-all duration-200 bg-[var(--color-ai-600)] hover:bg-[var(--color-ai-700)] text-white shadow-md"
                                    size="lg"
                                >
                                    {smartBusy ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <Sparkles className="h-4 w-4" />
                                    )}
                                    {smartBusy ? t('generating_with_ai') : t('generate_all_estimation')}
                                </Button>
                                {!canBuild && (
                                    <p className="text-xs text-[var(--color-text-subtle)] text-center">
                                        {t('set_budget_timeline_hint')}
                                    </p>
                                )}
                                {canBuild && !hasScope && (
                                    <p className="text-xs text-amber-600 text-center">
                                        {t('roles_scope_missing_hint')}
                                    </p>
                                )}
                                {hasScope && (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => setSuggestFromNotesOpen(true)}
                                        disabled={smartBusy}
                                        className="w-full gap-2 border-amber-200 text-amber-700 hover:bg-amber-50 disabled:opacity-60"
                                        size="sm"
                                        title={t('ai_assistant_notes_title')}
                                    >
                                        <MessageSquareText className="h-4 w-4" />
                                        {t('refine_scope_from_notes')}
                                    </Button>
                                )}
                                <EstimationRoleBuilder
                                    dealId={selectedDeal.id}
                                    dealName={selectedDeal.name}
                                    dealClient={selectedDeal.client}
                                    clientBudget={selectedDeal.clientBudget ?? 0}
                                    timelineMonths={selectedDeal.timelineMonths ?? 0}
                                    workloadHours={selectedDeal.workloadHours ?? 0}
                                    workloadDescription={selectedDeal.workloadDescription ?? ''}
                                    expectedCloseDate={selectedDeal.expectedCloseDate}
                                    hideBuildButton
                                    handleRef={roleBuilderHandleRef}
                                    onLoadingChange={setIsBuildingTeam}
                                    onAccept={async (roles: AISuggestedRole[]) => {
                                        // Map capacity role code → most common delivery role ID
                                        // among employees with that capacity role.
                                        const capToRoleId = new Map<string, string>();
                                        for (const dr of deliveryRoles) {
                                            const emps = store.employees.filter(e => e.jobRoleId === dr.id && e.capacityRole);
                                            for (const e of emps) {
                                                if (e.capacityRole && !capToRoleId.has(e.capacityRole)) {
                                                    capToRoleId.set(e.capacityRole, dr.id);
                                                }
                                            }
                                        }
                                        const ghostRoles: GhostRole[] = roles.map(r => ({
                                            id: '',
                                            roleType: (capToRoleId.get(r.roleType) ?? r.roleType) as GhostRole['roleType'],
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
                                            toast.success(t('roles_saved_to_deal'));
                                        } catch (err) {
                                            console.error('Failed to save AI roles to deal:', err);
                                            toast.error(t('could_not_save_roles'));
                                        }
                                    }}
                                />
                            </div>
                        </CardContent>
                    </Card>
                    );
                })()}

                <Card variant="plain" className={!selectedDealId ? 'opacity-50 pointer-events-none' : ''}>
                    <CardHeader className="pb-4 border-b">
                        <div className="flex items-start justify-between gap-3">
                            <div className="space-y-1">
                                <CardTitle className="text-lg">{t('project_scope_labor')}</CardTitle>
                                <CardDescription>{t('project_scope_desc')}</CardDescription>
                            </div>
                            <Button
                                type="button"
                                size="sm"
                                onClick={() => void handleGenerateAi()}
                                disabled={!selectedDealId || isGeneratingAi}
                                className="h-8 gap-1.5 shrink-0 bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-60"
                                title={t('ai_assistant_scope_title')}
                            >
                                {isGeneratingAi ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                    <Sparkles className="h-3.5 w-3.5" />
                                )}
                                {isGeneratingAi ? t('generating_with_ai') : t('generate_with_ai')}
                            </Button>
                        </div>
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
                                <label className="text-xs font-medium text-slate-500">{t('feature_name')}</label>
                                <Input value={newFeature} onChange={e => setNewFeature(e.target.value)} placeholder={t('placeholder_user_profile')} className="h-9 bg-white" />
                            </div>
                            <div className="w-[200px] space-y-1">
                                <label className="text-xs font-medium text-slate-500">{t('role')}</label>
                                <Select
                                value={newRoleId}
                                onValueChange={setNewRoleId}>
                                    <SelectTrigger className="h-9 bg-white">
                                        <SelectValue placeholder={t('select_role_short')} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {store.roles.map(r => (
                                            <SelectItem key={r.id} value={r.id}>{t('role_bill_rate', { title: r.title, rate: formatMoney(r.rate, currency) })}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="w-[100px] space-y-1">
                                <label className="text-xs font-medium text-slate-500">{t('hours_col')}</label>
                                <Input type="number" min="1" value={newHours} onChange={e => setNewHours(e.target.value)} placeholder="0" className="h-9 bg-white" />
                            </div>
                            <Button onClick={handleAdd} className="h-9 bg-[var(--color-text-default)] gap-2">
                                <Plus className="h-4 w-4" /> {t('add')}
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                {selectedDeal && (
                    <Card variant="plain">
                        <CardHeader className="pb-4 border-b">
                            <div className="flex items-start justify-between gap-3">
                                <div className="space-y-1">
                                    <CardTitle className="text-lg">{t('project_roles')}</CardTitle>
                                    <CardDescription>
                                        {t('project_roles_desc')}
                                    </CardDescription>
                                </div>
                                <Button
                                    type="button"
                                    size="sm"
                                    onClick={() => { void roleBuilderHandleRef.current?.triggerBuild(); }}
                                    disabled={isBuildingTeam}
                                    className="h-8 gap-1.5 shrink-0 bg-[var(--color-ai-600)] hover:bg-[var(--color-ai-700)] text-white disabled:opacity-60"
                                    title={t('ai_assistant_build_title')}
                                >
                                    {isBuildingTeam ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                        <Sparkles className="h-3.5 w-3.5" />
                                    )}
                                    {isBuildingTeam ? t('building_ellipsis') : t('generate_with_ai')}
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent className="p-0">
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-slate-50">
                                        <TableHead>{t('role')}</TableHead>
                                        <TableHead className="text-right">{t('qty')}</TableHead>
                                        <TableHead className="text-right">{t('months_col')}</TableHead>
                                        <TableHead className="text-right">{t('hours_col')}</TableHead>
                                        <TableHead className="text-right">{t('estimated_cost_col')}</TableHead>
                                        <TableHead className="w-[50px]"></TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {(selectedDeal.ghostRoles ?? []).map((gr, i) => {
                                        const avg = ((gr.minMonthlySalary ?? 0) + (gr.maxMonthlySalary ?? 0)) / 2
                                        const rawCost = gr.quantity * gr.months * avg
                                        const total = applyBillingMarkup(applySellMarkup(rawCost))
                                        const roleKey = gr.id || `gr-${i}`
                                        return (
                                            <TableRow key={roleKey}>
                                                <TableCell className="min-w-[180px]">
                                                    <Select
                                                        value={resolveRoleType(gr.roleType)}
                                                        onValueChange={(v) => updateGhostRoleAt(i, { roleType: v as GhostRole['roleType'] })}
                                                    >
                                                        <SelectTrigger className="h-8 bg-white">
                                                            <SelectValue>
                                                                {resolveRoleLabel(gr.roleType)}
                                                            </SelectValue>
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {deliveryRoles.map(r => (
                                                                <SelectItem key={r.id} value={r.id}>
                                                                    {r.title}
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <Input
                                                        key={`q-${roleKey}-${gr.quantity}`}
                                                        type="number"
                                                        min={1}
                                                        defaultValue={gr.quantity}
                                                        onBlur={(e) => {
                                                            const v = Math.max(1, Number(e.currentTarget.value) || 1)
                                                            if (v !== gr.quantity) updateGhostRoleAt(i, { quantity: v })
                                                        }}
                                                        className="h-8 w-20 ml-auto text-right bg-white"
                                                    />
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <Input
                                                        key={`m-${roleKey}-${gr.months}`}
                                                        type="number"
                                                        min={1}
                                                        defaultValue={gr.months}
                                                        onBlur={(e) => {
                                                            const v = Math.max(1, Number(e.currentTarget.value) || 1)
                                                            if (v !== gr.months) updateGhostRoleAt(i, { months: v })
                                                        }}
                                                        className="h-8 w-20 ml-auto text-right bg-white"
                                                    />
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <Input
                                                        key={`h-${roleKey}-${gr.quantity}-${gr.months}`}
                                                        type="number"
                                                        min={0}
                                                        defaultValue={gr.quantity * gr.months * (store.companySettings.defaultMonthlyCapacityHours || 160)}
                                                        onBlur={(e) => {
                                                            const h = Math.max(0, Number(e.currentTarget.value) || 0)
                                                            const hpm = store.companySettings.defaultMonthlyCapacityHours || 160
                                                            const newMonths = gr.quantity > 0 ? Math.max(1, Math.ceil(h / (gr.quantity * hpm))) : 1
                                                            if (newMonths !== gr.months) updateGhostRoleAt(i, { months: newMonths })
                                                        }}
                                                        className="h-8 w-24 ml-auto text-right tabular-nums bg-white"
                                                    />
                                                </TableCell>
                                                <TableCell className="text-right tabular-nums font-medium">
                                                    {formatMoney(total, currency)}
                                                </TableCell>
                                                <TableCell>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 text-rose-500 hover:text-rose-600 hover:bg-rose-50"
                                                        onClick={() => removeGhostRoleAt(i)}
                                                        title={t('remove')}
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        )
                                    })}
                                </TableBody>
                            </Table>

                            <div className="p-4 bg-slate-50 border-t flex gap-3 items-end flex-wrap">
                                <div className="flex-1 min-w-[180px] space-y-1">
                                    <label className="text-xs font-medium text-slate-500">{t('role')}</label>
                                    <Select value={newRoleType} onValueChange={setNewRoleType}>
                                        <SelectTrigger className="h-9 bg-white">
                                            <SelectValue placeholder={t('select_role_short')} />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {deliveryRoles.map(r => (
                                                <SelectItem key={r.id} value={r.id}>
                                                    {r.title}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="w-[80px] space-y-1">
                                    <label className="text-xs font-medium text-slate-500">{t('qty')}</label>
                                    <Input type="number" min={1} value={newRoleQty} onChange={e => setNewRoleQty(e.target.value)} className="h-9 bg-white text-right" />
                                </div>
                                <div className="w-[90px] space-y-1">
                                    <label className="text-xs font-medium text-slate-500">{t('months_col')}</label>
                                    <Input type="number" min={1} value={newRoleMonths} onChange={e => setNewRoleMonths(e.target.value)} placeholder="0" className="h-9 bg-white text-right" />
                                </div>
                                <div className="w-[100px] space-y-1">
                                    <label className="text-xs font-medium text-slate-500">{t('hours_col')}</label>
                                    <Input type="number" min={0} value={newRoleHours} onChange={e => setNewRoleHours(e.target.value)} placeholder="0" className="h-9 bg-white text-right tabular-nums" />
                                </div>
                                <Button
                                    onClick={handleAddProjectRole}
                                    disabled={!newRoleType || !newRoleMonths}
                                    className="h-9 bg-[var(--color-text-default)] gap-2"
                                >
                                    <Plus className="h-4 w-4" /> {t('add_role')}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                )}

                <Card variant="plain" className={!selectedDealId ? 'opacity-50 pointer-events-none' : ''}>
                    <CardHeader className="pb-4 border-b">
                        <div className="flex items-start justify-between gap-3">
                            <div className="space-y-1">
                                <CardTitle className="text-lg">{t('project_specific_overhead')}</CardTitle>
                                <CardDescription>{t('project_overhead_desc')}</CardDescription>
                            </div>
                            <Button
                                type="button"
                                size="sm"
                                onClick={() => void handleGenerateAi()}
                                disabled={!selectedDealId || isGeneratingAi}
                                className="h-8 gap-1.5 shrink-0 bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-60"
                                title={t('ai_assistant_scope_title')}
                            >
                                {isGeneratingAi ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                    <Sparkles className="h-3.5 w-3.5" />
                                )}
                                {isGeneratingAi ? t('generating_with_ai') : t('generate_with_ai')}
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent className="p-0">
                        <Table>
                            <TableHeader className="bg-slate-50">
                                <TableRow>
                                    <TableHead>{t('overhead_cat_desc')}</TableHead>
                                    <TableHead className="text-right">{t('project_cost_col')}</TableHead>
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
                                        <TableCell colSpan={3} className="text-center text-muted-foreground py-6">{t('no_specific_overheads')}</TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>

                        <div className="p-4 bg-slate-50 border-t flex gap-3 items-end">
                            <div className="flex-1 space-y-1">
                                <label className="text-xs font-medium text-slate-500">{t('expense_name')}</label>
                                <Input value={newOverheadName} onChange={e => setNewOverheadName(e.target.value)} placeholder={t('placeholder_security_audit')} className="h-9 bg-white" />
                            </div>
                            <div className="w-[150px] space-y-1">
                                <label className="text-xs font-medium text-slate-500">{t('cost_with_symbol', { symbol })}</label>
                                <Input type="number" min="0" value={newOverheadCost} onChange={e => setNewOverheadCost(e.target.value)} placeholder="0" className="h-9 bg-white" />
                            </div>
                            <Button onClick={handleAddOverhead} className="h-9 bg-[var(--color-text-default)] gap-2">
                                <Plus className="h-4 w-4" /> {t('add')}
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <div className={`space-y-6 ${!selectedDealId ? 'opacity-50 pointer-events-none' : ''}`}>
                <Card variant="plain">
                    <CardHeader className="pb-4">
                        <CardTitle className="flex items-center gap-2 text-lg">
                            <Calculator className="h-5 w-5 text-blue-500" />
                            Margin Summary
                        </CardTitle>
                        <CardDescription className="text-muted-foreground">
                            Price = labor sell ({BILLING_MARKUP_MULTIPLIER}× loaded cost) + overheads at cost. Margin is derived.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="space-y-4">
                            <div className="flex justify-between items-center">
                                <span className="text-sm font-medium text-slate-700">Derived Margin</span>
                                <span className="text-2xl font-bold text-emerald-500">{derivedMarginPct}%</span>
                            </div>
                        </div>

                        <div className="pt-4 border-t border-slate-100 space-y-4">
                            <div className="flex justify-between items-center text-sm">
                                <span
                                    className="text-slate-500"
                                    title={`Sum of hours × Sell Rate (loaded cost × ${BILLING_MARKUP_MULTIPLIER}). What we bill the client for labor.`}
                                >
                                    Suggested Amount
                                </span>
                                <span className="font-medium text-slate-800">{formatMoney(laborSell, currency)}</span>
                            </div>
                            <div className="flex justify-between items-center text-sm">
                                <span
                                    className="text-slate-500"
                                    title={`Sum of hours × Cost / Hr (raw salary + ${LABOR_OVERHEAD_PERCENTAGE}% absorbed overhead). What labor costs the agency.`}
                                >
                                    Total Estimate Cost
                                </span>
                                <span className="font-medium text-slate-800">{formatMoney(laborCostBasis, currency)}</span>
                            </div>
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-500">{t('project_overhead')}</span>
                                <span className="font-medium text-rose-500">{formatMoney(projectOverheadTotal, currency)}</span>
                            </div>
                            <div className="flex justify-between items-center text-sm font-semibold border-t border-slate-100 pt-2">
                                <span className="text-slate-700">{t('total_project_cost')}</span>
                                <span className="text-slate-800">{formatMoney(totalCost, currency)}</span>
                            </div>
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-500">{t('expected_profit')}</span>
                                <span className="font-medium text-emerald-500">+{formatMoney(expectedProfit, currency)}</span>
                            </div>
                            <div className="pt-2 flex justify-between items-end border-t border-slate-100">
                                <span className="text-sm font-medium text-slate-700">{t('suggested_price')}</span>
                                    <span className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-500 to-emerald-500">
                                    {formatMoney(suggestedPrice, currency)}
                                </span>
                            </div>

                            {clientBudget > 0 && (
                                <div className="flex justify-between items-center text-xs pt-1">
                                    <span className="text-slate-400">{t('vs_client_budget')}</span>
                                    <span className={exceedsBudget ? 'text-rose-600 font-medium' : 'text-slate-500'}>
                                        {formatMoney(clientBudget, currency)}
                                    </span>
                                </div>
                            )}
                        </div>

                        {exceedsBudget && (
                            <div className="rounded-md border border-rose-200 bg-rose-50 p-3 space-y-1">
                                <p className="text-xs font-semibold text-rose-700 uppercase tracking-wider">
                                    {t('suggested_price_exceeds_budget')}
                                </p>
                                <p className="text-xs text-rose-700">
                                    {formatMoney(budgetOverage, currency)} over the client&apos;s {formatMoney(clientBudget, currency)} budget
                                    {' '}({budgetOveragePercent.toFixed(1)}%). Reduce hours or scope before quoting — labor sell rate is fixed at {BILLING_MARKUP_MULTIPLIER}× loaded cost.
                                </p>
                            </div>
                        )}

                        <div className="pt-2">
                            <label className="text-xs font-medium text-slate-500 mb-1 block">{t('version_notes_optional')}</label>
                            <Input
                                ref={versionNotesRef}
                                placeholder={t('placeholder_version_changes')}
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
                                ? t('snapshotting')
                                : isUnchangedFromSaved
                                    ? t('no_changes_since_last')
                                    : t('save_version_v', { version: `${nextVersion}${hasUnsavedChanges ? '+' : ''}` })}
                        </Button>
                        <p className="text-[10px] text-slate-400 text-center -mt-1">
                            {t('auto_save_explainer')}
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
                                            {t('mark_contract_ready')}
                                        </Button>
                                        <p className="text-[10px] text-slate-400 text-center">
                                            {t('mark_contract_ready_hint')}
                                        </p>
                                    </>
                                )}
                                {selectedDeal.status === 'lead' && (
                                    <Button
                                        disabled
                                        className="w-full gap-2"
                                        title={t('move_deal_to_qualified_hint')}
                                    >
                                        <FileCheck2 className="h-4 w-4" />
                                        {t('mark_contract_ready_disabled')}
                                    </Button>
                                )}
                                {(selectedDeal.status === 'negotiation' || selectedDeal.status === 'won') && (
                                    <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 flex items-start gap-2">
                                        <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs font-semibold text-emerald-800">
                                                {t('contract_terms_confirmed')}
                                                {selectedDeal.finalConfirmedAt && (
                                                    <span className="font-normal text-emerald-700">
                                                        {' '}· {new Date(selectedDeal.finalConfirmedAt).toLocaleDateString()}
                                                    </span>
                                                )}
                                            </p>
                                            <p className="text-[11px] text-emerald-700 mt-0.5">
                                                {t('rank_status_explain', { rank: selectedDeal.status === 'won' ? 'S' : 'A' })}
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
                                onConfirmed={() => setSendEstimateOpen(true)}
                            />
                        )}

                        {selectedDeal && (
                            <SendEstimateDialog
                                open={sendEstimateOpen}
                                onOpenChange={setSendEstimateOpen}
                                deal={selectedDeal}
                                versionId={versionsQuery.data?.[0]?.id ?? null}
                            />
                        )}

                        {selectedDealId && (
                            <SuggestChangesFromNotesDialog
                                open={suggestFromNotesOpen}
                                onOpenChange={setSuggestFromNotesOpen}
                                dealId={selectedDealId}
                                currentResources={resources}
                                currentOverheads={overheads}
                                currentRoles={selectedDeal?.ghostRoles ?? []}
                                currency={currency}
                                onApply={async ({ resources: nextResources, overheads: nextOverheads, roles: nextRoles, contextNotes }) => {
                                    // 1. Persist applied changes to the deal so the auto-saved
                                    //    state matches what the new version snapshot will hold.
                                    //    Cancels the pending debounced auto-save (if any) since
                                    //    we're writing the same fields right now. Ghost roles ride
                                    //    along on the same deal update — they live on the deal, not
                                    //    in the estimation-version snapshot.
                                    if (autoSaveTimerRef.current) {
                                        clearTimeout(autoSaveTimerRef.current);
                                        autoSaveTimerRef.current = null;
                                    }
                                    await updateDeal.mutateAsync({
                                        id: selectedDealId,
                                        updates: {
                                            estimationResources: nextResources,
                                            projectOverheads: nextOverheads,
                                            ghostRoles: nextRoles,
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
                                    toast.success(t('applied_changes_saved', { version: nextVer }));
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
                                            <DialogTitle>{t('replace_current_estimate')}</DialogTitle>
                                            <DialogDescription className="mt-1.5">
                                                {t('replace_estimate_explain', {
                                                    rowCount: resources.length,
                                                    withOverheads: overheads.length > 0 ? t('and_n_overheads', { count: overheads.length }) : '',
                                                })}
                                            </DialogDescription>
                                        </div>
                                    </div>
                                </DialogHeader>
                                <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                                    {t('tip_save_version_first')}
                                </div>
                                <DialogFooter className="gap-2">
                                    <Button
                                        variant="outline"
                                        onClick={() => setRegenerateConfirmOpen(false)}
                                        disabled={isGeneratingAi}
                                    >
                                        {t('keep_current_estimate')}
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
                                        {t('replace_and_regenerate')}
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
