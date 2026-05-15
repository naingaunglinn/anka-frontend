'use client';

import { useState, useEffect, useMemo } from 'react';
import toast from 'react-hot-toast';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MoreVertical, Edit2, Trash2, Trophy, Ban, FileText } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useRouter } from 'next/navigation';
import { useBusinessStore } from '@/store/businessStore';
import { Deal } from '@/types/business';
import { useDealMutations } from '@/lib/queries/deals';
import { formatMoneyShort } from '@/lib/currency';
import { useTenantCurrency } from '@/hooks/useTenantCurrency';
import { usePermission } from '@/hooks/usePermission';
import {
    STAGE_ORDER,
    STAGE_RANK,
    STAGE_TITLE,
    STAGE_DESCRIPTION,
    STAGE_COLORS,
    DROPPED_COLORS,
    type DealStage,
} from '@/lib/dealRanks';

type ColumnData = {
    id: string;
    title: string;
    deals: Deal[];
};

// Ported from deals/page.tsx — uses raw clientBudget + estimatedGrossProfit
function getMarginColor(budget: number, profit: number): string {
    const margin = budget > 0 ? (profit / budget) * 100 : 0;
    if (margin < 0) return 'text-red-500';
    if (margin < 10) return 'text-yellow-500';
    return 'text-green-500';
}

/**
 * Read-only pipeline view, 4 ranks (C/B/A/S).
 *
 * chg-011 Phase B-breaking removed drag-to-rank. Rank changes are now
 * event-driven only:
 *   - Estimation menu flips C → B when calc starts
 *   - ContractDraftService flips B → A on first draft generation
 *   - mark-signed flips A → S via win_deal()
 *
 * The Kanban displays the current state. A dropdown on each card offers
 * Edit, Staffing, Upload Contract → Win (legacy upload path, still
 * functional during Phase A move-out), Drop deal, and Delete.
 */
