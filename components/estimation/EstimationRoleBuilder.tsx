'use client'

import { useEffect, useImperativeHandle, useMemo, useState, type ReactNode, type RefObject } from 'react'
import { useTranslations } from 'next-intl'
import { useQuery } from '@tanstack/react-query'
import { useBusinessStore } from '@/store/businessStore'
import { useTenantStore } from '@/store/tenantStore'
import { useTenantCurrency } from '@/hooks/useTenantCurrency'
import { toUSD, fromUSD } from '@/lib/currencyConverter'
import { computeDealComplexity } from '@/lib/dealComplexity'
import { fetchCapacityRoles } from '@/lib/queries/organization'
import { useRanks } from '@/lib/queries/ranks'
import type { AITeamBuilderInput, AITeamBuilderResult, AISuggestedRole } from '@/types/aiTeamBuilder'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Loader2, Sparkles, AlertTriangle } from 'lucide-react'
import toast from 'react-hot-toast'
import { formatMoney } from '@/lib/currency'
import { applyBillingMarkup } from '@/lib/calculations'

export type EstimationRoleBuilderHandle = {
    triggerBuild: () => Promise<void>
    clearResult: () => void
}

interface Props {
    dealId: string
    dealName?: string
    dealClient?: string
    clientBudget: number
    timelineMonths: number
    workloadHours: number
    workloadDescription: string
    expectedCloseDate?: string
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


    const engineers       = useBusinessStore(s => s.engineers)
    const employees       = useBusinessStore(s => s.employees)
    const departments     = useBusinessStore(s => s.departments)
    const jobRoles        = useBusinessStore(s => s.roles)
    const deals           = useBusinessStore(s => s.deals)
    const globalOverheads = useBusinessStore(s => s.globalOverheads)
    const companySettings = useBusinessStore(s => s.companySettings)
    const activeTenantId  = useTenantStore(s => s.activeTenantId)
    const currency        = useTenantCurrency()
    const exchangeRates   = useTenantStore(s => s.currentTenant?.exchangeRates)

    // Tenant's capacity roles drive the dynamic prompt — without them, the
    // prompt falls back to the seeded frontend/backend/design/qa/pm list.
    const { data: capacityRoles = [] } = useQuery({
        queryKey: ['capacity-roles'],
        queryFn: fetchCapacityRoles,
        staleTime: 5 * 60 * 1000,
    })
    // Tenant's seniority ranks (Junior / Mid / Senior / Lead defaults). The
    // role-mode prompt splits each capacity bucket by rank so the AI can pick
    // a sensible seniority mix instead of treating every backend as identical.
    const { data: ranks = [] } = useRanks()

    // Departments flagged is_delivery_eligible=false (Sales/HR/Finance/etc.)
    // host employees whose salaries would skew the cost picture if included
    // in the AI's bracket data. Filter them out before USD-normalising.
    const deliveryEligibleDeptIds = useMemo(
        () => new Set(
            departments
                .filter(d => d.isDeliveryEligible !== false)
                .map(d => d.id),
        ),
        [departments],
    )
    const deliveryEngineers = useMemo(() => {
        const employeeById = new Map(employees.map(e => [e.id, e] as const))
        const rankById     = new Map(ranks.map(r => [r.id, r] as const))
        return engineers
            .filter(eng => {
                const emp = employeeById.get(eng.id)
                if (!emp || !emp.departmentId) return false
                return deliveryEligibleDeptIds.has(emp.departmentId)
            })
            .map(eng => {
                const emp = employeeById.get(eng.id)
                const rank = emp?.rankId ? rankById.get(emp.rankId) ?? null : null
                return {
                    ...eng,
                    rankCode:  rank?.code  ?? emp?.rankCode ?? null,
                    rankLevel: rank?.level ?? null,
                }
            })
    }, [engineers, employees, deliveryEligibleDeptIds, ranks])

