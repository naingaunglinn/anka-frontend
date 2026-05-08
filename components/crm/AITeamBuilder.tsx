'use client'

import { useState } from 'react'
import { useBusinessStore } from '@/store/businessStore'
import { useTenantStore } from '@/store/tenantStore'
import type { AITeamBuilderInput, AITeamBuilderResult } from '@/types/aiTeamBuilder'
import { AITeamBuilderResultPanel } from './AITeamBuilderResult'
import { Button } from '@/components/ui/button'
import { Loader2, Sparkles } from 'lucide-react'
import toast from 'react-hot-toast'

interface Props {
    dealId: string
    clientBudget: number
    timelineMonths: number
    workloadHours: number
    workloadDescription: string
    workloadDocumentText?: string
    onAccept?: (result: AITeamBuilderResult) => void
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

    const employees = useBusinessStore(s => s.employees)
    const engineers = useBusinessStore(s => s.engineers)
    const globalOverheads = useBusinessStore(s => s.globalOverheads)
    const companySettings = useBusinessStore(s => s.companySettings)
    const activeTenantId = useTenantStore(s => s.activeTenantId)

    const canRun =
        props.clientBudget > 0 &&
        props.timelineMonths > 0 &&
        props.workloadHours > 0

    async function handleBuild() {
        setLoading(true)
        setLoadingStep(0)
        setResult(null)

        const stepInterval = setInterval(() => {
            setLoadingStep(prev => Math.min(prev + 1, LOADING_STEPS.length - 1))
        }, 1200)

        const input: AITeamBuilderInput = {
            dealId: props.dealId,
            clientBudget: props.clientBudget,
            timelineMonths: props.timelineMonths,
            workloadHours: props.workloadHours,
            workloadDescription: props.workloadDescription,
            workloadDocumentText: props.workloadDocumentText,
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
                <p className="text-xs text-[#4a4a4a] text-center">
                    Fill in Budget, Timeline, and Workload Hours to enable AI team
                    building.
                </p>
            )}

            {result && (
                <AITeamBuilderResultPanel
                    result={result}
                    dealId={props.dealId}
                    clientBudget={props.clientBudget}
                    onRegenerate={handleBuild}
                    onAccept={props.onAccept}
                />
            )}
        </div>
    )
}
