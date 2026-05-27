import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { normalizeError } from '@/lib/errorHandler'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EstimationVersion {
    id: string
    versionNumber: number
    targetMargin: number
    resourceCount: number
    overheadCount: number
    notes?: string
    /** Customer meeting minutes / chat snippet that produced this version. */
    contextNotes?: string | null
    /** True when contextNotes is non-empty — surfaced in the version list. */
    hasContextNotes?: boolean
    createdAt?: string
    xlsxPath?: string | null
    xlsxAvailable?: boolean
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
        contextNotes: (v.context_notes as string | null | undefined) ?? null,
        hasContextNotes: Boolean(v.has_context_notes ?? (v.context_notes && String(v.context_notes).trim().length > 0)),
        createdAt: v.created_at as string | undefined,
        xlsxPath: (v.xlsx_path as string | null | undefined) ?? null,
        xlsxAvailable: v.xlsx_available as boolean | undefined,
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
            // Allows underscore-prefixed sentinel rows (AI metadata such as
            // _sheet1_summary, _sheet5_team_stack) to ride along in the same
            // JSONB array. The backend stores resources as-is and the XLSX
            // writer reads them on export.
            resources: Array<
                | { roleId: string; featureName: string; hours: number; employeeId?: string | null }
                | Record<string, unknown>
            >
            overheads: Array<{ name: string; cost: number }>
            targetMargin: number
            notes?: string
            /** Meeting minutes / chat that informed this version. Frozen
             *  with the snapshot — written when the user accepts an AI delta
             *  or types into the optional context-notes field. */
            contextNotes?: string
        }) => {
            const { data } = await api.post(
                `/deals/${params.dealId}/estimation-versions`,
                {
                    resources: params.resources.map(r => {
                        const keys = Object.keys(r)
                        const isSentinel = keys.length > 0 && keys.every(k => k.startsWith('_'))
                        if (isSentinel) return r
                        const row = r as { roleId: string; featureName: string; hours: number; employeeId?: string | null }
                        return {
                            roleId: row.roleId,
                            featureName: row.featureName,
                            hours: row.hours,
                            employeeId: row.employeeId ?? null,
                        }
                    }),
                    overheads: params.overheads,
                    target_margin: params.targetMargin,
                    notes: params.notes,
                    context_notes: params.contextNotes,
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

// ─── AI draft (chg-007/010) ───────────────────────────────────────────────────

export interface AIEstimationDraft {
    sheet1Summary: {
        roughEstimateHours: number
        requirementStudyHours: number
        webDevelopmentHours: number
        environmentSetupHours: number
        totalHoursPerPerson: number
        totalDaysPerPerson: number
        totalMonthsPerPerson: number
    }
    sheet2Features: Array<{
        functionId: string
        name: string
        explanation: string
        category: 'Web' | 'Mobile' | 'Integration' | 'Infrastructure' | string
    }>
    sheet3Manhours: Array<{
        functionId: string
        devHours: number
        role?: string
        suggestedEmployeeId?: string | null
    }>
    sheet4Milestone: {
        startMonth: string
        totalMonths: number
        phaseDurations: Record<string, number>
    }
    sheet5TeamStack: Array<{
        role: string
        count: number
        monthlyAllocation: number[]
    }>
    /**
     * Optional. Project-specific overheads Claude predicted from the client
     * + workload description (travel, licenses, audits, etc.). Populated
     * when the prompt's project_overheads rule triggered; absent for
     * straightforward in-house projects. Costs are in the deal's currency.
     */
    projectOverheads?: Array<{
        name: string
        cost: number
        reason?: string
    }>
    reasoning: string
    confidence: 'high' | 'medium' | 'low' | string
}

function mapAIDraft(raw: Record<string, unknown>): AIEstimationDraft {
    // The backend returns snake_case JSON; mapper isolates the shape change so
    // components only see camelCase. Field-by-field instead of a generic
    // recursive mapper because some nested fields (e.g. phase_durations
    // keys) are user-facing identifiers we don't want to munge.
    const s1 = (raw.sheet1_summary ?? {}) as Record<string, number>
    const s4 = (raw.sheet4_milestone ?? {}) as {
        start_month?: string
        total_months?: number
        phase_durations?: Record<string, number>
    }
    return {
        sheet1Summary: {
            roughEstimateHours: Number(s1.rough_estimate_hours ?? 0),
            requirementStudyHours: Number(s1.requirement_study_hours ?? 0),
            webDevelopmentHours: Number(s1.web_development_hours ?? 0),
            environmentSetupHours: Number(s1.environment_setup_hours ?? 0),
            totalHoursPerPerson: Number(s1.total_hours_per_person ?? 0),
            totalDaysPerPerson: Number(s1.total_days_per_person ?? 0),
            totalMonthsPerPerson: Number(s1.total_months_per_person ?? 0),
        },
        sheet2Features: ((raw.sheet2_features ?? []) as Array<Record<string, unknown>>).map(f => ({
            functionId: String(f.function_id ?? ''),
            name: String(f.name ?? ''),
            explanation: String(f.explanation ?? ''),
            category: String(f.category ?? 'Web'),
        })),
        sheet3Manhours: ((raw.sheet3_manhours ?? []) as Array<Record<string, unknown>>).map(m => ({
            functionId: String(m.function_id ?? ''),
            devHours: Number(m.dev_hours ?? 0),
            role: typeof m.role === 'string' ? m.role : undefined,
            suggestedEmployeeId:
                typeof m.suggested_employee_id === 'string' ? m.suggested_employee_id : null,
        })),
        sheet4Milestone: {
            startMonth: String(s4.start_month ?? ''),
            totalMonths: Number(s4.total_months ?? 0),
            phaseDurations: s4.phase_durations ?? {},
        },
        sheet5TeamStack: ((raw.sheet5_team_stack ?? []) as Array<Record<string, unknown>>).map(t => ({
            role: String(t.role ?? ''),
            count: Number(t.count ?? 0),
            monthlyAllocation: Array.isArray(t.monthly_allocation)
                ? (t.monthly_allocation as number[]).map(Number)
                : [],
        })),
        projectOverheads: Array.isArray(raw.project_overheads)
            ? (raw.project_overheads as Array<Record<string, unknown>>)
                .map(o => ({
                    name: String(o.name ?? '').trim(),
                    cost: Number(o.cost ?? 0),
                    reason: typeof o.reason === 'string' ? o.reason : undefined,
                }))
                .filter(o => o.name.length > 0 && o.cost > 0)
            : undefined,
        reasoning: String(raw.reasoning ?? ''),
        confidence: String(raw.confidence ?? 'medium'),
    }
}

/**
 * Calls POST /deals/{id}/estimation-versions/ai-draft and returns the
 * structured draft. Caller drops it into local simulator state — nothing is
 * persisted server-side by this call.
 */
export function useGenerateAIEstimationDraft() {
    const mutation = useMutation({
        mutationFn: async (params: { dealId: string; signal?: AbortSignal }): Promise<AIEstimationDraft> => {
            // Backend EstimationAiService allows up to 180s for the Anthropic
            // call (plus retry-on-JSON-shape). Frontend must outlast that or
            // axios will abort mid-flight and the network panel shows the
            // request as "cancelled" — masking a still-running backend job.
            const { data } = await api.post(
                `/deals/${params.dealId}/estimation-versions/ai-draft`,
                {},
                { signal: params.signal, timeout: 210_000 },
            )
            return mapAIDraft(data.data as Record<string, unknown>)
        },
        onError: (err) => {
            const norm = normalizeError(err)
            const status = (err as { response?: { status?: number } })?.response?.status
            if (status === 422) {
                toast.error(norm.message || 'Deal needs a workload description or attached contract document.')
            } else if (status === 503) {
                toast.error('AI service unavailable, please try again later.')
            } else {
                toast.error(norm.message || 'AI draft failed — please try again.')
            }
        },
    })

    return {
        generate: (dealId: string, signal?: AbortSignal) => mutation.mutateAsync({ dealId, signal }),
        isGenerating: mutation.isPending,
        lastDraft: mutation.data ?? null,
        error: mutation.error,
        reset: () => mutation.reset(),
    }
}

// ─── AI delta (Suggest Changes from Notes) ───────────────────────────────────

/**
 * Structured diff returned by POST /deals/{id}/estimation-versions/ai-delta.
 * Each section's add/remove/modify arrays are independent — the user accepts
 * per-item via checkboxes in the review panel.
 */
export interface AIEstimationDelta {
    resources: {
        add: Array<{ featureName: string; role: string; hours: number; reason: string }>
        remove: Array<{ featureName: string; reason: string }>
        modify: Array<{ featureName: string; newHours: number; reason: string }>
    }
    overheads: {
        add: Array<{ name: string; cost: number; reason: string }>
        remove: Array<{ name: string; reason: string }>
        modify: Array<{ name: string; newCost: number; reason: string }>
    }
    // roleType is a dynamic capacity-role code (frontend/backend/... or a
    // tenant-custom code), so it's typed as string here and cast to
    // GhostRole['roleType'] when applied.
    roles: {
        add: Array<{ roleType: string; quantity: number; months: number; minMonthlySalary: number; maxMonthlySalary: number; reason: string }>
        remove: Array<{ roleType: string; reason: string }>
        modify: Array<{ roleType: string; newQuantity: number; newMonths: number; newMinMonthlySalary: number; newMaxMonthlySalary: number; reason: string }>
    }
    summary: string
    confidence: 'high' | 'medium' | 'low' | string
}

function mapAIDelta(raw: Record<string, unknown>): AIEstimationDelta {
    const r = (raw.resources ?? {}) as Record<string, unknown>
    const o = (raw.overheads ?? {}) as Record<string, unknown>
    const rl = (raw.roles ?? {}) as Record<string, unknown>
    const arr = (v: unknown): Array<Record<string, unknown>> =>
        Array.isArray(v) ? (v as Array<Record<string, unknown>>) : []
    return {
        resources: {
            add: arr(r.add).map(x => ({
                featureName: String(x.feature_name ?? '').trim(),
                role: String(x.role ?? '').trim(),
                hours: Number(x.hours ?? 0),
                reason: String(x.reason ?? '').trim(),
            })),
            remove: arr(r.remove).map(x => ({
                featureName: String(x.feature_name ?? '').trim(),
                reason: String(x.reason ?? '').trim(),
            })),
            modify: arr(r.modify).map(x => ({
                featureName: String(x.feature_name ?? '').trim(),
                newHours: Number(x.new_hours ?? 0),
                reason: String(x.reason ?? '').trim(),
            })),
        },
        overheads: {
            add: arr(o.add).map(x => ({
                name: String(x.name ?? '').trim(),
                cost: Number(x.cost ?? 0),
                reason: String(x.reason ?? '').trim(),
            })),
            remove: arr(o.remove).map(x => ({
                name: String(x.name ?? '').trim(),
                reason: String(x.reason ?? '').trim(),
            })),
            modify: arr(o.modify).map(x => ({
                name: String(x.name ?? '').trim(),
                newCost: Number(x.new_cost ?? 0),
                reason: String(x.reason ?? '').trim(),
            })),
        },
        roles: {
            add: arr(rl.add).map(x => ({
                roleType: String(x.role_type ?? '').trim(),
                quantity: Number(x.quantity ?? 1),
                months: Number(x.months ?? 1),
                minMonthlySalary: Number(x.min_monthly_salary ?? 0),
                maxMonthlySalary: Number(x.max_monthly_salary ?? 0),
                reason: String(x.reason ?? '').trim(),
            })),
            remove: arr(rl.remove).map(x => ({
                roleType: String(x.role_type ?? '').trim(),
                reason: String(x.reason ?? '').trim(),
            })),
            modify: arr(rl.modify).map(x => ({
                roleType: String(x.role_type ?? '').trim(),
                newQuantity: Number(x.new_quantity ?? 1),
                newMonths: Number(x.new_months ?? 1),
                newMinMonthlySalary: Number(x.new_min_monthly_salary ?? 0),
                newMaxMonthlySalary: Number(x.new_max_monthly_salary ?? 0),
                reason: String(x.reason ?? '').trim(),
            })),
        },
        summary: String(raw.summary ?? '').trim(),
        confidence: String(raw.confidence ?? 'medium'),
    }
}

/**
 * Calls POST /deals/{id}/estimation-versions/ai-delta. Returns a structured
 * add/remove/modify diff that the caller renders in a review panel.
 */
export function useGenerateAIEstimationDelta() {
    const mutation = useMutation({
        mutationFn: async (params: {
            dealId: string
            contextNotes: string
            currentResources: Array<{ featureName: string; role?: string; hours: number }>
            currentOverheads: Array<{ name: string; cost: number }>
            currentRoles: Array<{ roleType: string; quantity: number; months: number; minMonthlySalary: number; maxMonthlySalary: number }>
        }): Promise<AIEstimationDelta> => {
            const { data } = await api.post(
                `/deals/${params.dealId}/estimation-versions/ai-delta`,
                {
                    context_notes: params.contextNotes,
                    current_resources: params.currentResources.map(r => ({
                        feature_name: r.featureName,
                        role: r.role ?? '',
                        hours: r.hours,
                    })),
                    current_overheads: params.currentOverheads.map(o => ({
                        name: o.name,
                        cost: o.cost,
                    })),
                    current_roles: params.currentRoles.map(r => ({
                        role_type: r.roleType,
                        quantity: r.quantity,
                        months: r.months,
                        min_monthly_salary: r.minMonthlySalary,
                        max_monthly_salary: r.maxMonthlySalary,
                    })),
                },
                { timeout: 210_000 },
            )
            return mapAIDelta(data.data as Record<string, unknown>)
        },
        onError: (err) => {
            const norm = normalizeError(err)
            const status = (err as { response?: { status?: number } })?.response?.status
            if (status === 422) {
                toast.error(norm.message || 'Notes are required and must be at least 5 characters.')
            } else if (status === 503) {
                toast.error('AI service unavailable, please try again later.')
            } else {
                toast.error(norm.message || 'AI delta failed — please try again.')
            }
        },
    })

    return {
        suggest: (
            dealId: string,
            contextNotes: string,
            currentResources: Array<{ featureName: string; role?: string; hours: number }>,
            currentOverheads: Array<{ name: string; cost: number }>,
            currentRoles: Array<{ roleType: string; quantity: number; months: number; minMonthlySalary: number; maxMonthlySalary: number }>,
        ) => mutation.mutateAsync({ dealId, contextNotes, currentResources, currentOverheads, currentRoles }),
        isSuggesting: mutation.isPending,
        lastDelta: mutation.data ?? null,
        error: mutation.error,
        reset: () => mutation.reset(),
    }
}

// ─── XLSX download ────────────────────────────────────────────────────────────

/**
 * Trigger a browser-side file download for a saved estimation version. The
 * backend lazy-regenerates if xlsx_path is null OR the file is missing on
 * disk, so this hook can be called for any version returned from the list
 * endpoint regardless of xlsxAvailable.
 *
 * Returns a per-version `isDownloading[versionId]` map so multiple buttons
 * in a list can each show their own spinner without sharing state.
 */
export function useDownloadEstimationXlsx() {
    const [pending, setPending] = useState<Record<string, boolean>>({})

    const downloadVersion = async (
        versionId: string,
        fallbackFilename?: string,
    ): Promise<void> => {
        if (pending[versionId]) return // ignore re-entry while in flight
        setPending(prev => ({ ...prev, [versionId]: true }))
        try {
            const response = await api.get(
                `/estimation-versions/${versionId}/download/xlsx`,
                { responseType: 'blob' },
            )

            // Filename precedence: Content-Disposition from the backend
            // (carries the project_number_estimation_vN convention), then
            // the caller-supplied fallback, finally a generic default.
            const disp = response.headers['content-disposition'] as string | undefined
            const match = disp?.match(/filename\*?=(?:UTF-8'')?["']?([^"';]+)["']?/i)
            const filename = match?.[1]
                ? decodeURIComponent(match[1])
                : (fallbackFilename ?? 'estimation.xlsx')

            // Force MIME type — some backends omit it on Storage::download,
            // and a generic application/octet-stream still triggers the
            // download but loses Excel association on certain browsers.
            const blob = new Blob([response.data], {
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = filename
            document.body.appendChild(a)
            a.click()
            // Detach + revoke on the next tick so the click handler completes
            // before the URL is freed; otherwise some browsers (Firefox) drop
            // the download silently.
            setTimeout(() => {
                document.body.removeChild(a)
                URL.revokeObjectURL(url)
            }, 0)

            toast.success('Estimation export ready')
        } catch (err) {
            const norm = normalizeError(err)
            // The interceptor in lib/api.ts assumes JSON; a blob 4xx body
            // arrives as Blob. Try to decode it for a useful message; fall
            // back to the normalized code/text on any failure.
            const raw = (err as { response?: { data?: unknown; status?: number } })?.response
            let message = norm.message
            if (raw?.data instanceof Blob) {
                try {
                    const text = await raw.data.text()
                    const parsed = JSON.parse(text) as { message?: string }
                    if (parsed.message) message = parsed.message
                } catch {
                    // Blob wasn't JSON — keep normalized message.
                }
            }
            toast.error(message || 'Could not download the estimation export.')
        } finally {
            setPending(prev => {
                const next = { ...prev }
                delete next[versionId]
                return next
            })
        }
    }

    return { downloadVersion, isDownloading: pending }
}

// ─── Send estimate XLSX to customer (spec ④.G) ───────────────────────────────

export interface SendEstimationXlsxInput {
    versionId: string;
    toEmail: string;
    message?: string | null;
}

export interface SendEstimationXlsxResult {
    id: string;
    versionNumber: number;
    sentAt: string | null;
    sentToEmail: string | null;
}

/**
 * Queue the Estimate Doc XLSX for delivery to the customer via the
 * tenant's Mailgun mailer. Spec ④.G — "When the Estimate Doc is
 * approved, send it to the customer by email." Returns the new
 * sent_at + sent_to_email so the UI can display "Sent on…".
 */
export function useSendEstimationXlsx() {
    return useMutation<SendEstimationXlsxResult, Error, SendEstimationXlsxInput>({
        mutationFn: async ({ versionId, toEmail, message }) => {
            const { data } = await api.post(`/estimation-versions/${versionId}/send`, {
                to_email: toEmail,
                message: message ?? null,
            });
            const row = data.data as Record<string, unknown>;
            return {
                id: row.id as string,
                versionNumber: Number(row.version_number),
                sentAt: (row.sent_at as string | null) ?? null,
                sentToEmail: (row.sent_to_email as string | null) ?? null,
            };
        },
    });
}
