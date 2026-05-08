'use client';

import { useState, useEffect, useMemo } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MoreVertical, Edit2, Trash2, Users, Trophy, XCircle } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useRouter } from 'next/navigation';
import { useBusinessStore } from '@/store/businessStore';
import { Deal } from '@/types/business';
import { useDealMutations } from '@/lib/queries/deals';

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
}: {
    deals: Deal[];
    onMetricsUpdate: (total: number, weighted: number) => void;
}) {
    const router = useRouter();
    const getDealEstimation = useBusinessStore(state => state.getDealEstimation);
    const { updateDealStage, deleteDeal, winDeal, loseDeal } = useDealMutations();

    const [isMounted, setIsMounted] = useState(false);

    // ── Confirm dialog states ─────────────────────────────────────────────────
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [deletingDealId, setDeletingDealId] = useState<string | null>(null);
    const [winOpen, setWinOpen] = useState(false);
    const [winningDeal, setWinningDeal] = useState<{ id: string; name: string } | null>(null);
    const [winReason, setWinReason] = useState('');
    const [lostOpen, setLostOpen] = useState(false);
    const [losingDeal, setLosingDeal] = useState<{ id: string; name: string } | null>(null);
    const [lossReason, setLossReason] = useState('');

    useEffect(() => {
        setIsMounted(true);
    }, []);

    const columns = useMemo(() => {
        const cols: Record<string, ColumnData> = {
            inquiry:     { id: 'inquiry',     title: 'Inquiry',     deals: [] },
            lead:        { id: 'lead',        title: 'Lead',        deals: [] },
            opportunity: { id: 'opportunity', title: 'Opportunity', deals: [] },
            proposal:    { id: 'proposal',    title: 'Proposal',    deals: [] },
            contract:    { id: 'contract',    title: 'Contract',    deals: [] },
            won:         { id: 'won',         title: 'Won',         deals: [] },
        };

        deals.forEach(deal => {
            const status = deal.status || 'lead';
            if (cols[status]) {
                cols[status].deals.push(deal);
            }
        });

        return cols;
    }, [deals]);

    useEffect(() => {
        let totalValue = 0;
        let weightedRevenue = 0;

        Object.values(columns).forEach(col => {
            col.deals.forEach(deal => {
                const budget = deal.clientBudget || deal.estimatedValue || 0;
                const winProb = deal.winProbability || 0;
                totalValue += budget;
                weightedRevenue += budget * (winProb / 100);
            });
        });

        onMetricsUpdate(totalValue, weightedRevenue);
    }, [columns, onMetricsUpdate]);

    const onDragEnd = (result: DropResult) => {
        if (!result.destination) return;
        const { source, destination, draggableId } = result;

        if (source.droppableId === destination.droppableId) return;

        // Prevent moving from terminal statuses (won / lost)
        if (source.droppableId === 'won' || source.droppableId === 'lost') {
            return;
        }

        // Dragging to Won opens the confirmation dialog and triggers win_deal()
        if (destination.droppableId === 'won') {
            const deal = columns[source.droppableId]?.deals.find(d => d.id === draggableId);
            if (deal) {
                openWinDeal(draggableId, deal.name);
            }
            return;
        }

        const stageProbability: Record<string, number> = {
            inquiry:     20,
            lead:        20,
            opportunity: 40,
            proposal:    60,
            contract:    80,
            won:         100,
        };
        const newProb = stageProbability[destination.droppableId] ?? 50;

        updateDealStage.mutate({
            id: draggableId,
            status: destination.droppableId,
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

    const openWinDeal = (dealId: string, dealName: string) => {
        setWinningDeal({ id: dealId, name: dealName });
        setWinReason('');
        setWinOpen(true);
    };

    const handleWinDeal = () => {
        if (!winningDeal) return;
        winDeal.mutate({ dealId: winningDeal.id, winReason: winReason || undefined });
        setWinOpen(false);
        setWinningDeal(null);
        setWinReason('');
    };

    const openLoseDeal = (dealId: string, dealName: string) => {
        setLosingDeal({ id: dealId, name: dealName });
        setLossReason('');
        setLostOpen(true);
    };

    const handleLoseDeal = () => {
        if (!losingDeal || !lossReason.trim()) return;
        loseDeal.mutate({ dealId: losingDeal.id, lossReason: lossReason.trim() });
        setLostOpen(false);
        setLosingDeal(null);
        setLossReason('');
    };

    if (!isMounted) return <div className="h-96 w-full animate-pulse bg-slate-100 rounded-lg" />;

    return (
        <DragDropContext onDragEnd={onDragEnd}>
            <div className="flex gap-6 overflow-x-auto pb-4">
                {Object.entries(columns).map(([columnId, column]) => {
                    return (
                        <div key={columnId} className="flex flex-col min-w-[280px] w-[280px] bg-slate-100 rounded-xl shrink-0">
                            <div className="p-4 bg-slate-200/50 rounded-t-xl border-b border-slate-200 flex justify-between items-center">
                                <h3 className="font-semibold text-slate-700">{column.title}</h3>
                                <Badge variant="secondary" className="bg-white">{column.deals.length}</Badge>
                            </div>

                            <Droppable droppableId={columnId}>
                                {(provided, snapshot) => (
                                    <div
                                        {...provided.droppableProps}
                                        ref={provided.innerRef}
                                        className={`p-3 space-y-3 transition-colors min-h-[120px] ${snapshot.isDraggingOver ? 'bg-slate-200' : ''}`}
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
                                            const isWon = deal.status === 'won';

                                            return (
                                                <Draggable key={deal.id} draggableId={deal.id} index={index}>
                                                    {(provided, snapshot) => (
                                                        <div
                                                            ref={provided.innerRef}
                                                            {...provided.draggableProps}
                                                            {...provided.dragHandleProps}
                                                            className={`select-none ${snapshot.isDragging ? 'opacity-90' : ''}`}
                                                        >
                                                            <Card className="border shadow-sm hover:shadow-md transition-shadow cursor-grab active:cursor-grabbing">
                                                                <CardContent className="p-4 space-y-3">
                                                                    {/* Header: Name + Menu */}
                                                                    <div className="flex justify-between items-start">
                                                                        <div className="font-semibold text-sm line-clamp-1 hover:text-[#00a7f4] hover:underline cursor-pointer" onClick={() => router.push(`/crm/${deal.id}`)}>{deal.name}</div>
                                                                        <DropdownMenu>
                                                                            <DropdownMenuTrigger asChild>
                                                                                <Button variant="ghost" className="h-6 w-6 p-0 hover:bg-slate-100 shrink-0">
                                                                                    <MoreVertical className="h-4 w-4 text-slate-400" />
                                                                                    <span className="sr-only">Open menu</span>
                                                                                </Button>
                                                                            </DropdownMenuTrigger>
                                                                            <DropdownMenuContent align="end" className="w-[180px]">
                                                                                <DropdownMenuItem onClick={() => router.push(`/crm/edit/${deal.id}`)}>
                                                                                    <Edit2 className="mr-2 h-4 w-4" />
                                                                                    Edit Details
                                                                                </DropdownMenuItem>
                                                                                <DropdownMenuItem onClick={() => router.push(`/crm/${deal.id}/staffing`)}>
                                                                                    <Users className="mr-2 h-4 w-4" />
                                                                                    AI Staffing
                                                                                </DropdownMenuItem>
                                                                                {!isWon && deal.status !== 'lost' && (
                                                                                    <>
                                                                                        <DropdownMenuItem
                                                                                            onClick={() => openWinDeal(deal.id, deal.name)}
                                                                                            disabled={winDeal.isPending}
                                                                                            className="text-emerald-600 focus:text-emerald-700 focus:bg-emerald-50"
                                                                                        >
                                                                                            <Trophy className="mr-2 h-4 w-4" />
                                                                                            Win Deal
                                                                                        </DropdownMenuItem>
                                                                                        <DropdownMenuItem
                                                                                            onClick={() => openLoseDeal(deal.id, deal.name)}
                                                                                            disabled={loseDeal.isPending}
                                                                                            className="text-orange-600 focus:text-orange-700 focus:bg-orange-50"
                                                                                        >
                                                                                            <XCircle className="mr-2 h-4 w-4" />
                                                                                            Mark as Lost
                                                                                        </DropdownMenuItem>
                                                                                    </>
                                                                                )}
                                                                                <DropdownMenuItem onClick={() => openDeleteDeal(deal.id)} className="text-red-600 focus:text-red-700 focus:bg-red-50">
                                                                                    <Trash2 className="mr-2 h-4 w-4" />
                                                                                    Delete
                                                                                </DropdownMenuItem>
                                                                            </DropdownMenuContent>
                                                                        </DropdownMenu>
                                                                    </div>

                                                                    {/* Client + Staffing badge */}
                                                                    <div className="flex justify-between items-center text-xs text-muted-foreground">
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
                                                                            <span className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wider">Est. Cost</span>
                                                                            <span className="text-sm font-semibold text-slate-600">
                                                                                ${(estimatedCost / 1000).toFixed(0)}k
                                                                            </span>
                                                                        </div>
                                                                        <div className="flex flex-col items-end">
                                                                            <span className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wider">Gross Profit</span>
                                                                            <span className={`text-sm font-bold ${marginColorClass}`}>
                                                                                ${(grossProfit / 1000).toFixed(0)}k
                                                                            </span>
                                                                        </div>
                                                                    </div>

                                                                    {/* Budget + Win Probability */}
                                                                    <div className="grid grid-cols-2 gap-2">
                                                                        <div className="flex flex-col">
                                                                            <span className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wider">Budget</span>
                                                                            <span className="text-sm font-bold text-slate-800">
                                                                                ${(budget / 1000).toFixed(0)}k
                                                                            </span>
                                                                        </div>
                                                                        <div className="flex flex-col items-end">
                                                                            <span className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wider">Win Prob</span>
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

                                                                    {/* Soft/Hard Booked badge (ported from deals/page.tsx) */}
                                                                    <div className="flex justify-end pt-1">
                                                                        {isWon ? (
                                                                            <Badge variant="default" className="bg-[#171717] hover:bg-[#00a7f4] text-[10px]">
                                                                                Hard Booked
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
                                        {provided.placeholder}
                                    </div>
                                )}
                            </Droppable>
                        </div>
                    );
                })}
            </div>

            {/* ── Delete Deal Confirm Dialog ───────────────────────────────────── */}
            <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Delete Deal</DialogTitle>
                    </DialogHeader>
                    <p className="text-sm text-slate-600">
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

            {/* ── Win Deal Confirm Dialog ──────────────────────────────────────── */}
            <Dialog open={winOpen} onOpenChange={(open) => { setWinOpen(open); if (!open) setWinReason(''); }}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Win Deal</DialogTitle>
                    </DialogHeader>
                    <p className="text-sm text-slate-600">
                        Mark <strong>{winningDeal?.name}</strong> as Won?<br />
                        This will atomically create a Contract and Project. This action cannot be undone.
                    </p>
                    <div className="mt-3 space-y-1">
                        <Label htmlFor="win-reason" className="text-sm text-slate-600">
                            Win reason <span className="text-slate-400 font-normal">(optional)</span>
                        </Label>
                        <Input
                            id="win-reason"
                            placeholder="e.g. Best price, strong relationship, unique capability"
                            value={winReason}
                            onChange={(e) => setWinReason(e.target.value)}
                            maxLength={500}
                        />
                    </div>
                    <div className="flex justify-end gap-3 mt-4">
                        <Button variant="outline" onClick={() => setWinOpen(false)}>Cancel</Button>
                        <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handleWinDeal} disabled={winDeal.isPending}>
                            {winDeal.isPending ? 'Processing...' : 'Win Deal'}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* ── Mark as Lost Dialog ──────────────────────────────────────────── */}
            <Dialog open={lostOpen} onOpenChange={(open) => { setLostOpen(open); if (!open) setLossReason(''); }}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Mark as Lost</DialogTitle>
                    </DialogHeader>
                    <p className="text-sm text-slate-600">
                        Mark <strong>{losingDeal?.name}</strong> as Lost?<br />
                        The deal will be removed from the active pipeline.
                    </p>
                    <div className="mt-3 space-y-1">
                        <Label htmlFor="loss-reason" className="text-sm text-slate-600">
                            Loss reason <span className="text-red-500">*</span>
                        </Label>
                        <Textarea
                            id="loss-reason"
                            placeholder="e.g. Lost to competitor on price, project cancelled, budget frozen"
                            value={lossReason}
                            onChange={(e) => setLossReason(e.target.value)}
                            maxLength={500}
                            className="min-h-[80px]"
                        />
                    </div>
                    <div className="flex justify-end gap-3 mt-4">
                        <Button variant="outline" onClick={() => setLostOpen(false)}>Cancel</Button>
                        <Button
                            variant="destructive"
                            onClick={handleLoseDeal}
                            disabled={loseDeal.isPending || !lossReason.trim()}
                        >
                            {loseDeal.isPending ? 'Processing...' : 'Mark as Lost'}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </DragDropContext>
    );
}
