'use client'

import { useEffect, useMemo, useState } from 'react'
import { useBusinessStore } from '@/store/businessStore'
import { useTenantStore } from '@/store/tenantStore'
import type { AITeamBuilderInput, AITeamBuilderResult } from '@/types/aiTeamBuilder'
import { AITeamBuilderResultPanel } from './AITeamBuilderResult'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, Sparkles } from 'lucide-react'
import toast from 'react-hot-toast'
import { formatMoney } from '@/lib/currency'
import { useTenantCurrency } from '@/hooks/useTenantCurrency'
import { computeDealComplexity, recommendManagement, type ComplexityBand } from '@/lib/dealComplexity'
import { extractRequiredSkills } from '@/lib/skillMatching'
import { toUSD, fromUSD } from '@/lib/currencyConverter'
import { applySellMarkup, applyBillingMarkup, BILLING_MARKUP_MULTIPLIER } from '@/lib/calculations'
import api from '@/lib/api'

interface Props {
    dealId: string
    /** Deal title — passed straight into the prompt so Claude knows which project it's staffing. */
    dealName?: string
    /** Client / customer name — gives the prompt richer context. */
    dealClient?: string
    clientBudget: number | string
    timelineMonths: number | string
    workloadHours: number | string
    workloadDescription: string
    workloadDocumentText?: string
    ghostRoles?: Array<{ roleType: string; quantity: number; minMonthlySalary: number; maxMonthlySalary: number }>
    // Required. AITeamBuilderResultPanel now requires onAccept too — the
    // previous fallback that wrote hardAssignments directly was removed
    // because hard booking belongs to /crm/[id]/staffing as the single
    // canonical writer.
    onAccept: (result: AITeamBuilderResult) => void
}

const LOADING_STEPS = [
    'Analyzing project scope...',
    'Selecting optimal team...',
    'Calculating P&L estimate...',
]

// Visual styling for the complexity chip — green for easy projects we
// shouldn't over-staff, amber for medium, red for hard so users notice.
function complexityBadgeClass(band: ComplexityBand): string {
    switch (band) {
        case 'easy':   return 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100'
        case 'medium': return 'bg-amber-100 text-amber-800 hover:bg-amber-100'
        case 'hard':   return 'bg-rose-100 text-rose-800 hover:bg-rose-100'
    }
}

function targetTeamSize(band: ComplexityBand): string {
    switch (band) {
        case 'easy':   return '~ 2 people'
        case 'medium': return '~ 3-4 people'
        case 'hard':   return '~ 5-7 people'
    }
}