export function KanbanBoard({
    deals,
    onMetricsUpdate,
    showDropped = false,
}: {
    deals: Deal[];
    onMetricsUpdate: (total: number, weighted: number) => void;
    /**
     * When true, dropped deals overlay greyed cards in their last-known
     * stage column. When false (default), they're hidden. Parent page
     * owns the toggle UI.
     */
    showDropped?: boolean;
}) {
    const router = useRouter();
    const getDealEstimation = useBusinessStore(state => state.getDealEstimation);
    const { deleteDeal, dropDeal } = useDealMutations();
    const currency = useTenantCurrency();
    const { allowed: canManageCrm, reason: rbacReason } = usePermission('manage_crm');

    // -- Confirm dialog states -------------------------------------------------
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [deletingDealId, setDeletingDealId] = useState<string | null>(null);
    const [dropOpen, setDropOpen] = useState(false);
    const [droppingDeal, setDroppingDeal] = useState<{ id: string; name: string } | null>(null);
    const [dropReason, setDropReason] = useState('');

    // 4-column board. Active deals occupy their stage column; dropped deals
    // overlay as greyed cards when showDropped is on.
    const columns = useMemo(() => {
        const cols: Record<DealStage, ColumnData> = {} as Record<DealStage, ColumnData>;
        STAGE_ORDER.forEach((stage) => {
            cols[stage] = { id: stage, title: STAGE_TITLE[stage], deals: [] };
        });

        deals.forEach(deal => {
            const isDropped = deal.lifecycleStatus === 'dropped' || deal.status === 'lost';
            if (isDropped && !showDropped) return;

            // Place dropped deals in their last-known stage column. Legacy
            // 'lost' rows (where dropped_at_stage was null) fall back to
            // qualified (the most common drop point).
            const stage = isDropped
                ? (deal.droppedAtStage ?? (deal.status === 'lost' ? 'qualified' : deal.status)) as DealStage
                : deal.status as DealStage;
            const effective: DealStage = (cols[stage] ? stage : 'lead');
            cols[effective].deals.push(deal);
        });

        return cols;
    }, [deals, showDropped]);

    useEffect(() => {
        // Pipeline value reflects ACTIVE opportunities only. Won is already
        // booked revenue; dropped deals are out of pipeline.
        let totalValue = 0;
        let weightedRevenue = 0;

        Object.entries(columns).forEach(([columnId, col]) => {
            if (columnId === 'won') return;
            col.deals.forEach(deal => {
                if (deal.lifecycleStatus === 'dropped' || deal.status === 'lost') return;
                const budget = deal.clientBudget || deal.estimatedValue || 0;
                const winProb = deal.winProbability || 0;
                totalValue += budget;
                weightedRevenue += budget * (winProb / 100);
            });
        });

        onMetricsUpdate(totalValue, weightedRevenue);
    }, [columns, onMetricsUpdate]);

    const openDeleteDeal = (dealId: string) => {
        setDeletingDealId(dealId);
        setDeleteOpen(true);
    };

    const handleDeleteDeal = async () => {
        if (!deletingDealId) return;
        try {
            await deleteDeal.mutateAsync(deletingDealId);
            toast.success('Deal deleted.');
        } finally {
            setDeleteOpen(false);
            setDeletingDealId(null);
        }
    };

    const openDropDeal = (dealId: string, dealName: string) => {
        setDroppingDeal({ id: dealId, name: dealName });
        setDropReason('');
        setDropOpen(true);
    };

    const handleDropDeal = () => {
        if (!droppingDeal || !dropReason.trim()) return;
        dropDeal.mutate({ dealId: droppingDeal.id, reason: dropReason.trim() });
        setDropOpen(false);
        setDroppingDeal(null);
        setDropReason('');
    };

    return (
        <>
            <div className="flex gap-6 overflow-x-auto pb-4">
                {Object.entries(columns).map(([columnId, column]) => {
                    const stage = columnId as DealStage;
                    const rank = STAGE_RANK[stage];
                    const description = STAGE_DESCRIPTION[stage];
                    const stageColor = STAGE_COLORS[stage];
                    return (
                        <div key={columnId} className="flex flex-col min-w-[280px] w-[280px] bg-slate-100 rounded-xl shrink-0">
                            <div className="p-4 bg-slate-200/50 rounded-t-xl border-b border-[#e6e9ee] flex justify-between items-start gap-2">
                                <div className="min-w-0">
                                    <h3 className="font-semibold text-slate-700 flex items-center gap-2">
                                        <span className={`inline-flex h-6 min-w-6 px-1.5 items-center justify-center rounded text-xs font-bold ${stageColor.bg} ${stageColor.text}`}>
                                            {rank}
                                        </span>
                                        <span className="truncate">{column.title}</span>
                                    </h3>
                                    <p className="text-[10px] text-[#8a8a8a] mt-0.5 uppercase tracking-wide">{description}</p>
                                </div>
                                <Badge variant="secondary" className="bg-white shrink-0">{column.deals.length}</Badge>
                            </div>

                            <div className="p-3 space-y-6 min-h-[120px]">
                                {column.deals.map((deal) => {
                                    const estimation = getDealEstimation(deal.id);
                                    const budget = deal.clientBudget || 0;
                                    const grossProfit = deal.estimatedGrossProfit || estimation.expectedProfit || 0;
                                    const estimatedCost = deal.totalEstimatedCost || estimation.totalCost || 0;
                                    const marginColorClass = getMarginColor(budget, grossProfit);

                                    const rolesNeededCount = (deal.ghostRoles || []).reduce((sum, r) => sum + r.quantity, 0);
                                    const hardBookedCount = (deal.hardAssignments || []).length;
                                    const isFullyStaffed = rolesNeededCount > 0 && hardBookedCount >= rolesNeededCount;
                                    const isWon = deal.status === 'won';
                                    const isDropped = deal.lifecycleStatus === 'dropped' || deal.status === 'lost';
                                    const canDropThisDeal = !isDropped && !isWon;

                                    // Per-rank colours for the card accent + rank chip. Dropped cards
                                    // use a neutral grey palette regardless of last-known stage.
                                    const cardStage = (STAGE_COLORS[deal.status as DealStage] ? deal.status : 'lead') as DealStage;
                                    const cardColor = isDropped ? DROPPED_COLORS : STAGE_COLORS[cardStage];
                                    const cardRank = isDropped ? 'D' : STAGE_RANK[cardStage];

                                    return (
                                        <Card
                                            key={deal.id}
                                            className={`border border-l-4 shadow-sm hover:shadow-md transition-all duration-200 ${cardColor.border} ${
                                                isDropped ? 'opacity-60 grayscale' : ''
                                            }`}
                                        >
                                            <CardContent className="p-4 space-y-3">
                                                {/* Header: Rank + Name + Menu */}
                                                <div className="flex justify-between items-start gap-2">
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <span className={`inline-flex h-5 min-w-5 px-1.5 items-center justify-center rounded text-[10px] font-bold shrink-0 ${cardColor.bg} ${cardColor.text}`}>
                                                            {cardRank}
                                                        </span>
                                                        <div
                                                            className="font-semibold text-sm line-clamp-1 hover:text-[#00a7f4] hover:underline cursor-pointer"
                                                            onClick={() => router.push(`/project-pipeline/${deal.id}`)}
                                                        >
                                                            {deal.name}
                                                        </div>
                                                    </div>
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button variant="ghost" className="h-6 w-6 p-0 hover:bg-slate-100 shrink-0">
                                                                <MoreVertical className="h-4 w-4 text-[#8a8a8a]" />
                                                                <span className="sr-only">Open menu</span>
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end" className="w-[180px]">
                                                            <DropdownMenuItem
                                                                onClick={() => router.push(`/project-pipeline/edit/${deal.id}`)}
                                                                disabled={!canManageCrm}
                                                                title={!canManageCrm ? rbacReason : undefined}
                                                            >
                                                                <Edit2 className="mr-2 h-4 w-4" />
                                                                Edit Details
                                                            </DropdownMenuItem>
                                                            {/* "Staffing" dropdown item removed — staffing belongs
                                                                to ⑥ Task Assign per the manager's spec. The page
                                                                still works at /project-pipeline/[id]/staffing for
                                                                direct URL access until Phase A relocates it. */}
                                                            {canDropThisDeal && (
                                                                <>
                                                                    {deal.status === 'negotiation' && deal.activeContractDraftId && (
                                                                        <DropdownMenuItem
                                                                            onClick={() => router.push(`/project-pipeline/${deal.id}/contract-draft/${deal.activeContractDraftId}`)}
                                                                            disabled={!canManageCrm}
                                                                            title={!canManageCrm ? rbacReason : 'View the active contract draft.'}
                                                                        >
                                                                            <FileText className="mr-2 h-4 w-4" />
                                                                            Open contract draft
                                                                        </DropdownMenuItem>
                                                                    )}
                                                                    {/* Legacy contract-document upload path. Still
                                                                        functional during Phase A move-out; will be
                                                                        retired when Contract Review menu takes the
                                                                        upload code. */}
                                                                    {deal.status === 'negotiation' && deal.hasSentContractDraft && (
                                                                        <DropdownMenuItem
                                                                            onClick={() => router.push(`/project-pipeline/${deal.id}#contract-document`)}
                                                                            disabled={!canManageCrm}
                                                                            title={!canManageCrm
                                                                                ? rbacReason
                                                                                : 'Upload an approved contract document to move the deal to Won.'}
                                                                            className="text-emerald-600 focus:text-emerald-700 focus:bg-emerald-50"
                                                                        >
                                                                            <Trophy className="mr-2 h-4 w-4" />
                                                                            Upload Contract → Win
                                                                        </DropdownMenuItem>
                                                                    )}
                                                                    <DropdownMenuItem
                                                                        onClick={() => openDropDeal(deal.id, deal.name)}
                                                                        disabled={dropDeal.isPending || !canManageCrm}
                                                                        title={!canManageCrm ? rbacReason : undefined}
                                                                        className="text-orange-600 focus:text-orange-700 focus:bg-orange-50"
                                                                    >
                                                                        <Ban className="mr-2 h-4 w-4" />
                                                                        Drop deal
                                                                    </DropdownMenuItem>
                                                                </>
                                                            )}
                                                            <DropdownMenuItem
                                                                onClick={() => openDeleteDeal(deal.id)}
                                                                disabled={!canManageCrm}
                                                                title={!canManageCrm ? rbacReason : undefined}
                                                                className="text-red-600 focus:text-red-700 focus:bg-red-50"
                                                            >
                                                                <Trash2 className="mr-2 h-4 w-4" />
                                                                Delete
                                                            </DropdownMenuItem>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                </div>

                                                {/* Client + Staffing badge */}
                                                <div className="flex justify-between items-center text-xs text-[#4a4a4a]">
                                                    <span>{deal.client || 'Unknown Client'}</span>
                                                    {rolesNeededCount > 0 ? (
                                                        <Badge variant={isFullyStaffed ? 'default' : 'secondary'} className={`h-5 text-[10px] ${isFullyStaffed ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-slate-200 text-slate-700'}`}>
                                                            {hardBookedCount}/{rolesNeededCount} Staffed
                                                        </Badge>
                                                    ) : null}
                                                </div>

                                                <div className="grid grid-cols-2 gap-2 pt-2 border-t">
                                                    <div className="flex flex-col">
                                                        <span className="text-[10px] text-[#4a4a4a] uppercase font-semibold tracking-wider">Est. Cost</span>
                                                        <span className="text-sm font-semibold text-[#4a4a4a]">
                                                            {formatMoneyShort(estimatedCost, currency)}
                                                        </span>
                                                    </div>
                                                    <div className="flex flex-col items-end">
                                                        <span className="text-[10px] text-[#4a4a4a] uppercase font-semibold tracking-wider">Gross Profit</span>
                                                        <span className={`text-sm font-bold ${marginColorClass}`}>
                                                            {formatMoneyShort(grossProfit, currency)}
                                                        </span>
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-2 gap-2">
                                                    <div className="flex flex-col">
                                                        <span className="text-[10px] text-[#4a4a4a] uppercase font-semibold tracking-wider">Budget</span>
                                                        <span className="text-sm font-bold text-slate-800">
                                                            {formatMoneyShort(budget, currency)}
                                                        </span>
                                                    </div>
                                                    <div className="flex flex-col items-end">
                                                        <span className="text-[10px] text-[#4a4a4a] uppercase font-semibold tracking-wider">Win Prob</span>
                                                        <div className="flex flex-col items-end w-full mt-1">
                                                            <span className="text-[10px] font-semibold">{deal.winProbability || 0}%</span>
                                                            <div className="w-full bg-slate-100 h-1 rounded-full overflow-hidden mt-0.5">
                                                                <div
                                                                    className={`h-full ${(deal.winProbability || 0) >= 75 ? 'bg-emerald-500' : (deal.winProbability || 0) >= 50 ? 'bg-[#00a7f4]/50' : 'bg-slate-400'}`}
                                                                    style={{ width: `${deal.winProbability || 0}%` }}
                                                                />
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Contract status badge — A-stage only */}
                                                {deal.status === 'negotiation' && !isDropped && (
                                                    <div className="flex justify-start pt-1">
                                                        {deal.hasSentContractDraft ? (
                                                            <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 text-[10px] border-0">
                                                                Contract Sent
                                                            </Badge>
                                                        ) : deal.activeContractDraftId ? (
                                                            <Badge className="bg-indigo-100 text-indigo-700 hover:bg-indigo-100 text-[10px] border-0">
                                                                Drafting
                                                            </Badge>
                                                        ) : null}
                                                    </div>
                                                )}

                                            </CardContent>
                                        </Card>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* -- Delete Deal Confirm Dialog ------------------------------------- */}
            <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Delete Deal</DialogTitle>
                    </DialogHeader>
                    <p className="text-sm text-[#4a4a4a]">
                        Are you sure you want to delete this deal? This action cannot be undone.
                    </p>
                    <div className="flex justify-end gap-3 mt-4">
                        <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
                        <Button variant="destructive" onClick={handleDeleteDeal} disabled={deleteDeal.isPending}>
                            {deleteDeal.isPending ? 'Deleting...' : 'Delete'}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* -- Drop Deal Dialog ----------------------------------------------- */}
            <Dialog open={dropOpen} onOpenChange={(open) => { setDropOpen(open); if (!open) setDropReason(''); }}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Drop deal</DialogTitle>
                    </DialogHeader>
                    <p className="text-sm text-[#4a4a4a]">
                        Drop <strong>{droppingDeal?.name}</strong> from the pipeline?<br />
                        Dropped deals can&apos;t be reactivated — to reconsider this opportunity, create a new deal.
                    </p>
                    <div className="mt-3 space-y-1">
                        <Label htmlFor="drop-reason" className="text-sm text-[#4a4a4a]">
                            Reason <span className="text-red-500">*</span>
                        </Label>
                        <Textarea
                            id="drop-reason"
                            placeholder="e.g. Lost to competitor on price, project cancelled, budget frozen"
                            value={dropReason}
                            onChange={(e) => setDropReason(e.target.value)}
                            maxLength={500}
                            className="min-h-[80px]"
                        />
                    </div>
                    <div className="flex justify-end gap-3 mt-4">
                        <Button variant="outline" onClick={() => setDropOpen(false)}>Cancel</Button>
                        <Button
                            variant="destructive"
                            onClick={handleDropDeal}
                            disabled={dropDeal.isPending || !dropReason.trim()}
                        >
                            {dropDeal.isPending ? 'Processing...' : 'Drop deal'}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}
