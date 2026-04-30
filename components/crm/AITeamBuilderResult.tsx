'use client'

import type { AITeamBuilderResult } from '@/types/aiTeamBuilder'
import { useBusinessStore } from '@/store/businessStore'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
    CheckCircle2,
    AlertTriangle,
    RefreshCw,
    Save,
    User,
    MessageSquare,
} from 'lucide-react'
import toast from 'react-hot-toast'

interface Props {
    result: AITeamBuilderResult
    dealId: string
    clientBudget: number
    onRegenerate: () => void
}

function fmt(n: number): string {
    return (n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })
}

export function AITeamBuilderResultPanel({
    result,
    dealId,
    clientBudget,
    onRegenerate,
}: Props) {
    function handleAccept() {
        const store = useBusinessStore.getState()

        store.updateDeal(dealId, {
            baseLaborCost: result.baseLaborCost,
            overheadCost: result.overheadCost,
            bufferCost: result.bufferCost,
            totalEstimatedCost: result.totalEstimatedCost,
            estimatedGrossProfit: result.estimatedGrossProfit,
            hardAssignments: result.team.map(m => ({
                engineerId: m.employeeId,
                allocatedHours: m.allocatedHours,
            })),
        })

        result.team.forEach(member => {
            store.assignEngineer(dealId, member.employeeId, member.allocatedHours)
        })

        toast.success('Team & estimate saved to deal!')
    }

    const marginColor =
        result.profitMarginPercent < 0
            ? 'text-red-600'
            : result.profitMarginPercent < 10
                ? 'text-yellow-600'
                : 'text-emerald-600'

    const marginBg =
        result.profitMarginPercent < 0
            ? 'bg-red-50 border-red-200'
            : result.profitMarginPercent < 10
                ? 'bg-yellow-50 border-yellow-200'
                : 'bg-emerald-50 border-emerald-200'

    return (
        <div className="space-y-4 mt-4 animate-in fade-in-0 slide-in-from-bottom-4 duration-500">
            {/* — Recommended Team — */}
            <Card className="border-slate-200 shadow-sm">
                <CardHeader className="pb-3 bg-slate-50/80 border-b border-slate-100 rounded-t-xl">
                    <CardTitle className="text-base flex items-center gap-2">
                        <User className="h-4 w-4 text-indigo-600" />
                        Recommended Team
                    </CardTitle>
                </CardHeader>
                <CardContent className="pt-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {result.team.map(member => (
                            <div
                                key={member.employeeId}
                                className="flex flex-col gap-1.5 p-3 rounded-lg border border-slate-100 bg-white shadow-sm hover:shadow-md transition-shadow"
                            >
                                <div className="flex items-center gap-2">
                                    <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 text-xs font-bold">
                                        {member.name
                                            .split(' ')
                                            .map(w => w[0])
                                            .join('')
                                            .slice(0, 2)}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-sm font-semibold text-slate-800 truncate">
                                            {member.name}
                                        </p>
                                        <p className="text-xs text-slate-500">{member.role}</p>
                                    </div>
                                </div>
                                <div className="flex justify-between text-xs text-slate-500 mt-1 pt-1.5 border-t border-slate-50">
                                    <span>{member.allocatedHours}h allocated</span>
                                    <span className="font-medium text-slate-700">
                                        ${fmt(member.totalCost)}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>

            {/* — P&L Estimate — */}
            <Card className="border-slate-200 shadow-sm">
                <CardHeader className="pb-3 bg-slate-50/80 border-b border-slate-100 rounded-t-xl">
                    <CardTitle className="text-base">P&amp;L Estimate</CardTitle>
                </CardHeader>
                <CardContent className="pt-4 space-y-3">
                    <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                            <span className="text-slate-500">Labor Cost</span>
                            <span className="font-medium text-slate-700">
                                ${fmt(result.baseLaborCost)}
                            </span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-slate-500">Overhead</span>
                            <span className="font-medium text-red-500/80">
                                +${fmt(result.overheadCost)}
                            </span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-slate-500">Risk Buffer</span>
                            <span className="font-medium text-red-500/80">
                                +${fmt(result.bufferCost)}
                            </span>
                        </div>
                    </div>

                    <div className="border-t border-slate-100 pt-3 space-y-2">
                        <div className="flex justify-between font-bold text-slate-800">
                            <span>Total Cost</span>
                            <span>${fmt(result.totalEstimatedCost)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-slate-500">Client Budget</span>
                            <span className="font-medium text-slate-700">
                                ${fmt(clientBudget)}
                            </span>
                        </div>
                    </div>

                    <div
                        className={`flex justify-between items-center p-3 rounded-lg border ${marginBg}`}
                    >
                        <div className="flex items-center gap-2">
                            {result.isFeasible ? (
                                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                            ) : (
                                <AlertTriangle className="h-4 w-4 text-red-600" />
                            )}
                            <span className="font-bold text-slate-800">Gross Profit</span>
                        </div>
                        <div className="flex flex-col items-end">
                            <span className={`font-bold text-lg ${marginColor}`}>
                                ${fmt(result.estimatedGrossProfit)}
                            </span>
                            <span
                                className={`text-xs font-semibold px-2 py-0.5 rounded-full ${marginColor}`}
                            >
                                {(result.profitMarginPercent ?? 0).toFixed(1)}% Margin
                            </span>
                        </div>
                    </div>

                    {!result.isFeasible && (
                        <p className="text-xs text-red-600 font-medium px-1">
                            ⚠️ {result.feasibilityNote}
                        </p>
                    )}
                </CardContent>
            </Card>

            {/* — AI Reasoning — */}
            <Card className="border-slate-200 shadow-sm">
                <CardHeader className="pb-3 bg-slate-50/80 border-b border-slate-100 rounded-t-xl">
                    <CardTitle className="text-base flex items-center gap-2">
                        <MessageSquare className="h-4 w-4 text-purple-600" />
                        AI Reasoning
                    </CardTitle>
                </CardHeader>
                <CardContent className="pt-4">
                    <p className="text-sm text-slate-600 leading-relaxed">
                        {result.aiReasoning}
                    </p>
                </CardContent>
            </Card>

            {/* — Warnings — */}
            {result.warnings.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-1">
                    <p className="text-sm font-semibold text-amber-800 flex items-center gap-1.5">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        Warnings
                    </p>
                    <ul className="text-xs text-amber-700 space-y-0.5 list-disc list-inside">
                        {result.warnings.map((w, i) => (
                            <li key={i}>{w}</li>
                        ))}
                    </ul>
                </div>
            )}

            {/* — Actions — */}
            <div className="flex gap-3 pt-2">
                <Button
                    type="button"
                    onClick={handleAccept}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
                >
                    <Save className="mr-2 h-4 w-4" />
                    Accept &amp; Save to Deal
                </Button>
                <Button
                    type="button"
                    variant="outline"
                    onClick={onRegenerate}
                    className="shadow-sm"
                >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Regenerate
                </Button>
            </div>
        </div>
    )
}
