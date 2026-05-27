'use client'

import { useTranslations } from 'next-intl'
import { useAIUsage, useAdminAIUsage } from '@/lib/queries/aiUsage'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { Sparkles, Zap, DollarSign, Building2 } from 'lucide-react'

// ── Tenant admin view (organization page) ─────────────────────────────────────

export function AIUsageDashboard() {
    const t = useTranslations()
    const { data, isLoading, isError } = useAIUsage()

    if (isLoading) {
        return <div className="h-48 animate-pulse bg-slate-100 rounded-xl" />
    }
    if (isError) {
        return <p className="text-sm text-destructive">{t('failed_to_load_ai_usage')}</p>
    }
    if (!data) return null

    const { summary, logs } = data
    const totalTokens = summary.totalInputTokens + summary.totalOutputTokens

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card variant="plain">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-[#8a8a8a] flex items-center gap-2">
                            <Sparkles className="w-4 h-4 text-purple-500" />
                            {t('total_ai_calls')}
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-3xl font-bold text-[#171717]">{summary.totalCalls.toLocaleString()}</p>
                        <p className="text-xs text-[#4a4a4a] mt-1">
                            {t('n_this_month', { count: summary.thisMonthCalls })}
                        </p>
                    </CardContent>
                </Card>

                <Card variant="plain">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-[#8a8a8a] flex items-center gap-2">
                            <Zap className="w-4 h-4 text-amber-500" />
                            {t('total_tokens_kpi')}
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-3xl font-bold text-[#171717]">{totalTokens.toLocaleString()}</p>
                        <p className="text-xs text-[#4a4a4a] mt-1">
                            {t('tokens_in_out_summary', { input: summary.totalInputTokens.toLocaleString(), output: summary.totalOutputTokens.toLocaleString() })}
                        </p>
                    </CardContent>
                </Card>

                <Card variant="plain">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-[#8a8a8a] flex items-center gap-2">
                            <DollarSign className="w-4 h-4 text-emerald-500" />
                            {t('estimated_cost_kpi')}
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-3xl font-bold text-[#171717]">
                            ${summary.totalEstimatedCost.toFixed(4)}
                        </p>
                        <p className="text-xs text-[#4a4a4a] mt-1">
                            {t('cost_this_month', { amount: summary.thisMonthCost.toFixed(4) })}
                        </p>
                    </CardContent>
                </Card>
            </div>

            <div className="bg-white rounded-xl border border-[#e6e9ee] shadow-sm overflow-hidden">
                <div className="p-6 border-b border-[#e6e9ee]">
                    <h3 className="text-lg font-semibold text-[#171717]">{t('recent_ai_calls_title')}</h3>
                    <p className="text-sm text-[#4a4a4a] mt-0.5">{t('recent_ai_calls_subtitle')}</p>
                </div>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>{t('date')}</TableHead>
                            <TableHead>{t('feature_col')}</TableHead>
                            <TableHead>{t('model_col')}</TableHead>
                            <TableHead className="text-right">{t('input_tokens_col')}</TableHead>
                            <TableHead className="text-right">{t('output_tokens_col')}</TableHead>
                            <TableHead className="text-right">{t('est_cost')}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {logs.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={6} className="h-24 text-center text-[#4a4a4a]">
                                    {t('no_ai_calls_logged')}
                                </TableCell>
                            </TableRow>
                        ) : logs.map(log => (
                            <TableRow key={log.id}>
                                <TableCell className="text-sm text-[#4a4a4a]">
                                    {new Date(log.createdAt).toLocaleString()}
                                </TableCell>
                                <TableCell className="text-sm capitalize">
                                    {log.feature.replace(/_/g, ' ')}
                                </TableCell>
                                <TableCell className="text-xs font-mono text-[#8a8a8a]">
                                    {log.model}
                                </TableCell>
                                <TableCell className="text-right text-sm">
                                    {log.inputTokens.toLocaleString()}
                                </TableCell>
                                <TableCell className="text-right text-sm">
                                    {log.outputTokens.toLocaleString()}
                                </TableCell>
                                <TableCell className="text-right text-sm font-medium text-emerald-700">
                                    ${log.estimatedCostUsd.toFixed(5)}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
        </div>
    )
}

// ── Super-admin view (tenant management page) ─────────────────────────────────

export function AdminAIUsagePanel() {
    const t = useTranslations()
    const { data, isLoading, isError } = useAdminAIUsage()

    if (isLoading) {
        return <div className="h-32 animate-pulse bg-slate-100 rounded-xl" />
    }
    if (isError) {
        return <p className="text-sm text-destructive">{t('failed_to_load_ai_usage')}</p>
    }
    if (!data) return null

    const { totals, tenants } = data

    return (
        <div className="space-y-6 mt-8">
            <div>
                <h2 className="text-xl font-bold text-[#171717] flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-purple-500" />
                    {t('ai_usage_all_tenants')}
                </h2>
                <p className="text-sm text-[#4a4a4a] mt-1">{t('aggregate_claude_subtitle')}</p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                    { label: t('total_calls_col'),    value: totals.totalCalls.toLocaleString() },
                    { label: t('input_tokens_col'),   value: totals.totalInputTokens.toLocaleString() },
                    { label: t('output_tokens_col'),  value: totals.totalOutputTokens.toLocaleString() },
                    { label: t('platform_cost_kpi'),  value: `$${totals.totalCost.toFixed(4)}` },
                ].map(stat => (
                    <Card key={stat.label} className="shadow-sm border-[#e6e9ee]">
                        <CardContent className="pt-4">
                            <p className="text-xs text-[#8a8a8a] uppercase tracking-wider">{stat.label}</p>
                            <p className="text-2xl font-bold text-[#171717] mt-1">{stat.value}</p>
                        </CardContent>
                    </Card>
                ))}
            </div>

            <div className="bg-white rounded-xl border border-[#e6e9ee] shadow-sm overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>
                                <span className="flex items-center gap-1.5">
                                    <Building2 className="w-3.5 h-3.5" /> {t('tenant_col')}
                                </span>
                            </TableHead>
                            <TableHead className="text-right">{t('calls')}</TableHead>
                            <TableHead className="text-right">{t('input_tokens_col')}</TableHead>
                            <TableHead className="text-right">{t('output_tokens_col')}</TableHead>
                            <TableHead className="text-right">{t('est_cost')}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {tenants.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} className="h-16 text-center text-[#4a4a4a]">
                                    {t('no_ai_usage_any_tenant')}
                                </TableCell>
                            </TableRow>
                        ) : tenants.map(tenant => (
                            <TableRow key={tenant.tenantId}>
                                <TableCell className="font-medium text-[#171717]">{tenant.tenantName}</TableCell>
                                <TableCell className="text-right">{tenant.totalCalls.toLocaleString()}</TableCell>
                                <TableCell className="text-right text-sm text-[#4a4a4a]">{tenant.totalInputTokens.toLocaleString()}</TableCell>
                                <TableCell className="text-right text-sm text-[#4a4a4a]">{tenant.totalOutputTokens.toLocaleString()}</TableCell>
                                <TableCell className="text-right font-medium text-emerald-700">
                                    ${tenant.totalCost.toFixed(5)}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
        </div>
    )
}