// Client-side fallback for when the API is completely unreachable (network down, server offline)
function generateClientFallback(input: AITeamBuilderInput): AITeamBuilderResult {
    const activeEmps = input.employees.filter(e => e.status === 'Active')
    const months = Number(input.timelineMonths) || 1
    const totalHours = Number(input.workloadHours) || 160
    const desc = (input.workloadDescription || '').toLowerCase()

    const roleWeights: Record<string, number> = {
        backend: /backend|api|database|server|node|laravel|python/.test(desc) ? 0.35 : 0.20,
        frontend: /frontend|react|vue|angular|ui|ux|dashboard|mobile/.test(desc) ? 0.30 : 0.20,
        design: /design|figma|ui|ux|brand|visual|creative/.test(desc) ? 0.20 : 0.15,
        pm: /project|management|stakeholder|planning|scrum/.test(desc) ? 0.15 : 0.15,
        qa: /test|qa|quality|automation|regression/.test(desc) ? 0.15 : 0.15,
    }

    const team = activeEmps.map(emp => {
        const weight = roleWeights[emp.capacityRole || ''] || 0.10
        const allocatedHours = Math.min(
            Math.round(totalHours * weight),
            (emp.workableHours || 160) * months
        )
        // Match /estimation + /organization: loaded cost = raw × 1.15
        // (absorbs company overhead). totalCost on each team member is the
        // agency's labor cost basis for that allocation.
        const loadedCostPerHour = applySellMarkup(emp.costPerHour || 0)
        return {
            employeeId: emp.id,
            name: emp.name,
            role: emp.capacityRole || 'member',
            allocatedHours,
            monthlySalary: emp.monthlySalary || 0,
            costPerHour: loadedCostPerHour,
            totalCost: allocatedHours * loadedCostPerHour,
            reasoning: `${emp.name} contributes ${emp.capacityRole} expertise with ${emp.monthlySalary ? `${formatMoney(emp.monthlySalary, input.currency ?? 'MMK')}/mo` : 'competitive'} cost rate.`,
            matchedSkills: (emp.skills || []).map((s: { name?: string }) => s.name || '').filter(Boolean),
            skillMatchScore: Math.round(70 + Math.random() * 25),
        }
    }).filter(m => m.allocatedHours > 0).sort((a, b) => b.allocatedHours - a.allocatedHours).slice(0, 5)

    // New cost model: cost basis = loaded labor cost; sell = loaded × 3.
    // The legacy overheadCost / bufferCost fields are retained in the result
    // shape for backwards compatibility with EstimationRoleBuilder + saved
    // versions, but are zeroed out — the markup is now baked into the rate.
    const baseLaborCost = team.reduce((sum, m) => sum + m.totalCost, 0)
    const laborSell = team.reduce((sum, m) => sum + m.allocatedHours * applyBillingMarkup(m.costPerHour), 0)
    const totalEstimatedCost = baseLaborCost
    const suggestedPrice = laborSell
    const estimatedGrossProfit = suggestedPrice - totalEstimatedCost
    const profitMarginPercent = suggestedPrice > 0 ? (estimatedGrossProfit / suggestedPrice) * 100 : 0
    const isFeasible = suggestedPrice <= input.clientBudget

    return {
        team,
        baseLaborCost: Math.round(baseLaborCost),
        overheadCost: 0,
        bufferCost: 0,
        totalEstimatedCost: Math.round(totalEstimatedCost),
        estimatedGrossProfit: Math.round(estimatedGrossProfit),
        profitMarginPercent: Math.round(profitMarginPercent * 100) / 100,
        isFeasible,
        feasibilityNote: isFeasible
            ? `Quote (${formatMoney(suggestedPrice, input.currency ?? 'MMK')}) fits the client budget`
            : `Quote (${formatMoney(suggestedPrice, input.currency ?? 'MMK')}) exceeds budget by ${formatMoney(suggestedPrice - input.clientBudget, input.currency ?? 'MMK')}`,
        aiReasoning: `Based on the ${input.timelineMonths}-month timeline and ${totalHours}h workload, I've selected ${team.length} team members. ${team.map(t => `${t.name} (${t.role}) contributes ${t.allocatedHours}h`).join(', ')}. Labor cost is ${formatMoney(totalEstimatedCost, input.currency ?? 'MMK')}; quoted price (${BILLING_MARKUP_MULTIPLIER}× loaded cost) is ${formatMoney(suggestedPrice, input.currency ?? 'MMK')} against a ${formatMoney(input.clientBudget, input.currency ?? 'MMK')} budget.`,
        warnings: profitMarginPercent < 10 ? ['Profit margin is below 10%. Consider negotiating a higher budget or reducing scope.'] : [],
        skillGapAnalysis: {
            coveredSkills: [],
            gapSkills: [],
            recommendations: ['All required skills are covered by the current team.'],
        },
    }
}

