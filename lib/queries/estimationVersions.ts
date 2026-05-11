import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EstimationVersion {
    id: string
    versionNumber: number
    targetMargin: number
    resourceCount: number
    overheadCount: number
    notes?: string
    createdAt?: string
}

export interface EstimationVersionDetail extends EstimationVersion {
    dealId: string
    resources: Array<{
        role_id?: string; roleId?: string
        feature_name?: string; featureName?: string
        hours: number
    }>
    overheads: Array<{ name: string; cost: number }>
}

// ─── Keys ─────────────────────────────────────────────────────────────────────

export const versionKeys = {
    list: (dealId: string) => ['estimation-versions', dealId] as const,
    detail: (id: string) => ['estimation-version', id] as const,
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

function mapVersion(v: Record<string, unknown>): EstimationVersion {
    return {
        id: v.id as string,
        versionNumber: v.version_number as number,
        targetMargin: v.target_margin as number,
        resourceCount: v.resource_count as number,
        overheadCount: v.overhead_count as number,
        notes: v.notes as string | undefined,
        createdAt: v.created_at as string | undefined,
    }
}

export function useEstimationVersions(dealId: string | null) {
    return useQuery({
        queryKey: versionKeys.list(dealId ?? ''),
        queryFn: async () => {
            const { data } = await api.get(`/deals/${dealId}/estimation-versions`)
            return ((data.data ?? []) as Record<string, unknown>[]).map(mapVersion)
        },
        enabled: !!dealId,
    })
}

export function useEstimationVersionDetail(id: string | null) {
    return useQuery({
        queryKey: versionKeys.detail(id ?? ''),
        queryFn: async () => {
            const { data } = await api.get(`/estimation-versions/${id}`)
            const v = data.data as Record<string, unknown>
            return {
                ...mapVersion(v),
                dealId: v.deal_id as string,
                resources: v.resources as EstimationVersionDetail['resources'],
                overheads: v.overheads as EstimationVersionDetail['overheads'],
            } as EstimationVersionDetail
        },
        enabled: !!id,
    })
}

export function useEstimationVersionMutations() {
    const qc = useQueryClient()

    const saveVersion = useMutation({
        mutationFn: async (params: {
            dealId: string
            resources: Array<{ roleId: string; featureName: string; hours: number }>
            overheads: Array<{ name: string; cost: number }>
            targetMargin: number
            notes?: string
        }) => {
            const { data } = await api.post(
                `/deals/${params.dealId}/estimation-versions`,
                {
                    resources: params.resources.map(r => ({
                        roleId: r.roleId,
                        featureName: r.featureName,
                        hours: r.hours,
                    })),
                    overheads: params.overheads,
                    target_margin: params.targetMargin,
                    notes: params.notes,
                }
            )
            return data.data as EstimationVersion
        },
        onSuccess: (_, vars) => {
            qc.invalidateQueries({ queryKey: versionKeys.list(vars.dealId) })
            // The backend recomputes the parent deal's cost fields when a
            // version is saved, so refresh the deal list / store too —
            // otherwise CRM Kanban cards and deal detail show pre-save numbers.
            qc.invalidateQueries({ queryKey: ['deals'] })
        },
    })

    const restoreVersion = useMutation({
        mutationFn: async (versionId: string) => {
            const { data } = await api.post(`/estimation-versions/${versionId}/restore`)
            return data.data
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['deals'] })
            // Backend may create a new audit row (vN+1) when restoring, so
            // refresh the versions list too. Prefix match catches every
            // ['estimation-versions', dealId] entry without needing the id here.
            qc.invalidateQueries({ queryKey: ['estimation-versions'] })
        },
    })

    return { saveVersion, restoreVersion }
}
