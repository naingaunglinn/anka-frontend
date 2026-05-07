'use client'

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
    const { data, isLoading, isError } = useAIUsage()

    if (isLoading) {
        return <div className="h-48 animate-pulse bg-slate-100 rounded-xl" />
    }
    if (isError) {
        return <p className="text-sm text-destructive">Failed to load AI usage data.</p>
    }
    if (!data) return null

    const { summary, logs } = data
    const totalTokens = summary.totalInputTokens + summary.totalOutputTokens

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="shadow-sm border-slate-100">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-slate-500 flex items-center gap-2">
                            <Sparkles className="w-4 h-4 text-purple-500" />
                            Total AI Calls
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-3xl font-bold text-slate-900">{summary.totalCalls.toLocaleString()}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                            {summary.thisMonthCalls} this month
                        </p>
                    </CardContent>
                </Card>

                <Card className="shadow-sm border-slate-100">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-slate-500 flex items-center gap-2">
                            <Zap className="w-4 h-4 text-amber-500" />
                            Total Tokens
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-3xl font-bold text-slate-900">{totalTokens.toLocaleString()}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                            {summary.totalInputTokens.toLocaleString()} in &middot; {summary.totalOutputTokens.toLocaleString()} out
                        </p>
                    </CardContent>
                </Card>

                <Card className="shadow-sm border-slate-100">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-slate-500 flex items-center gap-2">
                            <DollarSign className="w-4 h-4 text-emerald-500" />
                            Estimated Cost
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-3xl font-bold text-slate-900">
                            ${summary.totalEstimatedCost.toFixed(4)}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                            ${summary.thisMonthCost.toFixed(4)} this month
                        </p>
                    </CardContent>
                </Card>
            </div>

            <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-slate-100">
                    <h3 className="text-lg font-semibold text-slate-900">Recent AI Calls</h3>
                    <p className="text-sm text-muted-foreground mt-0.5">Last 100 calls. Model: Claude Haiku 4.5.</p>
                </div>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Feature</TableHead>
                            <TableHead>Model</TableHead>
                            <TableHead className="text-right">Input Tokens</TableHead>
                            <TableHead className="text-right">Output Tokens</TableHead>
                            <TableHead className="text-right">Est. Cost</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {logs.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                                    No AI calls logged yet. Use the AI Team Builder on a deal to generate the first entry.
                                </TableCell>
                            </TableRow>
                        ) : logs.map(log => (
                            <TableRow key={log.id}>
                                <TableCell className="text-sm text-slate-600">
                                    {new Date(log.createdAt).toLocaleString()}
                                </TableCell>
                                <TableCell className="text-sm capitalize">
                                    {log.feature.replace(/_/g, ' ')}
                                </TableCell>
                                <TableCell className="text-xs font-mono text-slate-500">
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
    const { data, isLoading, isError } = useAdminAIUsage()

    if (isLoading) {
        return <div className="h-32 animate-pulse bg-slate-100 rounded-xl" />
    }
    if (isError) {
        return <p className="text-sm text-destructive">Failed to load AI usage data.</p>
    }
    if (!data) return null

    const { totals, tenants } = data

    return (
        <div className="space-y-6 mt-8">
            <div>
                <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-purple-500" />
                    AI Usage — All Tenants
                </h2>
                <p className="text-sm text-muted-foreground mt-1">Aggregate Claude API usage across the platform.</p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                    { label: 'Total Calls',    value: totals.totalCalls.toLocaleString() },
                    { label: 'Input Tokens',   value: totals.totalInputTokens.toLocaleString() },
                    { label: 'Output Tokens',  value: totals.totalOutputTokens.toLocaleString() },
                    { label: 'Platform Cost',  value: `$${totals.totalCost.toFixed(4)}` },
                ].map(stat => (
                    <Card key={stat.label} className="shadow-sm border-slate-100">
                        <CardContent className="pt-4">
                            <p className="text-xs text-slate-500 uppercase tracking-wider">{stat.label}</p>
                            <p className="text-2xl font-bold text-slate-900 mt-1">{stat.value}</p>
                        </CardContent>
                    </Card>
                ))}
            </div>

            <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>
                                <span className="flex items-center gap-1.5">
                                    <Building2 className="w-3.5 h-3.5" /> Tenant
                                </span>
                            </TableHead>
                            <TableHead className="text-right">Calls</TableHead>
                            <TableHead className="text-right">Input Tokens</TableHead>
                            <TableHead className="text-right">Output Tokens</TableHead>
                            <TableHead className="text-right">Est. Cost</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {tenants.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} className="h-16 text-center text-muted-foreground">
                                    No AI usage recorded across any tenant yet.
                                </TableCell>
                            </TableRow>
                        ) : tenants.map(t => (
                            <TableRow key={t.tenantId}>
                                <TableCell className="font-medium text-slate-900">{t.tenantName}</TableCell>
                                <TableCell className="text-right">{t.totalCalls.toLocaleString()}</TableCell>
                                <TableCell className="text-right text-sm text-slate-600">{t.totalInputTokens.toLocaleString()}</TableCell>
                                <TableCell className="text-right text-sm text-slate-600">{t.totalOutputTokens.toLocaleString()}</TableCell>
                                <TableCell className="text-right font-medium text-emerald-700">
                                    ${t.totalCost.toFixed(5)}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
        </div>
    )
}
