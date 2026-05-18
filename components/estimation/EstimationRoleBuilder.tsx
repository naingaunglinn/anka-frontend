'use client'

import { useEffect, useImperativeHandle, useMemo, useState, type ReactNode, type RefObject } from 'react'
import { useTranslations } from 'next-intl'
import { useBusinessStore } from '@/store/businessStore'
import { useTenantStore } from '@/store/tenantStore'
import { useTenantCurrency } from '@/hooks/useTenantCurrency'
import { toUSD, fromUSD } from '@/lib/currencyConverter'
import { computeDealComplexity } from '@/lib/dealComplexity'
import type { AITeamBuilderInput, AITeamBuilderResult, AISuggestedRole } from '@/types/aiTeamBuilder'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Loader2, Sparkles, AlertTriangle } from 'lucide-react'
import toast from 'react-hot-toast'
import { formatMoney } from '@/lib/currency'

export type EstimationRoleBuilderHandle = {
    triggerBuild: () => Promise<void>
}

interface Props {
    dealId: string
    dealName?: string
    dealClient?: string
    clientBudget: number
    timelineMonths: number
    workloadHours: number
    workloadDescription: string
    /** Called when the user accepts the AI suggestion. The caller writes the roles to deal.ghostRoles. */
    onAccept: (roles: AISuggestedRole[]) => void | Promise<void>
    /** Rendered to the right of the Build AI Team button — used to host the sibling "Generate with AI" action. */
    extraAction?: ReactNode
    /** Suppress the built-in Build button + the budget/timeline hint. Use when the parent owns the trigger UI. */
    hideBuildButton?: boolean
    /** When set, exposes a triggerBuild() handle so the parent can fire the build from its own button. */
    handleRef?: RefObject<EstimationRoleBuilderHandle | null>
    /** Notified when the build's internal loading flag flips. */
    onLoadingChange?: (loading: boolean) => void
}

const LOADING_STEP_KEYS = [
    'loading_analysing_scope',
    'loading_sizing_role',
    'loading_costing_brackets',
]

