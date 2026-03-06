'use client';

import { useState, useEffect, useMemo } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MoreVertical, Edit2, Trash2, Users } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { useBusinessStore } from '@/store/businessStore';
import { Deal } from '@/types/business';

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

export function KanbanBoard({ onMetricsUpdate }: { onMetricsUpdate: (total: number, weighted: number) => void }) {
    const router = useRouter();
    const deals = useBusinessStore(state => state.deals);
    const updateDealStage = useBusinessStore(state => state.updateDealStage);
    const deleteDeal = useBusinessStore(state => state.deleteDeal);
    const getDealEstimation = useBusinessStore(state => state.getDealEstimation);

    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => {
        setIsMounted(true);
    }, []);

    const columns = useMemo(() => {
        const cols: Record<string, ColumnData> = {
            lead: { id: 'lead', title: 'Lead', deals: [] },
            inquiry: { id: 'inquiry', title: 'Inquiry', deals: [] },
            proposal: { id: 'proposal', title: 'Proposal', deals: [] },
            contract: { id: 'contract', title: 'Contract', deals: [] },
            won: { id: 'won', title: 'Won', deals: [] },
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

        if (source.droppableId !== destination.droppableId) {
            let newProb = 50;
            if (destination.droppableId === 'lead') newProb = 20;
            if (destination.droppableId === 'inquiry') newProb = 50;
            if (destination.droppableId === 'proposal') newProb = 75;
            if (destination.droppableId === 'contract') newProb = 90;
            if (destination.droppableId === 'won') newProb = 100;

            updateDealStage(draggableId, destination.droppableId, newProb);
        }
    };

    const handleDeleteDeal = (dealId: string) => {
        if (!window.confirm('Are you sure you want to delete this deal?')) return;
        deleteDeal(dealId);
    };

    if (!isMounted) return <div className="h-96 w-full animate-pulse bg-slate-100 rounded-lg" />;

    return (
        <DragDropContext onDragEnd={onDragEnd}>
            <div className="flex gap-6 overflow-x-auto pb-4 h-full min-h-[500px]">
                {Object.entries(columns).map(([columnId, column]) => {
                    return (
                        <div key={columnId} className="flex flex-col min-w-[320px] bg-slate-100 rounded-xl max-h-full">
                            <div className="p-4 bg-slate-200/50 rounded-t-xl border-b border-slate-200 flex justify-between items-center">
                                <h3 className="font-semibold text-slate-700">{column.title}</h3>
                                <Badge variant="secondary" className="bg-white">{column.deals.length}</Badge>
                            </div>

                            <Droppable droppableId={columnId}>
                                {(provided, snapshot) => (
                                    <div
                                        {...provided.droppableProps}
                                        ref={provided.innerRef}
                                        className={`flex-1 p-3 overflow-y-auto space-y-3 transition-colors ${snapshot.isDraggingOver ? 'bg-slate-200' : ''}`}
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
                                                                        <div className="font-semibold text-sm line-clamp-1">{deal.name}</div>
                                                                        <DropdownMenu>
                                                                            <DropdownMenuTrigger asChild>
                                                                                <Button variant="ghost" className="h-6 w-6 p-0 hover:bg-slate-100 shrink-0">
                                                                                    <MoreVertical className="h-4 w-4 text-slate-400" />
                                                                                    <span className="sr-only">Open menu</span>
                                                                                </Button>
                                                                            </DropdownMenuTrigger>
                                                                            <DropdownMenuContent align="end" className="w-[160px]">
                                                                                <DropdownMenuItem onClick={() => router.push(`/crm/edit/${deal.id}`)}>
                                                                                    <Edit2 className="mr-2 h-4 w-4" />
                                                                                    Edit Details
                                                                                </DropdownMenuItem>
                                                                                {isWon && (
                                                                                    <DropdownMenuItem onClick={() => router.push(`/crm/${deal.id}/staffing`)}>
                                                                                        <Users className="mr-2 h-4 w-4" />
                                                                                        Staffing
                                                                                    </DropdownMenuItem>
                                                                                )}
                                                                                <DropdownMenuItem onClick={() => handleDeleteDeal(deal.id)} className="text-red-600 focus:text-red-700 focus:bg-red-50">
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
                                                                                        className={`h-full ${(deal.winProbability || 0) >= 75 ? 'bg-emerald-500' : (deal.winProbability || 0) >= 50 ? 'bg-blue-500' : 'bg-slate-400'}`}
                                                                                        style={{ width: `${deal.winProbability || 0}%` }}
                                                                                    />
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    </div>

                                                                    {/* Soft/Hard Booked badge (ported from deals/page.tsx) */}
                                                                    <div className="flex justify-end pt-1">
                                                                        {isWon ? (
                                                                            <Badge variant="default" className="bg-blue-600 hover:bg-blue-700 text-[10px]">
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
        </DragDropContext>
    );
}
