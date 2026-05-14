'use client';

import { useState, useEffect, useMemo } from 'react';
import { useIsClient } from '@/hooks/useIsClient';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MoreVertical, Edit2, Trash2, Users, Trophy, Ban } from 'lucide-react';
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
import toast from 'react-hot-toast';
import {
    STAGE_ORDER,
    STAGE_PROBABILITY,
    STAGE_RANK,
    STAGE_TITLE,
    STAGE_DESCRIPTION,
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
     * owns the toggle UI; this board only renders.
     */
    showDropped?: boolean;
}) {
    const router = useRouter();
    const getDealEstimation = useBusinessStore(state => state.getDealEstimation);
    // winDeal is no longer triggered directly from this view — the only path
    // to S/won is uploading an AI-approved contract document on the deal
    // detail page (see ContractDocumentUploader).
    const { updateDealStage, deleteDeal, loseDeal } = useDealMutations();
    const currency = useTenantCurrency();
    const { allowed: canManageCrm, reason: rbacReason } = usePermission('manage_crm');

    // `@hello-pangea/dnd` requires DOM APIs and can't render server-side.
    // useIsClient replaces the setState-in-effect hydration guard with a
    // useSyncExternalStore-based flag (no setState, no extra render cycle).
    const isMounted = useIsClient();

    // -- Confirm dialog states -------------------------------------------------
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [deletingDealId, setDeletingDealId] = useState<string | null>(null);
    const [dropOpen, setDropOpen] = useState(false);
    const [droppingDeal, setDroppingDeal] = useState<{ id: string; name: string } | null>(null);
    const [dropReason, setDropReason] = useState('');

    // 4-column board (D removed in chg-009 — Dropped is now an orthogonal
    // status flag, not a column). Active deals occupy their stage column;
    // dropped deals overlay as greyed cards when showDropped is on.
    const columns = useMemo(() => {
        const cols: Record<DealStage, ColumnData> = {} as Record<DealStage, ColumnData>;
        STAGE_ORDER.forEach((stage) => {
            cols[stage] = { id: stage, title: STAGE_TITLE[stage], deals: [] };
        });

        deals.forEach(deal => {
            const isDropped = deal.lifecycleStatus === 'dropped' || deal.status === 'lost';
            if (isDropped && !showDropped) return;

            // Place dropped deals in their last-known stage column. Backfill
            // for legacy 'lost' deals (where dropped_at_stage is null) falls
            // back to the stage stored on `status`.
            const stage = isDropped
                ? (deal.droppedAtStage ?? (deal.status === 'lost' ? 'qualified' : deal.status)) as DealStage
                : deal.status as DealStage;
            const effective: DealStage = (cols[stage] ? stage : 'lead');
            cols[effective].deals.push(deal);
        });

        return cols;
    }, [deals, showDropped]);

    useEffect(() => {
        // Pipeline value reflects ACTIVE opportunities only. The Won column
        // is already booked revenue; dropped deals are out of pipeline.
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

    // Stage probability defaults — kept in lib/dealRanks.ts so the
    // backend stage-probability map and the frontend smart-merge logic
    // stay aligned through a single source of truth.
    const stageProbability = STAGE_PROBABILITY;

    // ±5pp tolerance around the source-stage's default counts as "auto-managed",
    // i.e. the user never deliberately diverged. Beyond that, treat the value
    // as a deliberate override and preserve it across stage drags.
    const PROB_TOLERANCE = 5;

    const onDragEnd = (result: DropResult) => {
        if (!result.destination) return;
        const { source, destination, draggableId } = result;

        if (source.droppableId === destination.droppableId) return;

        // RBAC: roles without `manage_crm` (Delivery, HR) can view the board
        // but cannot rearrange stages. Block silently with a toast to explain
        // why the drag bounced back.
        if (!canManageCrm) {
            toast.error(rbacReason || 'You do not have permission to change deal stages.');
            return;
        }

        // Droppable ids are sourced from STAGE_ORDER (see the columns map
        // above), so a runtime droppableId is always a valid DealStage —
        // cast both for type-safe lookups against the Record<DealStage, …>
        // tables. @hello-pangea/dnd types these as plain `string`.
        const sourceStage      = source.droppableId      as DealStage;
        const destinationStage = destination.droppableId as DealStage;

        // Prevent moving from Won (terminal). Reverting a closed deal
        // would orphan the linked Contract/Project.
        if (sourceStage === 'won') {
            return;
        }

        const draggedDeal = columns[sourceStage]?.deals.find((d: Deal) => d.id === draggableId);

        // Block dragging dropped deals back into the active pipeline. They
        // can be re-considered only by creating a new deal.
        if (draggedDeal?.lifecycleStatus === 'dropped') {
            toast.error('Dropped deals cannot be reactivated — create a new deal instead.');
            return;
        }

        // Dragging to Won is only allowed from Negotiation (A) AND only via
        // the contract-document upload + AI-analysis flow. Block manual drags
        // so the contract gate can't be skipped. Open the deal detail page
        // where the uploader lives.
        if (destinationStage === 'won') {
            if (sourceStage === 'negotiation') {
                toast.error('Upload an approved contract document to move this deal to Won.');
                if (draggedDeal) router.push(`/crm/${draggableId}#contract-document`);
            } else {
                toast.error('Deals must pass through Negotiation (A) before they can be Won.');
            }
            return;
        }

        // Smart-merge: only overwrite winProbability if the user hasn't
        // manually diverged from the source stage's default. A deliberate
        // override (e.g. 32% in a "lead" stage with default 10%) survives
        // stage drags so the salesperson's judgment isn't silently clobbered.
        const oldDefault = stageProbability[sourceStage] ?? 50;
        const newDefault = stageProbability[destinationStage] ?? 50;
        const currentProb = draggedDeal?.winProbability ?? oldDefault;
        const isAutoManaged = Math.abs(currentProb - oldDefault) <= PROB_TOLERANCE;
        const newProb = isAutoManaged ? newDefault : currentProb;

        updateDealStage.mutate({
            id: draggableId,
            status: destinationStage,
            probability: newProb,
        });
    };

    const openDeleteDeal = (dealId: string) => {
        setDeletingDealId(dealId);
        setDeleteOpen(true);
    };

    const handleDeleteDeal = () => {
        if (!deletingDealId) return;
        deleteDeal.mutate(deletingDealId);
        setDeleteOpen(false);
        setDeletingDealId(null);
    };

    const openDropDeal = (dealId: string, dealName: string) => {
        setDroppingDeal({ id: dealId, name: dealName });
        setDropReason('');
        setDropOpen(true);
    };

    /**
     * Phase B note: backend's POST /deals/{id}/drop endpoint ships in
     * Phase B-breaking. For now this still hits the legacy `lose` mutation,
     * which sets status='lost' — the migration backfill maps that to
     * lifecycle_status='dropped'. Swap to dropDeal mutation when the
     * dedicated endpoint lands.
     */
    const handleDropDeal = () => {
        if (!droppingDeal || !dropReason.trim()) return;
        loseDeal.mutate({ dealId: droppingDeal.id, lossReason: dropReason.trim() });
        setDropOpen(false);
        setDroppingDeal(null);
        setDropReason('');
    };

    if (!isMounted) return <div className="h-96 w-full animate-pulse bg-slate-100 rounded-lg" />;

    return (
        <DragDropContext onDragEnd={onDragEnd}>
            <div className="flex gap-6 overflow-x-auto pb-4">
                {Object.entries(columns).map(([columnId, column]) => {
                    const stage = columnId as DealStage;
                    const rank = STAGE_RANK[stage];
                    const description = STAGE_DESCRIPTION[stage];
                    return (
                        <div key={columnId} className="flex flex-col min-w-[280px] w-[280px] bg-slate-100 rounded-xl shrink-0">
                            <div className="p-4 bg-slate-200/50 rounded-t-xl border-b border-[#e6e9ee] flex justify-between items-start gap-2">
                                <div className="min-w-0">
                                    <h3 className="font-semibold text-slate-700 flex items-center gap-2">
                                        <span className="inline-flex h-6 min-w-6 px-1.5 items-center justify-center rounded bg-slate-700 text-white text-xs font-bold">
                                            {rank}
                                        </span>
                                        <span className="truncate">{column.title}</span>
                                    </h3>
                                    <p className="text-[10px] text-[#8a8a8a] mt-0.5 uppercase tracking-wide">{description}</p>
                                </div>
                                <Badge variant="secondary" className="bg-white shrink-0">{column.deals.length}</Badge>
                            </div>

                            <Droppable droppableId={columnId}>
                                {(provided, snapshot) => (
                                    <div
                                        {...provided.droppableProps}
                                        ref={provided.innerRef}
                                        className={`p-3 space-y-3 min-h-[120px] transition-all duration-300 ${snapshot.isDraggingOver ? 'bg-[#00a7f4]/5 ring-2 ring-[#00a7f4]/20 rounded-lg' : ''}`}
                                    >
                                        {column.deals.map((deal, index) => {
                                            const estimation = getDealEstimation(deal.id);
                                            const budget = deal.clientBudget || 0;
                                            const grossProfit = deal.estimatedGrossProfit || estimation.expectedProfit || 0;
                                            const estimatedCost = deal.totalEstimatedCost || estimation.totalCost || 0;
                                            const marginColorClass = getMarginColor(budget, grossProfit);

                                            const rolesNeededCount = (deal.ghostRoles || []).reduce((sum, r) => sum + r.quantity, 0);
                                            const hardBookedCount = (deal.hardAssignments || []).length;
                                            const isFullyStaffed = rolesNeededCount > 0 && hardBookedCount >= rolesNeededCount;
                                            const isWon  = deal.status === 'won';
                                            const isDropped = deal.lifecycleStatus === 'dropped' || deal.status === 'lost';
                                            const canDropThisDeal = !isDropped && !isWon;

                                            return (
                                                <Draggable key={deal.id} draggableId={deal.id} index={index} isDragDisabled={isDropped}>
                                                    {(provided, snapshot) => (
                                                        <div
                                                            ref={provided.innerRef}
                                                            {...provided.draggableProps}
                                                            {...provided.dragHandleProps}
                                                            className="select-none"
                                                            style={{
                                                                ...provided.draggableProps.style,
                                                                transition: snapshot.isDropAnimating
                                                                    ? 'transform 0.25s cubic-bezier(0.2, 0, 0, 1)'
                                                                    : 'transform 0.15s cubic-bezier(0.2, 0, 0, 1)',
                                                            }}
                                                        >
                                                            <Card className={`border shadow-sm hover:shadow-md transition-all duration-200 ${isDropped ? 'opacity-60 grayscale cursor-default' : 'cursor-grab active:cursor-grabbing'} ${snapshot.isDragging ? 'rotate-1 scale-[1.02] shadow-lg ring-2 ring-[#00a7f4]/30' : ''}`}>
                                                                <CardContent className="p-4 space-y-3">
                                                                    {/* Header: Name + Menu */}
                                                                    <div className="flex justify-between items-start">
                                                                        <div className="font-semibold text-sm line-clamp-1 hover:text-[#00a7f4] hover:underline cursor-pointer" onClick={() => router.push(`/crm/${deal.id}`)}>{deal.name}</div>
                                                                        <DropdownMenu>
                                                                            <DropdownMenuTrigger asChild>
                                                                                <Button variant="ghost" className="h-6 w-6 p-0 hover:bg-slate-100 shrink-0">
                                                                                    <MoreVertical className="h-4 w-4 text-[#8a8a8a]" />
                                                                                    <span className="sr-only">Open menu</span>
                                                                                </Button>
                                                                            </DropdownMenuTrigger>
                                                                            <DropdownMenuContent align="end" className="w-[180px]">
                                                                                <DropdownMenuItem
                                                                                    onClick={() => router.push(`/crm/edit/${deal.id}`)}
                                                                                    disabled={!canManageCrm}
                                                                                    title={!canManageCrm ? rbacReason : undefined}
                                                                                >
                                                                                    <Edit2 className="mr-2 h-4 w-4" />
                                                                                    Edit Details
                                                                                </DropdownMenuItem>
                                                                                <DropdownMenuItem
                                                                                    onClick={() => router.push(`/crm/${deal.id}/staffing`)}
                                                                                    disabled={!canManageCrm}
                                                                                    title={!canManageCrm ? rbacReason : undefined}
                                                                                >
                                                                                    <Users className="mr-2 h-4 w-4" />
                                                                                    Staffing
                                                                                </DropdownMenuItem>
                                                                                {canDropThisDeal && (
                                                                                    <>
                                                                                        {/* "Win Deal" now requires an approved contract document
                                                                                            (uploaded on the deal detail page) — manual win is
                                                                                            disabled with a tooltip explaining the new flow. */}
                                                                                        <DropdownMenuItem
                                                                                            onClick={() => router.push(`/crm/${deal.id}#contract-document`)}
                                                                                            disabled={!canManageCrm}
                                                                                            title={!canManageCrm
                                                                                                ? rbacReason
                                                                                                : 'Upload an approved contract document to move the deal to Won.'}
                                                                                            className="text-emerald-600 focus:text-emerald-700 focus:bg-emerald-50"
                                                                                        >
                                                                                            <Trophy className="mr-2 h-4 w-4" />
                                                                                            Upload Contract → Win
                                                                                        </DropdownMenuItem>
                                                                                        <DropdownMenuItem
                                                                                            onClick={() => openDropDeal(deal.id, deal.name)}
                                                                                            disabled={loseDeal.isPending || !canManageCrm}
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

                                                                    {/* Est. Cost + Gross Profit (ported from deals/page.tsx) */}
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

                                                                    {/* Budget + Win Probability */}
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

                                                                    {/* Booking-state badge — Won = hard committed,
                                                                        Dropped = no longer booked, otherwise soft-booked. */}
                                                                    <div className="flex justify-end pt-1">
                                                                        {isWon ? (
                                                                            <Badge variant="default" className="bg-[#171717] hover:bg-[#00a7f4] text-[10px]">
                                                                                Hard Booked
                                                                            </Badge>
                                                                        ) : isDropped ? (
                                                                            <Badge variant="secondary" className="bg-slate-300 text-slate-700 hover:bg-slate-300 text-[10px]">
                                                                                Dropped
                                                                            </Badge>
                                                                        ) : (
                                                                            <Badge variant="secondary" className="bg-purple-100 text-purple-700 hover:bg-purple-200 dark:bg-purple-900/30 dark:text-purple-300 text-[10px]">
                                                                                Soft Booked
                                                                            </Badge>
                                                                        )}
                                                                    </div>
                                                                </CardContent>
                                                            </Card>
                                                        </div>
                                                    )}
                                                </Draggable>
                                            );
                                        })}
                                        <div className="transition-all duration-300 ease-out">
                                            {provided.placeholder}
                                        </div>
                                    </div>
                                )}
                            </Droppable>
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
                            disabled={loseDeal.isPending || !dropReason.trim()}
                        >
                            {loseDeal.isPending ? 'Processing...' : 'Drop deal'}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </DragDropContext>
    );
}
