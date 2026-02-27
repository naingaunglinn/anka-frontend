'use client';

import { useState, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DollarSign, Percent, TrendingUp, MoreVertical, Edit2, Trash2, Plus } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { DealForm } from './DealForm';

export type Deal = {
    id: string;
    name: string;
    client: string;
    estimatedValue: number;
    winProbability: number;
    columnId: string;
};

type ColumnData = {
    id: string;
    title: string;
    deals: Deal[];
};

const initialColumns: Record<string, ColumnData> = {
    lead: {
        id: 'lead',
        title: 'Lead',
        deals: [
            { id: '1', name: 'Cloud Migration', client: 'Acme Corp', estimatedValue: 120000, winProbability: 20, columnId: 'lead' },
            { id: '2', name: 'Security Audit', client: 'Global Tech', estimatedValue: 45000, winProbability: 30, columnId: 'lead' },
        ],
    },
    opportunity: {
        id: 'opportunity',
        title: 'Opportunity',
        deals: [
            { id: '3', name: 'ERP Implementation', client: 'Mega Retail', estimatedValue: 350000, winProbability: 50, columnId: 'opportunity' },
        ],
    },
    proposal: {
        id: 'proposal',
        title: 'Proposal',
        deals: [
            { id: '4', name: 'Mobile App Dev', client: 'Startup Inc', estimatedValue: 85000, winProbability: 75, columnId: 'proposal' },
        ],
    },
    contract: {
        id: 'contract',
        title: 'Contract',
        deals: [
            { id: '5', name: 'IT Support SLA', client: 'Local Bank', estimatedValue: 240000, winProbability: 95, columnId: 'contract' },
        ],
    },
};

