import { useQuery } from '@tanstack/react-query'
import api from '@/lib/api'

// ── Tenant-scoped types ───────────────────────────────────────────────────────

export interface AIUsageSummary {
    totalCalls:           number
    totalInputTokens:     number
    totalOutputTokens:    number
    totalEstimatedCost:   number
    thisMonthCalls:       number
    thisMonthCost:        number
}

export interface AIUsageLog {
    id:                 string
    feature:            string
    model:              string
    inputTokens:        number
    outputTokens:       number
    estimatedCostUsd:   number
    createdAt:          string
}

export interface AIUsageData {
    summary: AIUsageSummary
    logs:    AIUsageLog[]
}

function toLog(row: Record<string, unknown>): AIUsageLog {
    return {
        id:               row.id as string,
        feature:          row.feature as string,
        model:            row.model as string,
        inputTokens:      row.input_tokens as number,
        outputTokens:     row.output_tokens as number,
        estimatedCostUsd: row.estimated_cost_usd as number,
        createdAt:        row.created_at as string,
    }
}

export function useAIUsage() {
    return useQuery({
        queryKey: ['ai-usage'],
        queryFn: async (): Promise<AIUsageData> => {
            const { data } = await api.get('/ai-usage')
            const s = data.summary
            const rawLogs: Record<string, unknown>[] = data.logs?.data ?? data.logs ?? []
            return {
                summary: {
                    totalCalls:         s.total_calls,
                    totalInputTokens:   s.total_input_tokens,
                    totalOutputTokens:  s.total_output_tokens,
                    totalEstimatedCost: s.total_estimated_cost,
                    thisMonthCalls:     s.this_month_calls,
                    thisMonthCost:      s.this_month_cost,
                },
                logs: rawLogs.map(toLog),
            }
        },
        staleTime: 30_000,
    })
}

// ── Super-admin types ─────────────────────────────────────────────────────────

export interface AdminAIUsageTenant {
    tenantId:           string
    tenantName:         string
    totalCalls:         number
    totalInputTokens:   number
    totalOutputTokens:  number
    totalCost:          number
}

export interface AdminAIUsageData {
    totals: {
        totalCalls:         number
        totalInputTokens:   number
        totalOutputTokens:  number
        totalCost:          number
    }
    tenants: AdminAIUsageTenant[]
}

export function useAdminAIUsage() {
    return useQuery({
        queryKey: ['admin-ai-usage'],
        queryFn: async (): Promise<AdminAIUsageData> => {
            const { data } = await api.get('/admin/ai-usage')
            return {
                totals: {
                    totalCalls:         data.totals.total_calls,
                    totalInputTokens:   data.totals.total_input_tokens,
                    totalOutputTokens:  data.totals.total_output_tokens,
                    totalCost:          data.totals.total_cost,
                },
                tenants: (data.tenants ?? []).map((t: Record<string, unknown>) => ({
                    tenantId:          t.tenant_id as string,
                    tenantName:        t.tenant_name as string,
                    totalCalls:        t.total_calls as number,
                    totalInputTokens:  t.total_input_tokens as number,
                    totalOutputTokens: t.total_output_tokens as number,
                    totalCost:         t.total_cost as number,
                })),
            }
        },
        staleTime: 60_000,
    })
}