export function EstimationRoleBuilder(props: Props) {
    const t = useTranslations()
    const [result, setResult] = useState<AITeamBuilderResult | null>(null)
    const [loading, setLoading] = useState(false)
    const [loadingStep, setLoadingStep] = useState(0)
    const [accepting, setAccepting] = useState(false)

    const engineers       = useBusinessStore(s => s.engineers)
    const employees       = useBusinessStore(s => s.employees)
    const globalOverheads = useBusinessStore(s => s.globalOverheads)
    const companySettings = useBusinessStore(s => s.companySettings)
    const activeTenantId  = useTenantStore(s => s.activeTenantId)
    const currency        = useTenantCurrency()
    const exchangeRates   = useTenantStore(s => s.currentTenant?.exchangeRates)

    const budget = Number(props.clientBudget) || 0
    const months = Number(props.timelineMonths) || 0
    const hours  = Number(props.workloadHours)  || 0
    // Workload hours intentionally NOT in the gate — the AI estimates it
    // from the description, budget, and timeline when the deal hasn't set
    // one yet. See ROLE_SYSTEM_PROMPT's "Workload hours" section.
    const canRun = budget > 0 && months > 0

    const complexity = useMemo(
        () => computeDealComplexity({
            workloadHours: hours,
            timelineMonths: months,
            workloadDescription: props.workloadDescription,
            requiredSkills: [],
        }),
        [hours, months, props.workloadDescription],
    )

    async function handleBuild() {
        setLoading(true)
        setLoadingStep(0)
        const interval = setInterval(() => {
            setLoadingStep(s => Math.min(s + 1, LOADING_STEP_KEYS.length - 1))
        }, 1100)

        // All monetary values must be normalised to USD before the AI call —
        // matches the rest of the AI Team Builder pipeline. We pass an empty
        // employees array because role mode doesn't pick people; the prompt
        // reads `engineers` (salary brackets) only.
        const usdBudget = toUSD(budget, currency, exchangeRates)
        const usdEngineers = engineers.map(e => ({
            ...e,
            monthlySalary: toUSD(e.monthlySalary, currency, exchangeRates),
        }))
        const usdOverheads = globalOverheads.map(o => ({
            ...o,
            monthlyCost: toUSD(o.monthlyCost, currency, exchangeRates),
        }))
        const usdSettings: typeof companySettings = {
            ...companySettings,
            yearlyFixedCost:    toUSD(companySettings.yearlyFixedCost,    currency, exchangeRates),
            fallbackHourlyCost: toUSD(companySettings.fallbackHourlyCost, currency, exchangeRates),
        }

        const input: AITeamBuilderInput = {
            dealId:              props.dealId,
            dealName:            props.dealName,
            dealClient:          props.dealClient,
            outputMode:          'roles',
            clientBudget:        usdBudget,
            timelineMonths:      months,
            workloadHours:       hours,
            workloadDescription: props.workloadDescription,
            complexity,
            // employees is required by the type but unused by the role prompt.
            employees:           employees,
            engineers:           usdEngineers,
            globalOverheads:     usdOverheads,
            companySettings:     usdSettings,
            currency:            'USD',
        }

        try {
            const headers: Record<string, string> = { 'Content-Type': 'application/json' }
            if (activeTenantId) headers['X-Tenant-ID'] = activeTenantId

            const res = await fetch('/api/ai-team-builder', {
                method: 'POST',
                headers,
                body: JSON.stringify(input),
            })
            if (!res.ok) {
                const err = await res.json().catch(() => ({}))
                throw new Error(err.error ?? `AI request failed (${res.status})`)
            }
            const data: AITeamBuilderResult = await res.json()

            // Convert USD back to tenant currency for display.
            const inTenantCurrency: AITeamBuilderResult = {
                ...data,
                baseLaborCost:        fromUSD(data.baseLaborCost,        currency, exchangeRates),
                overheadCost:         fromUSD(data.overheadCost,         currency, exchangeRates),
                bufferCost:           fromUSD(data.bufferCost,           currency, exchangeRates),
                totalEstimatedCost:   fromUSD(data.totalEstimatedCost,   currency, exchangeRates),
                estimatedGrossProfit: fromUSD(data.estimatedGrossProfit, currency, exchangeRates),
                roles: (data.roles ?? []).map(r => ({
                    ...r,
                    minMonthlySalary: fromUSD(r.minMonthlySalary, currency, exchangeRates),
                    maxMonthlySalary: fromUSD(r.maxMonthlySalary, currency, exchangeRates),
                    estimatedCost:    fromUSD(r.estimatedCost,    currency, exchangeRates),
                })),
            }
            setResult(inTenantCurrency)
            toast.success(t('role_mix_ready'))
        } catch (err) {
            console.error('AI role builder failed:', err)
            toast.error(err instanceof Error ? err.message : t('could_not_build_role_mix'))
        } finally {
            clearInterval(interval)
            setLoading(false)
        }
    }

    useImperativeHandle(props.handleRef, () => ({ triggerBuild: handleBuild }))

    useEffect(() => {
        props.onLoadingChange?.(loading)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loading])

    async function handleAccept() {
        if (!result?.roles?.length) return
        setAccepting(true)
        try {
            await props.onAccept(result.roles)
        } finally {
            setAccepting(false)
        }
    }

    return (
        <div className="space-y-4">
            {canRun && (
                <div className="flex items-center gap-2 text-xs text-[#4a4a4a]">
                    <span>{t('project_complexity')}</span>
                    <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-100">
                        {complexity.band} · {complexity.score}/10
                    </Badge>
                </div>
            )}

            {!props.hideBuildButton && (
                <div className="flex flex-col sm:flex-row gap-2">
                    <Button
                        type="button"
                        onClick={handleBuild}
                        disabled={!canRun || loading}
                        className="flex-1 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white shadow-md transition-all duration-200"
                        size="lg"
                    >
                        {loading ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                {t(LOADING_STEP_KEYS[loadingStep])}
                            </>
                        ) : (
                            <>
                                <Sparkles className="mr-2 h-4 w-4" />
                                {t('build_ai_team_estimate')}
                            </>
                        )}
                    </Button>
                    {props.extraAction && (
                        <div className="flex-1">{props.extraAction}</div>
                    )}
                </div>
            )}

            {!props.hideBuildButton && !canRun && (
                <p className="text-xs text-[#4a4a4a] text-center">
                    {t('set_budget_timeline_hint')}
                </p>
            )}

            {result?.roles && result.roles.length > 0 && (
                <div className="space-y-3">
                    {/* AI-estimated total hours — shown when the deal didn't
                        carry a workloadHours value. Lets the user sanity-check
                        the assumption behind the role allocations below. */}
                    {hours === 0 && result.estimatedTotalHours && result.estimatedTotalHours > 0 && (
                        <div className="rounded-md border border-indigo-200 bg-indigo-50/60 px-3 py-2 text-xs text-indigo-900 flex items-center gap-2">
                            <Sparkles className="h-3.5 w-3.5 shrink-0" />
                            <span>
                                {t('ai_estimated_workload', { hours: result.estimatedTotalHours.toLocaleString() })}
                            </span>
                        </div>
                    )}
                    <div className="rounded-md border border-slate-200 overflow-hidden">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-slate-50">
                                    <TableHead>{t('role')}</TableHead>
                                    <TableHead className="text-right">{t('qty')}</TableHead>
                                    <TableHead className="text-right">{t('months_col')}</TableHead>
                                    <TableHead className="text-right">{t('hours_col')}</TableHead>
                                    <TableHead className="text-right">{t('monthly_salary_range')}</TableHead>
                                    <TableHead className="text-right">{t('estimated_cost_col')}</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {result.roles.map((r, i) => (
                                    <TableRow key={`${r.roleType}-${i}`}>
                                        <TableCell>
                                            <div className="font-medium text-[#171717]">{r.label}</div>
                                            <div className="text-[10px] uppercase tracking-wider text-[#8a8a8a]">{r.roleType}</div>
                                        </TableCell>
                                        <TableCell className="text-right">{r.quantity}</TableCell>
                                        <TableCell className="text-right">{r.months}</TableCell>
                                        <TableCell className="text-right">{r.allocatedHours.toLocaleString()}</TableCell>
                                        <TableCell className="text-right tabular-nums">
                                            {formatMoney(r.minMonthlySalary, currency)} – {formatMoney(r.maxMonthlySalary, currency)}
                                        </TableCell>
                                        <TableCell className="text-right tabular-nums font-medium">
                                            {formatMoney(r.estimatedCost, currency)}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>

                    {/* Cost roll-up. Same composition as the scope-table summary
                        so users can sanity-check the AI's math against the
                        company's overhead/buffer percentages. */}
                    <div className="rounded-md bg-slate-50 border border-slate-200 px-4 py-3 text-sm space-y-1">
                        <div className="flex justify-between">
                            <span className="text-[#4a4a4a]">{t('base_labor_cost_label')}</span>
                            <span className="tabular-nums">{formatMoney(result.baseLaborCost, currency)}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-[#4a4a4a]">{t('overhead_with_pct', { pct: companySettings.overheadPercentage })}</span>
                            <span className="tabular-nums">{formatMoney(result.overheadCost, currency)}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-[#4a4a4a]">{t('risk_buffer_with_pct', { pct: companySettings.bufferPercentage })}</span>
                            <span className="tabular-nums">{formatMoney(result.bufferCost, currency)}</span>
                        </div>
                        <div className="flex justify-between border-t border-slate-200 pt-1 mt-1 font-medium">
                            <span>{t('total_estimated_cost')}</span>
                            <span className="tabular-nums">{formatMoney(result.totalEstimatedCost, currency)}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                            <span className="text-[#4a4a4a]">{t('client_budget_label')}</span>
                            <span className="tabular-nums">{formatMoney(budget, currency)}</span>
                        </div>
                        <div className={`flex justify-between text-xs font-medium ${result.isFeasible ? 'text-emerald-700' : 'text-rose-700'}`}>
                            <span>{result.feasibilityNote}</span>
                            <span className="tabular-nums">{t('margin_pct_short', { pct: result.profitMarginPercent.toFixed(1) })}</span>
                        </div>
                    </div>

                    {result.aiReasoning && (
                        <p className="text-xs text-[#4a4a4a] italic leading-snug">{result.aiReasoning}</p>
                    )}

                    {result.warnings && result.warnings.length > 0 && (
                        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 space-y-1">
                            {result.warnings.map((w, i) => (
                                <div key={i} className="flex items-start gap-1.5">
                                    <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                                    <span>{w}</span>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="flex gap-2 pt-1">
                        <Button
                            type="button"
                            onClick={handleAccept}
                            disabled={accepting}
                            className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                        >
                            {accepting ? <Loader2 className="h-4 w-4 animate-spin" /> : t('accept_roles')}
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={handleBuild}
                            disabled={loading}
                        >
                            {t('regenerate')}
                        </Button>
                    </div>
                </div>
            )}
        </div>
    )
}
