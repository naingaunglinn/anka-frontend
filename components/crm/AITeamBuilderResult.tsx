'use client'

import type { AITeamBuilderResult } from '@/types/aiTeamBuilder'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { formatMoney } from '@/lib/currency'
import { useTenantCurrency } from '@/hooks/useTenantCurrency'
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
    /**
     * Passed by the parent for legacy reasons (deal context). Not consumed
     * here since the fallback path that wrote directly to the deal was
     * removed in favour of the required `onAccept` callback below.
     */
    dealId: string
    clientBudget: number
    onRegenerate: () => void
    /**
     * Required. The caller is responsible for translating the AI result into
     * a deal mutation. The wizard pages map this to ghostRoles + cost fields
     * only — hard booking lives at /crm/[id]/staffing. Previously a fallback
     * path here would write `hardAssignments` directly, which conflicted
     * with that contract.
     */
    onAccept: (result: AITeamBuilderResult) => void
}

export function AITeamBuilderResultPanel({
    result,
    clientBudget,
    onRegenerate,
    onAccept,
}: Props) {
    const t = useTranslations()
    const currency = useTenantCurrency()
    function handleAccept() {
        onAccept(result)
        toast.success(t('ai_team_accepted_toast'))
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
            <Card className="border-[#e6e9ee] shadow-sm">
                <CardHeader className="pb-3 bg-slate-50/80 border-b border-[#e6e9ee] rounded-t-xl">
                    <CardTitle className="text-base flex items-center gap-2">
                        <User className="h-4 w-4 text-indigo-600" />
                        {t('recommended_team')}
                    </CardTitle>
                </CardHeader>
                <CardContent className="pt-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {result.team.map(member => (
                            <div
                                key={member.employeeId}
                                className="flex flex-col gap-1.5 p-3 rounded-lg border border-[#e6e9ee] bg-white shadow-sm hover:shadow-md transition-shadow"
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
                                        <p className="text-xs text-[#8a8a8a]">{member.role}</p>
                                    </div>
                                </div>
                                <div className="flex justify-between text-xs text-[#8a8a8a] mt-1 pt-1.5 border-t border-slate-50">
                                    <span>{t('hours_allocated_short', { hours: member.allocatedHours })}</span>
                                    <span className="font-medium text-slate-700">
                                        {formatMoney(member.totalCost, currency)}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>

            {/* — P&L Estimate — */}
            <Card className="border-[#e6e9ee] shadow-sm">
                <CardHeader className="pb-3 bg-slate-50/80 border-b border-[#e6e9ee] rounded-t-xl">
                    <CardTitle className="text-base">{t('pnl_estimate')}</CardTitle>
                </CardHeader>
                <CardContent className="pt-4 space-y-3">
                    <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                            <span className="text-[#8a8a8a]">{t('labor_cost')}</span>
                            <span className="font-medium text-slate-700">
                                {formatMoney(result.baseLaborCost, currency)}
                            </span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-[#8a8a8a]">{t('overhead')}</span>
                            <span className="font-medium text-red-500/80">
                                +{formatMoney(result.overheadCost, currency)}
                            </span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-[#8a8a8a]">{t('risk_buffer')}</span>
                            <span className="font-medium text-red-500/80">
                                +{formatMoney(result.bufferCost, currency)}
                            </span>
                        </div>
                    </div>

                    <div className="border-t border-[#e6e9ee] pt-3 space-y-2">
                        <div className="flex justify-between font-bold text-slate-800">
                            <span>{t('total_cost')}</span>
                            <span>{formatMoney(result.totalEstimatedCost, currency)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-[#8a8a8a]">{t('client_budget')}</span>
                            <span className="font-medium text-slate-700">
                                {formatMoney(clientBudget, currency)}
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
                            <span className="font-bold text-slate-800">{t('gross_profit')}</span>
                        </div>
                        <div className="flex flex-col items-end">
                            <span className={`font-bold text-lg ${marginColor}`}>
                                {formatMoney(result.estimatedGrossProfit, currency)}
                            </span>
                            <span
                                className={`text-xs font-semibold px-2 py-0.5 rounded-full ${marginColor}`}
                            >
                                {t('margin_pct', { pct: (result.profitMarginPercent ?? 0).toFixed(1) })}
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
            <Card className="border-[#e6e9ee] shadow-sm">
                <CardHeader className="pb-3 bg-slate-50/80 border-b border-[#e6e9ee] rounded-t-xl">
                    <CardTitle className="text-base flex items-center gap-2">
                        <MessageSquare className="h-4 w-4 text-purple-600" />
                        {t('ai_reasoning')}
                    </CardTitle>
                </CardHeader>
                <CardContent className="pt-4">
                    <p className="text-sm text-[#4a4a4a] leading-relaxed">
                        {result.aiReasoning}
                    </p>
                </CardContent>
            </Card>

            {/* — Warnings — */}
            {result.warnings.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-1">
                    <p className="text-sm font-semibold text-amber-800 flex items-center gap-1.5">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        {t('warnings')}
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
                    {t('accept_save_to_deal')}
                </Button>
                <Button
                    type="button"
                    variant="outline"
                    onClick={onRegenerate}
                    className="shadow-sm"
                >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    {t('regenerate')}
                </Button>
            </div>
        </div>
    )
}
