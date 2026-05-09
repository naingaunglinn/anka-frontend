'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Trash2, Calculator, Save, ExternalLink, Clock, History, GitCompare, RotateCcw } from 'lucide-react';
import { useBusinessStore } from '@/store/businessStore';
import { EstimationResource, ProjectOverhead } from '@/types/business';
import {
    useEstimationVersions,
    useEstimationVersionDetail,
    useEstimationVersionMutations,
} from '@/lib/queries/estimationVersions';
import { useDealList } from '@/lib/queries/deals';
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
    onClose,
}: {
    versionId: string
    currentResources: EstimationResource[]
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
                                <div className={`text-right font-medium ${diff > 0 ? 'text-rose-600' : diff < 0 ? 'text-emerald-600' : 'text-slate-700'}`}>
                                    {currH}h {diff !== 0 ? `(${diff > 0 ? '+' : ''}${diff})` : ''}
                                </div>
                            </div>
                        )
                    })}
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
    const currency = useTenantCurrency();
    const symbol = useCurrencySymbol();

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

    // Version queries
    const versionsQuery = useEstimationVersions(selectedDealId || null);
    const { saveVersion, restoreVersion } = useEstimationVersionMutations();
    const versions = versionsQuery.data ?? [];
    const currentVersion = versions[0]; // latest (sorted desc)
    const totalVersions = versions.length;
    const nextVersion = (currentVersion?.versionNumber ?? 0) + 1;

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

    useEffect(() => {
        // Load data if deal selected
        if (selectedDealId) {
            const deal = store.deals.find(d => d.id === selectedDealId);
            if (deal) {
                const existingResources = deal.estimationResources || [];
                if (existingResources.length > 0) {
                    setResources(existingResources);
                } else if (deal.ghostRoles && deal.ghostRoles.length > 0) {
                    // Convert ghost roles to estimation resources for display
                    const roles = store.roles;
                    const ghostToResources: EstimationResource[] = [];
                    for (const gr of deal.ghostRoles) {
                        // Find a matching role from the org roles table
                        const matchingRole = roles.find(r =>
                            r.title.toLowerCase().includes(gr.roleType) ||
                            (gr.roleType === 'frontend' && r.title.toLowerCase().includes('frontend')) ||
                            (gr.roleType === 'backend' && r.title.toLowerCase().includes('backend')) ||
                            (gr.roleType === 'pm' && r.title.toLowerCase().includes('project manager')) ||
                            (gr.roleType === 'qa' && r.title.toLowerCase().includes('qa')) ||
                            (gr.roleType === 'design' && r.title.toLowerCase().includes('design'))
                        );
                        const roleId = matchingRole?.id ?? gr.roleType;
                        const monthlyCapacity = store.companySettings.defaultMonthlyCapacityHours;
                        const hours = (gr.quantity || 1) * ((gr.months || 100) / 100) * monthlyCapacity * (deal.timelineMonths || 1);
                        ghostToResources.push({
                            id: gr.id || crypto.randomUUID(),
                            featureName: `${gr.roleType.charAt(0).toUpperCase() + gr.roleType.slice(1)} Team (×${gr.quantity}, ${gr.months || 100}% alloc)`,
                            roleId,
                            hours: Math.round(hours),
                        });
                    }
                    setResources(ghostToResources);
                } else {
                    setResources([]);
                }
                setOverheads(deal.projectOverheads || []);
                setMargin([deal.targetMargin || 30]);
            }
        } else {
            setResources([]);
            setOverheads([]);
            setMargin([30]);
        }
        setDirty(false);
        setLastSavedAt(null);
    }, [selectedDealId, store.deals, store.roles]);

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

    const handleSave = async () => {
        if (!selectedDealId) return;
        const nextVer = (currentVersion?.versionNumber ?? 0) + 1;
        try {
            await saveVersion.mutateAsync({
                dealId: selectedDealId,
                resources: resources.map(r => ({
                    roleId: r.roleId,
                    featureName: r.featureName,
                    hours: r.hours,
                })),
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
            // Reload deal data
            const deal = store.deals.find(d => d.id === selectedDealId);
            if (deal) {
                setResources(deal.estimationResources || []);
                setOverheads(deal.projectOverheads || []);
                setMargin([deal.targetMargin || 30]);
            }
            setDirty(false);
            versionsQuery.refetch();
            toast.success(`Restored to v${versionNumber}`);
        } catch {
            toast.error('Failed to restore version');
        }
    };

    // Cost-rate strategy:
    //   1. Active employees with this jobRoleId → median(costPerHour). Median
    //      (not first-match) so the result is deterministic regardless of
    //      employee insertion order, and median (not mean) so a single very-
    //      senior or very-junior outlier doesn't skew the typical rate.
    //   2. No matching employees but role exists → role.rate × costToBillRatio
    //      (default 0.40 = "cost is 40% of billable rate" → 60% margin).
    //   3. Nothing → fallbackHourlyCost (default 50 in tenant currency).
    // Both fallbacks are tenant-tunable via /organization → Salary Structure.
    const costRateForRole = (roleId: string): number => {
        const rates = store.employees
            .filter(e => e.jobRoleId === roleId && e.status === 'Active')
            .map(e => e.costPerHour)
            .filter((r): r is number => typeof r === 'number' && Number.isFinite(r) && r > 0);
        if (rates.length > 0) return median(rates);

        const role = store.roles.find(r => r.id === roleId);
        if (role) return role.rate * store.companySettings.costToBillRatio;

        return store.companySettings.fallbackHourlyCost;
    };

    const laborCost = resources.reduce(
        (sum, res) => sum + res.hours * costRateForRole(res.roleId),
        0,
    );

    const totalOverheadCost = overheads.reduce((sum, o) => sum + o.cost, 0);
    const totalCost = laborCost + totalOverheadCost;

    const targetMarginDecimal = margin[0] / 100;
    const suggestedPrice = targetMarginDecimal < 1 ? totalCost / (1 - targetMarginDecimal) : 0;
    const expectedProfit = suggestedPrice - totalCost;

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">

                <Card className="shadow-sm border-slate-100 bg-slate-50">
                    <CardHeader className="pb-4">
                        <CardTitle className="text-sm uppercase tracking-wider text-slate-500">Target Deal</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center gap-3">
                            <Select value={selectedDealId} onValueChange={setSelectedDealId}>
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

                <Card className={`shadow-sm border-slate-100 ${!selectedDealId ? 'opacity-50 pointer-events-none' : ''}`}>
                    <CardHeader className="pb-4 border-b">
                        <div className="flex justify-between items-center">
                            <div>
                                <CardTitle className="text-lg">Project Scope & Labor</CardTitle>
                                <CardDescription>Itemize the project scope to calculate base developer costs.</CardDescription>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="flex items-center gap-2 text-xs text-slate-500">
                                    <Clock className="h-3.5 w-3.5" />
                                    <span className="font-medium text-slate-700">
                                        v{currentVersion?.versionNumber ?? 0}{dirty ? '+' : ''}
                                    </span>
                                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium"
                                        style={{
                                            background: dirty ? '#fef3c7' : '#d1fae5',
                                            color: dirty ? '#92400e' : '#065f46',
                                        }}
                                    >
                                        {dirty ? 'Draft' : 'Saved'}
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
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 gap-1 text-xs"
                                    onClick={() => setCompareWithId(compareWithId ? null : (versions[1]?.id ?? null))}
                                    disabled={versions.length < 2}
                                >
                                    <GitCompare className="h-3 w-3" />
                                    Compare
                                </Button>
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
                                        </div>
                                        {v.notes && (
                                            <p className="text-xs text-slate-500 mt-1">{v.notes}</p>
                                        )}
                                        <p className="text-xs text-slate-400 mt-0.5">{v.createdAt ? new Date(v.createdAt).toLocaleString() : ''}</p>
                                    </div>
                                    <div className="flex items-center gap-2">
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
                                        {versions[1] && idx === 0 && (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="h-7 gap-1 text-xs"
                                                onClick={() => setCompareWithId(versions[1]?.id ?? null)}
                                            >
                                                <GitCompare className="h-3 w-3" /> Compare
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
                            onClose={() => setCompareWithId(null)}
                        />
                    )}
                    <CardContent className="p-0">
                        <Table>
                            <TableHeader className="bg-slate-50">
                                <TableRow>
                                    <TableHead>Feature</TableHead>
                                    <TableHead>Role</TableHead>
                                    <TableHead className="text-right">Rate/hr (Cost)</TableHead>
                                    <TableHead className="text-right">Hours</TableHead>
                                    <TableHead className="text-right">Cost</TableHead>
                                    <TableHead className="w-[50px]"></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {resources.map((res) => {
                                    const role = store.roles.find(r => r.id === res.roleId);
                                    const costRate = costRateForRole(res.roleId);
                                    return (
                                        <TableRow key={res.id}>
                                            <TableCell className="font-medium">{res.featureName}</TableCell>
                                            <TableCell>{role?.title || 'Unknown Role'}</TableCell>
                                            <TableCell className="text-right">{formatMoney(costRate, currency)}</TableCell>
                                            <TableCell className="text-right">{res.hours}</TableCell>
                                            <TableCell className="text-right font-medium">{formatMoney(res.hours * costRate, currency)}</TableCell>
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
                                <span className="text-slate-500">Total Labor Cost</span>
                                <span className="font-medium text-slate-800">{formatMoney(laborCost, currency)}</span>
                            </div>
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-500">Total Project Overhead</span>
                                <span className="font-medium text-rose-500">{formatMoney(totalOverheadCost, currency)}</span>
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
                        </div>

                        <div className="pt-2">
                            <label className="text-xs font-medium text-slate-500 mb-1 block">Version Notes (optional)</label>
                            <Input
                                value={versionNotes}
                                onChange={e => setVersionNotes(e.target.value)}
                                placeholder="What changed in this version?"
                                className="h-8 text-xs bg-white border-slate-200 text-slate-800 placeholder:text-slate-400"
                            />
                        </div>

                        <Button onClick={handleSave} className="w-full bg-blue-600 hover:bg-blue-700 text-white gap-2">
                            <Save className="h-4 w-4" /> Save Estimate v{nextVersion}{dirty ? '+' : ''}
                        </Button>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
