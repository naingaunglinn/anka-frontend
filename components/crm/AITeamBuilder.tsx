'use client'

import { useState } from 'react'
import { useBusinessStore } from '@/store/businessStore'
import { useTenantStore } from '@/store/tenantStore'
import type { AITeamBuilderInput, AITeamBuilderResult } from '@/types/aiTeamBuilder'
import { AITeamBuilderResultPanel } from './AITeamBuilderResult'
import { Button } from '@/components/ui/button'
import { Loader2, Sparkles, ChevronDown, X } from 'lucide-react'
import toast from 'react-hot-toast'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { SkillCoverageMatrix } from './SkillCoverageMatrix'

interface Props {
    dealId: string
    clientBudget: number
    timelineMonths: number
    workloadHours: number
    workloadDescription: string
    workloadDocumentText?: string
    onAccept?: (result: AITeamBuilderResult) => void
    skills?: { id: string; name: string; category: string }[]
}

const LOADING_STEPS = [
    'Analyzing project scope...',
    'Selecting optimal team...',
    'Calculating P&L estimate...',
]

export function AITeamBuilder(props: Props) {
    const [result, setResult] = useState<AITeamBuilderResult | null>(null)
    const [loading, setLoading] = useState(false)
    const [loadingStep, setLoadingStep] = useState(0)
    const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>([])

    const employees = useBusinessStore(s => s.employees)
    const engineers = useBusinessStore(s => s.engineers)
    const globalOverheads = useBusinessStore(s => s.globalOverheads)
    const companySettings = useBusinessStore(s => s.companySettings)
    const activeTenantId = useTenantStore(s => s.activeTenantId)
    const allSkills = useBusinessStore(s => s.skills ?? []) as { id: string; name: string; category: string }[]

    const canRun =
        props.clientBudget > 0 &&
        props.timelineMonths > 0 &&
        props.workloadHours > 0

    function toggleSkill(skillId: string) {
        setSelectedSkillIds(prev =>
            prev.includes(skillId)
                ? prev.filter(id => id !== skillId)
                : [...prev, skillId]
        )
    }

    async function handleBuild() {
        setLoading(true)
        setLoadingStep(0)
        setResult(null)

        const stepInterval = setInterval(() => {
            setLoadingStep(prev => Math.min(prev + 1, LOADING_STEPS.length - 1))
        }, 1200)

        const requiredSkills = selectedSkillIds
            .map(id => allSkills.find(s => s.id === id)?.name)
            .filter(Boolean) as string[]

        const input: AITeamBuilderInput = {
            dealId: props.dealId,
            clientBudget: props.clientBudget,
            timelineMonths: props.timelineMonths,
            workloadHours: props.workloadHours,
            workloadDescription: props.workloadDescription,
            workloadDocumentText: props.workloadDocumentText,
            requiredSkills,
            employees,
            engineers,
            globalOverheads,
            companySettings,
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
            setResult(data)
            toast.success('AI team recommendation ready!')
        } catch (err: unknown) {
            toast.error(
                err instanceof Error ? err.message : 'AI team builder failed'
            )
        } finally {
            clearInterval(stepInterval)
            setLoading(false)
        }
    }

    return (
        <div className="mt-6 space-y-4">
            {allSkills.length > 0 && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
                    <label className="text-xs font-medium text-slate-600">
                        Filter by Required Skills (optional)
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                        {allSkills.map(skill => {
                            const selected = selectedSkillIds.includes(skill.id)
                            return (
                                <Badge
                                    key={skill.id}
                                    variant={selected ? 'default' : 'outline'}
                                    className={`cursor-pointer select-none transition-colors ${
                                        selected
                                            ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                                            : 'hover:bg-slate-100 text-slate-600'
                                    }`}
                                    onClick={() => toggleSkill(skill.id)}
                                >
                                    {skill.name}
                                    {selected && <X className="ml-1 h-3 w-3" />}
                                </Badge>
                            )
                        })}
                    </div>
                    {selectedSkillIds.length > 0 && (
                        <button
                            type="button"
                            onClick={() => setSelectedSkillIds([])}
                            className="text-xs text-indigo-600 hover:text-indigo-700 hover:underline"
                        >
                            Clear skill filters
                        </button>
                    )}
                </div>
            )}

            <Button
                type="button"
                onClick={handleBuild}
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
                <p className="text-xs text-muted-foreground text-center">
                    Fill in Budget, Timeline, and Workload Hours to enable AI team
                    building.
                </p>
            )}

            {result && (
                <>
                    {result.skillGapAnalysis && selectedSkillIds.length > 0 && (
                        <SkillCoverageMatrix
                            requiredSkillNames={selectedSkillIds
                                .map(id => allSkills.find(s => s.id === id)?.name)
                                .filter(Boolean) as string[]}
                            team={result.team}
                        />
                    )}
                    <AITeamBuilderResultPanel
                        result={result}
                        dealId={props.dealId}
                        clientBudget={props.clientBudget}
                        onRegenerate={handleBuild}
                        onAccept={props.onAccept}
                    />
                </>
            )}
        </div>
    )
}