    // Option A — anchor the Roles prompt to the Scope & Labor totals.
    // Aggregates the deal's existing estimation_resources into per-capacity-role
    // hours and feeds them into the prompt as the canonical workload split.
    // job_role → capacity_role mapping uses (1) most-common capacity_role across
    // employees holding that job_role, then (2) keyword match on the job_role
    // title as a fallback. Anything that doesn't resolve goes into "unmapped"
    // for the AI to redistribute proportionally.
    const scopeBreakdown = useMemo(() => {
        const deal = deals.find(d => d.id === props.dealId)
        const resources = deal?.estimationResources ?? []
        if (resources.length === 0) return undefined

        const jobRoleToCapacity = new Map<string, string>()
        for (const role of jobRoles) {
            const empsWithRole = employees.filter(e => e.jobRoleId === role.id && e.capacityRole)
            if (empsWithRole.length > 0) {
                const counts: Record<string, number> = {}
                for (const e of empsWithRole) {
                    const c = e.capacityRole as string
                    counts[c] = (counts[c] ?? 0) + 1
                }
                const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]
                jobRoleToCapacity.set(role.id, top)
                continue
            }
            // Keyword fallback: e.g. "Backend Engineer" → "backend"
            const title = (role.title || '').toLowerCase()
            const match = capacityRoles.find(cr => title.includes(cr.code.toLowerCase()))
            if (match) jobRoleToCapacity.set(role.id, match.code)
        }

        const totals: Record<string, number> = {}
        let unmapped = 0
        for (const res of resources) {
            const cap = jobRoleToCapacity.get(res.roleId)
            const h   = Number(res.hours) || 0
            if (cap) totals[cap] = (totals[cap] ?? 0) + h
            else     unmapped += h
        }

        const rows = Object.entries(totals).map(([roleCode, hours]) => ({ roleCode, hours }))
        if (unmapped > 0) rows.push({ roleCode: 'unmapped', hours: unmapped })
        return rows.length > 0 ? rows : undefined
    }, [deals, props.dealId, jobRoles, employees, capacityRoles])

    const scopeTotalHours = useMemo(
        () => (scopeBreakdown ?? []).reduce((sum, r) => sum + r.hours, 0),
        [scopeBreakdown],
    )

    const budget = Number(props.clientBudget) || 0
    const months = Number(props.timelineMonths) || 0
    // Scope total takes precedence over the prop — keeps the two AI surfaces
    // aligned. Prop is used only when there's no scope to anchor to.
    const hours  = scopeTotalHours > 0 ? scopeTotalHours : (Number(props.workloadHours) || 0)
    // Workload hours intentionally NOT in the gate — the AI estimates it
    // from the description, budget, and timeline when the deal hasn't set
    // one yet. See buildRoleSystemPrompt's "Workload hours" section.
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
        const usdEngineers = deliveryEngineers.map(e => ({
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
            availableRoles:      capacityRoles,
            availableRanks:      ranks,
            scopeBreakdown:      scopeBreakdown,
            scopeTotalHours:     scopeTotalHours > 0 ? scopeTotalHours : undefined,
            globalOverheads:     usdOverheads,
            companySettings:     usdSettings,
            currency:            'USD',
            expectedCloseDate:   props.expectedCloseDate,
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
            const filtered: AITeamBuilderResult = {
                ...inTenantCurrency,
                roles: (inTenantCurrency.roles ?? []).filter(r => (r.allocatedHours ?? 0) > 0),
            }
            setResult(filtered)
            if (filtered.roles && filtered.roles.length > 0) {
                await props.onAccept(filtered.roles)
                toast.success(t('roles_saved_to_deal'))
            } else {
                toast(t('could_not_build_role_mix'))
            }
        } catch (err) {
            console.error('AI role builder failed:', err)
            toast.error(err instanceof Error ? err.message : t('could_not_build_role_mix'))
        } finally {
            clearInterval(interval)
            setLoading(false)
        }
    }

    useImperativeHandle(props.handleRef, () => ({
        triggerBuild: handleBuild,
        clearResult: () => setResult(null),
    }))

    useEffect(() => {
        props.onLoadingChange?.(loading)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loading])

    return (
        <div className="space-y-4">
            {canRun && (
                <div className="flex items-center gap-2 text-xs text-[#4a4a4a]">
                    <span>{t('project_complexity')}</span>
                    <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-100">
                        {complexity.band} · {complexity.score}/10
                    </Badge>
                    {scopeTotalHours > 0 && (
                        <span className="text-emerald-600">{t('roles_anchored_to_scope', { hours: scopeTotalHours })}</span>
                    )}
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
                                        <TableCell className="text-right">{(r.quantity * r.months * (companySettings.defaultMonthlyCapacityHours || 160)).toLocaleString()}</TableCell>
                                        <TableCell className="text-right tabular-nums font-medium">
                                            {formatMoney(r.estimatedCost, currency)}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                    {/* Cost roll-up. New model: labor cost basis (loaded hourly
                        × hours) is the agency's real cost; suggested price applies
                        the BILLING_MARKUP_MULTIPLIER (×2) to labor. Derived
                        margin replaces the legacy overhead%+buffer% lines. */}
                    <div className="rounded-md bg-slate-50 border border-slate-200 px-4 py-3 text-sm space-y-1">
                        <div className="flex justify-between">
                            <span className="text-[#4a4a4a]">Total Estimated Cost</span>
                            <span className="tabular-nums">{formatMoney(result.baseLaborCost, currency)}</span>
                        </div>
                        <div className="flex justify-between border-t border-slate-200 pt-1 mt-1 font-medium">
                            <span>Suggested Price</span>
                            <span className="tabular-nums">{formatMoney(applyBillingMarkup(result.baseLaborCost), currency)}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                            <span className="text-[#4a4a4a]">{t('client_budget_label')}</span>
                            <span className="tabular-nums">{formatMoney(budget, currency)}</span>
                        </div>
                        {budget > 0 && applyBillingMarkup(result.baseLaborCost) > budget && (
                            <div className="flex justify-between text-xs font-medium text-emerald-700 border-t border-slate-200 pt-1 mt-1">
                                <span>Exceed Client Budget</span>
                                <span className="tabular-nums">+{formatMoney(applyBillingMarkup(result.baseLaborCost) - budget, currency)}</span>
                            </div>
                        )}
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
                </div>
            )}
        </div>
    )
}
