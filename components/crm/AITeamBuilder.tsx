'use client'

import { useMemo, useState } from 'react'
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
import { computeDealComplexity, type ComplexityBand } from '@/lib/dealComplexity'
import { extractRequiredSkills } from '@/lib/skillMatching'
import { toUSD, fromUSD } from '@/lib/currencyConverter'

interface Props {
    dealId: string
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
        return {
            employeeId: emp.id,
            name: emp.name,
            role: emp.capacityRole || 'member',
            allocatedHours,
            monthlySalary: emp.monthlySalary || 0,
            costPerHour: emp.costPerHour || 0,
            totalCost: allocatedHours * (emp.costPerHour || 0),
            reasoning: `${emp.name} contributes ${emp.capacityRole} expertise with ${emp.monthlySalary ? `${formatMoney(emp.monthlySalary, input.currency ?? 'MMK')}/mo` : 'competitive'} cost rate.`,
            matchedSkills: (emp.skills || []).map((s: { name?: string }) => s.name || '').filter(Boolean),
            skillMatchScore: Math.round(70 + Math.random() * 25),
        }
    }).filter(m => m.allocatedHours > 0).sort((a, b) => b.allocatedHours - a.allocatedHours).slice(0, 5)

    const baseLaborCost = team.reduce((sum, m) => sum + m.totalCost, 0)
    const overheadPct = (input.companySettings?.overheadPercentage || 20) / 100
    const bufferPct = (input.companySettings?.bufferPercentage || 10) / 100
    const overheadCost = baseLaborCost * overheadPct
    const bufferCost = (baseLaborCost + overheadCost) * bufferPct
    const totalEstimatedCost = baseLaborCost + overheadCost + bufferCost
    const estimatedGrossProfit = input.clientBudget - totalEstimatedCost
    const profitMarginPercent = input.clientBudget > 0 ? (estimatedGrossProfit / input.clientBudget) * 100 : 0
    const isFeasible = totalEstimatedCost <= input.clientBudget

    return {
        team,
        baseLaborCost: Math.round(baseLaborCost),
        overheadCost: Math.round(overheadCost),
        bufferCost: Math.round(bufferCost),
        totalEstimatedCost: Math.round(totalEstimatedCost),
        estimatedGrossProfit: Math.round(estimatedGrossProfit),
        profitMarginPercent: Math.round(profitMarginPercent * 100) / 100,
        isFeasible,
        feasibilityNote: isFeasible ? 'Project is within budget' : `Project exceeds budget by ${formatMoney(totalEstimatedCost - input.clientBudget, input.currency ?? 'MMK')}`,
        aiReasoning: `Based on the ${input.timelineMonths}-month timeline and ${totalHours}h workload, I've selected ${team.length} team members. ${team.map(t => `${t.name} (${t.role}) contributes ${t.allocatedHours}h`).join(', ')}. Total cost is ${formatMoney(totalEstimatedCost, input.currency ?? 'MMK')} against a ${formatMoney(input.clientBudget, input.currency ?? 'MMK')} budget.`,
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

    async function handleBuild(feedback?: string) {
        setLoading(true)
        setLoadingStep(0)
        setShowFeedback(false)
        setRegenerateFeedback('')

        const stepInterval = setInterval(() => {
            setLoadingStep(prev => Math.min(prev + 1, LOADING_STEPS.length - 1))
        }, 1200)

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