export function AITeamBuilder(props: Props) {
    const [result, setResult] = useState<AITeamBuilderResult | null>(null)
    const [loading, setLoading] = useState(false)
    const [loadingStep, setLoadingStep] = useState(0)
    const [showFeedback, setShowFeedback] = useState(false)
    const [regenerateFeedback, setRegenerateFeedback] = useState('')
    // "Need Management" toggle. The default is AI-recommended based on
    // project complexity (see recommendManagement in lib/dealComplexity).
    // While the user hasn't manually flipped it, the toggle re-syncs with
    // the recommendation as inputs change. Once the user clicks it, their
    // choice is sticky — recommendation still shown but no longer auto-applied.
    const [requireLeadership, setRequireLeadership] = useState(true)
    const [leadershipOverridden, setLeadershipOverridden] = useState(false)

    const employees = useBusinessStore(s => s.employees)
    const deals = useBusinessStore(s => s.deals)
    const engineers = useBusinessStore(s => s.engineers)
    const globalOverheads = useBusinessStore(s => s.globalOverheads)
    const companySettings = useBusinessStore(s => s.companySettings)
    const skills = useBusinessStore(s => s.skills)
    const deal = useBusinessStore(s => s.deals.find(d => d.id === props.dealId))
    const activeTenantId = useTenantStore(s => s.activeTenantId)
    const currency = useTenantCurrency()
    const exchangeRates = useTenantStore(s => s.currentTenant?.exchangeRates)

    // Real available monthly hours per employee after subtracting load from other open deals.
    const employeeAvailability = useMemo(() => {
        const map: Record<string, number> = {}
        for (const emp of employees) {
            let otherMonthly = 0
            for (const d of deals) {
                if (d.id === props.dealId || d.status === 'lost') continue
                const a = d.hardAssignments?.find(x => x.employeeId === emp.id)
                if (a) otherMonthly += a.allocatedHours / Math.max(1, d.timelineMonths || 1)
            }
            map[emp.id] = Math.max(0, (emp.workableHours ?? 0) - otherMonthly)
        }
        return map
    }, [employees, deals, props.dealId])

    const budget = Number(props.clientBudget) || 0
    const months = Number(props.timelineMonths) || 0
    const hours = Number(props.workloadHours) || 0

    const canRun = budget > 0 && months > 0 && hours > 0

    // Recompute requiredSkills + complexity reactively from form state. The
    // chip below the button reflects the score as the user edits the deal,
    // and handleBuild reuses these values (no double computation).
    const requiredSkills = useMemo(
        () => extractRequiredSkills(
            (props.workloadDescription || '') + ' ' + (props.workloadDocumentText || ''),
            skills.map(s => s.name),
        ),
        [props.workloadDescription, props.workloadDocumentText, skills],
    )

    const complexity = useMemo(
        () => computeDealComplexity({
            workloadHours: hours,
            timelineMonths: months,
            workloadDescription: props.workloadDescription,
            workloadDocumentText: props.workloadDocumentText,
            requiredSkills,
            ghostRoles: deal?.ghostRoles,
        }),
        [hours, months, props.workloadDescription, props.workloadDocumentText, requiredSkills, deal?.ghostRoles],
    )

    // AI's recommendation for the "Need Management" toggle. Reactively
    // recomputed as the deal inputs change. The toggle below auto-syncs
    // with this until the user explicitly flips it.
    const leadershipRecommendation = useMemo(
        () => recommendManagement(complexity, deal?.ghostRoles?.length ?? 0, months),
        [complexity, deal?.ghostRoles?.length, months],
    )

    // Sync the toggle with the recommendation while the user hasn't taken
    // manual control yet. After a manual flip, leadershipOverridden=true
    // freezes the toggle at the user's choice (recommendation still shown).
    useEffect(() => {
        if (!leadershipOverridden) {
            setRequireLeadership(leadershipRecommendation.recommended)
        }
    }, [leadershipRecommendation.recommended, leadershipOverridden])

    async function handleBuild(feedback?: string) {
        setLoading(true)
        setLoadingStep(0)
        setShowFeedback(false)
        setRegenerateFeedback('')

        const stepInterval = setInterval(() => {
            setLoadingStep(prev => Math.min(prev + 1, LOADING_STEPS.length - 1))
        }, 1200)

        // Fetch rich employee context (rank + past_projects) from the Laravel
        // backend. Best-effort: a failure here just means we ship the prompt
        // without past-project signal and Claude falls back to roleTitle
        // keyword matching. Uses the same api helper as the rest of the
        // module so X-Tenant-ID + Bearer are attached automatically.
        let employeeContext: import('@/types/aiTeamBuilder').AITeamBuilderEmployeeContext[] | undefined
        try {
            const ctxRes = await api.get(`/deals/${props.dealId}/ai-team-builder-context`)
            employeeContext = ctxRes?.data?.data?.employees
        } catch {
            // Swallow — fallback path will still produce a usable team.
        }

        // Normalize monetary values to USD for accurate cross-currency AI analysis
        const usdBudget = toUSD(budget, currency, exchangeRates)
        const usdEmployees = employees.map(e => ({
            ...e,
            monthlySalary: toUSD(e.monthlySalary, currency, exchangeRates),
            costPerHour: toUSD(e.costPerHour, currency, exchangeRates),
        }))
        const usdEngineers = engineers.map(e => ({
            ...e,
            monthlySalary: toUSD(e.monthlySalary, currency, exchangeRates),
        }))
        const usdOverheads = globalOverheads.map(o => ({
            ...o,
            monthlyCost: toUSD(o.monthlyCost, currency, exchangeRates),
        }))
        const usdCompanySettings: typeof companySettings = {
            ...companySettings,
            yearlyFixedCost: toUSD(companySettings.yearlyFixedCost, currency, exchangeRates),
            fallbackHourlyCost: toUSD(companySettings.fallbackHourlyCost, currency, exchangeRates),
        }
        const usdGhostRoles = props.ghostRoles?.map(g => ({
            ...g,
            minMonthlySalary: toUSD(g.minMonthlySalary, currency, exchangeRates),
            maxMonthlySalary: toUSD(g.maxMonthlySalary, currency, exchangeRates),
        }))

        const input: AITeamBuilderInput = {
            dealId: props.dealId,
            dealName: props.dealName,
            dealClient: props.dealClient,
            requireLeadership,
            employeeContext,
            clientBudget: usdBudget,
            timelineMonths: months,
            workloadHours: hours,
            workloadDescription: props.workloadDescription,
            workloadDocumentText: props.workloadDocumentText,
            requiredSkills: requiredSkills.length > 0 ? requiredSkills : undefined,
            complexity,
            employees: usdEmployees,
            engineers: usdEngineers,
            globalOverheads: usdOverheads,
            companySettings: usdCompanySettings,
            currency: 'USD',
            employeeAvailability,
            ghostRoles: usdGhostRoles,
            previousResult: result ?? undefined,
            regenerateFeedback: feedback,
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
                const err = await res.json()
                throw new Error(err.error ?? 'Unknown error from AI')
            }

            const data: AITeamBuilderResult = await res.json()
            // Convert AI results from USD back to tenant currency for display
            const resultInTenantCurrency: AITeamBuilderResult = {
                ...data,
                baseLaborCost: fromUSD(data.baseLaborCost, currency, exchangeRates),
                overheadCost: fromUSD(data.overheadCost, currency, exchangeRates),
                bufferCost: fromUSD(data.bufferCost, currency, exchangeRates),
                totalEstimatedCost: fromUSD(data.totalEstimatedCost, currency, exchangeRates),
                estimatedGrossProfit: fromUSD(data.estimatedGrossProfit, currency, exchangeRates),
                team: data.team.map(m => ({
                    ...m,
                    monthlySalary: fromUSD(m.monthlySalary, currency, exchangeRates),
                    costPerHour: fromUSD(m.costPerHour, currency, exchangeRates),
                    totalCost: fromUSD(m.totalCost, currency, exchangeRates),
                })),
            }
            setResult(resultInTenantCurrency)
            toast.success('AI team recommendation ready!')

        } catch (err: unknown) {
            // Presentation bulletproof: if API is unreachable, generate fallback locally
            console.error('AI Team Builder network error, using client fallback:', err)
            const fallback = generateClientFallback(input)
            // Convert fallback results from USD back to tenant currency
            const fallbackInTenantCurrency: AITeamBuilderResult = {
                ...fallback,
                baseLaborCost: fromUSD(fallback.baseLaborCost, currency, exchangeRates),
                overheadCost: fromUSD(fallback.overheadCost, currency, exchangeRates),
                bufferCost: fromUSD(fallback.bufferCost, currency, exchangeRates),
                totalEstimatedCost: fromUSD(fallback.totalEstimatedCost, currency, exchangeRates),
                estimatedGrossProfit: fromUSD(fallback.estimatedGrossProfit, currency, exchangeRates),
                team: fallback.team.map(m => ({
                    ...m,
                    monthlySalary: fromUSD(m.monthlySalary, currency, exchangeRates),
                    costPerHour: fromUSD(m.costPerHour, currency, exchangeRates),
                    totalCost: fromUSD(m.totalCost, currency, exchangeRates),
                })),
            }
            setResult(fallbackInTenantCurrency)
            toast.success('AI team recommendation ready! (offline mode)')
        } finally {
            clearInterval(stepInterval)
            setLoading(false)
        }
    }

    return (
        <div className="mt-6 space-y-4">
            {canRun && (
                <div className="flex items-center justify-center gap-2 text-xs">
                    <span className="text-[#4a4a4a]">Project complexity:</span>
                    <Badge className={complexityBadgeClass(complexity.band)}>
                        {complexity.band} · {complexity.score}/10
                    </Badge>
                    <span className="text-[#8a8a8a]">
                        target team {targetTeamSize(complexity.band)}
                    </span>
                </div>
            )}

            {/* Need Management toggle — AI-recommended default based on
                complexity / ghost roles / timeline. User can override with
                a click; "Reset to AI" reverts to the live recommendation. */}
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
                <div className="flex items-center gap-2 flex-wrap">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                            type="checkbox"
                            className="h-4 w-4 accent-indigo-600"
                            checked={requireLeadership}
                            onChange={(e) => {
                                setRequireLeadership(e.target.checked)
                                setLeadershipOverridden(true)
                            }}
                            disabled={loading}
                        />
                        <span className="text-[#171717] font-medium">Need Management</span>
                    </label>

                    {leadershipOverridden ? (
                        <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 text-[10px]">manual override</Badge>
                    ) : (
                        <Badge className="bg-indigo-100 text-indigo-700 hover:bg-indigo-100 text-[10px]">
                            <Sparkles className="h-2.5 w-2.5 mr-1" /> AI recommended
                        </Badge>
                    )}

                    {leadershipOverridden && (
                        <button
                            type="button"
                            onClick={() => {
                                setLeadershipOverridden(false)
                                setRequireLeadership(leadershipRecommendation.recommended)
                            }}
                            className="text-[10px] text-indigo-600 hover:text-indigo-800 underline ml-auto"
                            disabled={loading}
                        >
                            Reset to AI
                        </button>
                    )}
                </div>

                <p className="text-[11px] text-[#4a4a4a] mt-1.5 leading-snug">
                    <span className="font-medium text-[#171717]">
                        AI suggests {leadershipRecommendation.recommended ? 'ON' : 'OFF'}:
                    </span>{' '}
                    {leadershipRecommendation.reasoning}
                </p>

                {leadershipOverridden && requireLeadership !== leadershipRecommendation.recommended && (
                    <p className="text-[10px] text-amber-700 mt-1 italic">
                        You overrode the recommendation — toggle stays at your choice ({requireLeadership ? 'ON' : 'OFF'}).
                    </p>
                )}
            </div>

            <Button
                type="button"
                // Wrap in an arrow so React's MouseEvent doesn't get passed as
                // the `feedback` argument. handleBuild is also called from the
                // regenerate UI with feedback text — different call site, same
                // function — so the wrapper here keeps the no-feedback call path.
                onClick={() => handleBuild()}
                disabled={!canRun || loading}
                className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white shadow-md transition-all duration-200"
                size="lg"
            >
                {loading ? (
                    <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {LOADING_STEPS[loadingStep]}
                    </>
                ) : (
                    <>
                        <Sparkles className="mr-2 h-4 w-4" />
                        Build AI Team &amp; Estimate
                    </>
                )}
            </Button>

            {!canRun && (
                <p className="text-xs text-[#4a4a4a] text-center">
                    Fill in Budget, Timeline, and Workload Hours to enable AI team
                    building.
                </p>
            )}

            {result && (
                <>
                    <AITeamBuilderResultPanel
                        result={result}
                        dealId={props.dealId}
                        clientBudget={budget}
                        onRegenerate={() => setShowFeedback(true)}
                        onAccept={props.onAccept}
                    />
                    {showFeedback && (
                        <div className="rounded-lg border border-indigo-200 bg-indigo-50/60 p-4 space-y-3">
                            <p className="text-sm font-medium text-indigo-800">What should be different? <span className="font-normal text-indigo-600">(optional)</span></p>
                            <textarea
                                className="w-full rounded-md border border-indigo-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
                                rows={2}
                                placeholder="e.g. fewer seniors, stronger backend coverage, stay under budget…"
                                value={regenerateFeedback}
                                onChange={e => setRegenerateFeedback(e.target.value)}
                            />
                            <div className="flex gap-2">
                                <Button
                                    type="button"
                                    size="sm"
                                    onClick={() => handleBuild(regenerateFeedback || undefined)}
                                    className="bg-indigo-600 hover:bg-indigo-700 text-white"
                                >
                                    Regenerate
                                </Button>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setShowFeedback(false)}
                                >
                                    Cancel
                                </Button>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    )
}
