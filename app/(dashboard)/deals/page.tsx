"use client";

import { useEffect, useState } from "react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { useBusinessStore } from "@/store/businessStore";
import { Deal } from "@/types/business";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

const STAGES = ["inquiry", "proposal", "won", "lost"] as const;

export default function PipelineKanbanPage() {
    const [isMounted, setIsMounted] = useState(false);
    const deals = useBusinessStore((state) => state.deals);
    const updateDealStage = useBusinessStore((state) => state.updateDealStage);

    useEffect(() => {
        setIsMounted(true);
    }, []);

    const onDragEnd = (result: DropResult) => {
        const { destination, source, draggableId } = result;

        if (!destination) return;
        if (destination.droppableId === source.droppableId && destination.index === source.index) return;

        updateDealStage(draggableId, destination.droppableId as Deal["stage"]);
    };

    const getMarginColor = (budget: number, profit: number) => {
        const margin = budget > 0 ? (profit / budget) * 100 : 0;
        if (margin < 0) return "text-red-500 font-bold";
        if (margin < 10) return "text-yellow-500 font-bold";
        return "text-green-500 font-bold";
    };

    const StageColumn = ({ stage, title }: { stage: Deal["stage"]; title: string }) => {
        const columnDeals = deals.filter((d) => d.stage === stage);

        return (
            <div className="flex flex-col w-80 bg-muted/40 rounded-xl p-4 shrink-0">
                <div className="flex justify-between items-center mb-4 px-1">
                    <h2 className="font-semibold text-lg capitalize">{title}</h2>
                    <Badge variant="secondary">{columnDeals.length}</Badge>
                </div>

                <Droppable droppableId={stage}>
                    {(provided, snapshot) => (
                        <div
                            {...provided.droppableProps}
                            ref={provided.innerRef}
                            className={`flex flex-col gap-3 min-h-[500px] transition-colors ${snapshot.isDraggingOver ? "bg-muted/80 rounded-lg" : ""
                                }`}
                        >
                            {columnDeals.map((deal, index) => (
                                <Draggable key={deal.id} draggableId={deal.id} index={index}>
                                    {(provided, snapshot) => (
                                        <div
                                            ref={provided.innerRef}
                                            {...provided.draggableProps}
                                            {...provided.dragHandleProps}
                                            className="group"
                                        >
                                            <Card
                                                className={`shadow-sm transition-all ${snapshot.isDragging ? "shadow-lg ring-2 ring-primary/50" : "hover:shadow-md"
                                                    }`}
                                            >
                                                <CardHeader className="p-4 pb-2">
                                                    <div className="flex justify-between items-start">
                                                        <CardTitle className="text-base leading-tight group-hover:text-primary transition-colors">
                                                            {deal.name}
                                                        </CardTitle>
                                                    </div>
                                                </CardHeader>
                                                <CardContent className="p-4 pt-0 space-y-2 text-sm">
                                                    <div className="flex justify-between mt-2">
                                                        <span className="text-muted-foreground">Budget:</span>
                                                        <span className="font-medium">${deal.clientBudget.toLocaleString()}</span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span className="text-muted-foreground">Est. Cost:</span>
                                                        <span className="font-medium">${deal.totalEstimatedCost.toLocaleString()}</span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span className="text-muted-foreground">Profit:</span>
                                                        <span className={getMarginColor(deal.clientBudget, deal.estimatedGrossProfit)}>
                                                            ${deal.estimatedGrossProfit.toLocaleString()}
                                                        </span>
                                                    </div>

                                                    <div className="flex items-center justify-between pt-2">
                                                        <Badge variant="outline" className="text-xs font-normal">
                                                            {deal.probability}% Win
                                                        </Badge>
                                                        {deal.stage === "won" ? (
                                                            <Badge variant="default" className="bg-blue-600 hover:bg-blue-700">Hard Booked</Badge>
                                                        ) : (
                                                            <Badge variant="secondary" className="bg-purple-100 text-purple-700 hover:bg-purple-200 dark:bg-purple-900/30 dark:text-purple-300">Soft Booked</Badge>
                                                        )}
                                                    </div>
                                                </CardContent>
                                                <CardFooter className="p-4 pt-0 gap-2 flex-col sm:flex-row">
                                                    <Link href={`/deals/edit/${deal.id}`} className="w-full">
                                                        <Button variant="outline" size="sm" className="w-full">
                                                            Edit Deal
                                                        </Button>
                                                    </Link>
                                                    {deal.stage === "won" && (
                                                        <Link href={`/deals/${deal.id}/staffing`} className="w-full">
                                                            <Button variant="default" size="sm" className="w-full bg-blue-600 hover:bg-blue-700">
                                                                Staffing
                                                            </Button>
                                                        </Link>
                                                    )}
                                                </CardFooter>
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
    };

    if (!isMounted) return null;

    return (
        <div className="p-6 h-[calc(100vh-4rem)] flex flex-col">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Pipeline Board</h1>
                    <p className="text-muted-foreground">Drag and drop deals to update capacity soft/hard booking.</p>
                </div>
                <Link href="/deals/new">
                    <Button>
                        <Plus className="mr-2 h-4 w-4" /> New Deal
                    </Button>
                </Link>
            </div>

            <div className="flex-1 overflow-x-auto overflow-y-hidden">
                <div className="flex h-full gap-6 pb-4">
                    <DragDropContext onDragEnd={onDragEnd}>
                        <StageColumn stage="inquiry" title="Inquiry" />
                        <StageColumn stage="proposal" title="Proposal" />
                        <StageColumn stage="won" title="Won - Hard Booked" />
                        <StageColumn stage="lost" title="Lost" />
                    </DragDropContext>
                </div>
            </div>
        </div>
    );
}
