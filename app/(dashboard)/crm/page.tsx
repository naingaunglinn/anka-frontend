'use client';

import { useState } from 'react';
import { KanbanBoard } from '@/components/crm/KanbanBoard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DollarSign, Target, TrendingUp } from 'lucide-react';

export default function CRMPage() {
    const [pipelineTotal, setPipelineTotal] = useState(0);
    const [weightedTotal, setWeightedTotal] = useState(0);

    return (
        <div className="space-y-6 flex flex-col h-[calc(100vh-8rem)]">
            <div>
                <h2 className="text-3xl font-bold tracking-tight text-slate-900">CRM & Sales Pipeline</h2>
                <p className="text-muted-foreground mt-1">Manage leads, track opportunities, and forecast revenue.</p>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
                <Card className="bg-white border-slate-100 shadow-sm">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Pipeline Value</CardTitle>
                        <DollarSign className="h-4 w-4 text-blue-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            ${(pipelineTotal / 1000).toFixed(1)}k
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                            Sum of all deals in pipeline
                        </p>
                    </CardContent>
                </Card>

                <Card className="bg-white border-slate-100 shadow-sm">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Weighted Revenue</CardTitle>
                        <Target className="h-4 w-4 text-emerald-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            ${(weightedTotal / 1000).toFixed(1)}k
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                            Value × Win Probability
                        </p>
                    </CardContent>
                </Card>

                <Card className="bg-white border-slate-100 shadow-sm">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Forecasted Yield</CardTitle>
                        <TrendingUp className="h-4 w-4 text-indigo-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {pipelineTotal > 0 ? ((weightedTotal / pipelineTotal) * 100).toFixed(1) : 0}%
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                            Average pipeline health
                        </p>
                    </CardContent>
                </Card>
            </div>

            <div className="flex-1 bg-white p-6 rounded-xl shadow-sm border border-slate-100 overflow-hidden">
                <KanbanBoard onMetricsUpdate={(total, weighted) => {
                    setPipelineTotal(total);
                    setWeightedTotal(weighted);
                }} />
            </div>
        </div>
    );
}