export function KanbanBoard({ onMetricsUpdate }: { onMetricsUpdate: (total: number, weighted: number) => void }) {
    const [columns, setColumns] = useState(initialColumns);
    const [isMounted, setIsMounted] = useState(false);
    const [isDealFormOpen, setIsDealFormOpen] = useState(false);
    const [dealToEdit, setDealToEdit] = useState<Deal | null>(null);

    useEffect(() => {
        setIsMounted(true);
    }, []);

    useEffect(() => {
        let totalValue = 0;
        let weightedRevenue = 0;

        Object.values(columns).forEach(col => {
            col.deals.forEach(deal => {
                totalValue += deal.estimatedValue;
                weightedRevenue += deal.estimatedValue * (deal.winProbability / 100);
            });
        });

        onMetricsUpdate(totalValue, weightedRevenue);
    }, [columns, onMetricsUpdate]);

    const onDragEnd = (result: DropResult) => {
        if (!result.destination) return;
        const { source, destination } = result;

        if (source.droppableId !== destination.droppableId) {
            const sourceColumn = columns[source.droppableId];
            const destColumn = columns[destination.droppableId];
            const sourceItems = [...sourceColumn.deals];
            const destItems = [...destColumn.deals];
            const [removed] = sourceItems.splice(source.index, 1);

            // Update probability based on new column (Optional auto-update logic)
            let newProb = removed.winProbability;
            if (destination.droppableId === 'lead') newProb = 20;
            if (destination.droppableId === 'opportunity') newProb = 50;
            if (destination.droppableId === 'proposal') newProb = 75;
            if (destination.droppableId === 'contract') newProb = 100;

            removed.winProbability = newProb;
            removed.columnId = destination.droppableId;
            destItems.splice(destination.index, 0, removed);

            setColumns({
                ...columns,
                [source.droppableId]: {
                    ...sourceColumn,
                    deals: sourceItems,
                },
                [destination.droppableId]: {
                    ...destColumn,
                    deals: destItems,
                },
            });
        } else {
            const column = columns[source.droppableId];
            const copiedItems = [...column.deals];
            const [removed] = copiedItems.splice(source.index, 1);
            copiedItems.splice(destination.index, 0, removed);

            setColumns({
                ...columns,
                [source.droppableId]: {
                    ...column,
                    deals: copiedItems,
                },
            });
        }
    };

    const handleSaveDeal = (dealData: any) => {
        if (dealData.id) {
            handleEditDeal(dealData as Deal);
        } else {
            handleAddDeal(dealData as Omit<Deal, 'id'>);
        }
    };

    const handleAddDeal = (dealData: Omit<Deal, 'id'>) => {
        const newDeal: Deal = {
            ...dealData,
            id: Math.random().toString(36).substr(2, 9),
        };
        const column = columns[newDeal.columnId];
        if (!column) return;
        setColumns({
            ...columns,
            [newDeal.columnId]: {
                ...column,
                deals: [...column.deals, newDeal],
            }
        });
    };

    const handleEditDeal = (updatedDeal: Deal) => {
        let originalColumnId = updatedDeal.columnId;
        Object.values(columns).forEach(col => {
            if (col.deals.some(d => d.id === updatedDeal.id)) {
                originalColumnId = col.id;
            }
        });

        if (originalColumnId === updatedDeal.columnId) {
            const column = columns[originalColumnId];
            setColumns({
                ...columns,
                [originalColumnId]: {
                    ...column,
                    deals: column.deals.map(d => d.id === updatedDeal.id ? updatedDeal : d),
                }
            });
        } else {
            const sourceCol = columns[originalColumnId];
            const destCol = columns[updatedDeal.columnId];
            setColumns({
                ...columns,
                [originalColumnId]: {
                    ...sourceCol,
                    deals: sourceCol.deals.filter(d => d.id !== updatedDeal.id),
                },
                [updatedDeal.columnId]: {
                    ...destCol,
                    deals: [...destCol.deals, updatedDeal],
                }
            });
        }
    };

    const handleDeleteDeal = (dealId: string) => {
        if (!window.confirm("Are you sure you want to delete this deal?")) return;

        let targetColumnId = '';
        Object.values(columns).forEach(col => {
            if (col.deals.some(d => d.id === dealId)) {
                targetColumnId = col.id;
            }
        });

        if (targetColumnId) {
            const column = columns[targetColumnId];
            setColumns({
                ...columns,
                [targetColumnId]: {
                    ...column,
                    deals: column.deals.filter(d => d.id !== dealId),
                }
            });
        }
    };

    if (!isMounted) return <div className="h-96 w-full animate-pulse bg-slate-100 rounded-lg" />;

    return (
        <div className="flex flex-col h-full w-full">
            <div className="flex justify-end mb-4 pr-2">
                <Button onClick={() => { setDealToEdit(null); setIsDealFormOpen(true); }} className="gap-2 shadow-sm">
                    <Plus className="h-4 w-4" /> Add Deal
                </Button>
            </div>
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
                                            {column.deals.map((deal, index) => (
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
                                                                                <DropdownMenuItem onClick={() => { setDealToEdit(deal); setIsDealFormOpen(true); }}>
                                                                                    <Edit2 className="mr-2 h-4 w-4" />
                                                                                    Edit
                                                                                </DropdownMenuItem>
                                                                                <DropdownMenuItem onClick={() => handleDeleteDeal(deal.id)} className="text-red-600 focus:text-red-700 focus:bg-red-50">
                                                                                    <Trash2 className="mr-2 h-4 w-4" />
                                                                                    Delete
                                                                                </DropdownMenuItem>
                                                                            </DropdownMenuContent>
                                                                        </DropdownMenu>
                                                                    </div>
                                                                    <div className="text-xs text-muted-foreground">{deal.client}</div>

                                                                    <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t">
                                                                        <div className="flex flex-col">
                                                                            <span className="text-[10px] text-muted-foreground flex items-center gap-1 uppercase font-semibold tracking-wider">
                                                                                Value
                                                                            </span>
                                                                            <span className="text-sm font-bold text-slate-700">
                                                                                ${(deal.estimatedValue / 1000).toFixed(0)}k
                                                                            </span>
                                                                        </div>
                                                                        <div className="flex flex-col items-end">
                                                                            <span className="text-[10px] text-muted-foreground flex items-center gap-1 uppercase font-semibold tracking-wider">
                                                                                Win Prob
                                                                            </span>
                                                                            <Badge variant={deal.winProbability >= 75 ? 'default' : deal.winProbability >= 50 ? 'secondary' : 'outline'} className="mt-1 h-5 text-[10px]">
                                                                                {deal.winProbability}%
                                                                            </Badge>
                                                                        </div>
                                                                    </div>

                                                                    <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden mt-2">
                                                                        <div
                                                                            className={`h-full ${deal.winProbability >= 75 ? 'bg-emerald-500' : deal.winProbability >= 50 ? 'bg-blue-500' : 'bg-slate-400'}`}
                                                                            style={{ width: `${deal.winProbability}%` }}
                                                                        />
                                                                    </div>
                                                                </CardContent>
                                                            </Card>
                                                        </div>
                                                    )}
                                                </Draggable>
                                            ))}
                                            {provided.placeholder}
                                        </div>
                                    )}
                                </Droppable>
                            </div>
                        );
                    })}
                </div>
            </DragDropContext>
            <DealForm
                isOpen={isDealFormOpen}
                onClose={() => setIsDealFormOpen(false)}
                onSave={handleSaveDeal}
                initialData={dealToEdit}
            />
        </div>
    );
}
