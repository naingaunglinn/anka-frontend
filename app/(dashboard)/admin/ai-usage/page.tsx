'use client';

import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAdminAIUsage } from '@/lib/queries/aiUsage';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { BrainCircuit, Coins, MessageSquare, Hash } from 'lucide-react';

export default function AdminAIUsagePage() {
    const t = useTranslations();
    const { data, isLoading } = useAdminAIUsage();

    if (isLoading) {
        return (
            <div className="p-6 space-y-6">
                <div>
                    <div className="h-8 w-48 bg-slate-200 rounded animate-pulse" />
                    <div className="h-4 w-64 mt-2 bg-slate-200 rounded animate-pulse" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="h-32 bg-slate-200 rounded animate-pulse" />
                    ))}
                </div>
                <div className="h-[300px] bg-slate-200 rounded animate-pulse" />
            </div>
        );
    }

    if (!data) {
        return (
            <div className="p-6">
                <h1 className="text-2xl font-bold text-[#171717]">{t('ai_usage_title_short')}</h1>
                <p className="text-[#8a8a8a] mt-2">{t('unable_to_load_ai_usage')}</p>
            </div>
        );
    }

    const { totals, tenants } = data;

    return (
        <div className="p-6 space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight text-[#171717]">{t('ai_usage_costs_title')}</h1>
                <p className="text-[#8a8a8a] mt-1">{t('ai_usage_costs_subtitle')}</p>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <KpiCard
                    title={t('total_calls_col')}
                    value={totals.totalCalls.toLocaleString()}
                    icon={MessageSquare}
                    iconColor="text-[#00a7f4]"
                />
                <KpiCard
                    title={t('total_tokens_col')}
                    value={(totals.totalInputTokens + totals.totalOutputTokens).toLocaleString()}
                    icon={Hash}
                    iconColor="text-violet-500"
                />
                <KpiCard
                    title={t('input_tokens_col')}
                    value={totals.totalInputTokens.toLocaleString()}
                    icon={BrainCircuit}
                    iconColor="text-emerald-500"
                />
                <KpiCard
                    title={t('est_cost')}
                    value={`$${totals.totalCost.toFixed(2)}`}
                    icon={Coins}
                    iconColor="text-amber-500"
                />
            </div>

            {/* Cost Per Tenant Chart */}
            <Card variant="plain">
                <CardHeader className="pb-2">
                    <CardTitle className="text-lg">{t('cost_per_tenant')}</CardTitle>
                </CardHeader>
                <CardContent className="pt-4 h-[350px]">
                    {tenants.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={tenants} layout="vertical" margin={{ top: 5, right: 30, left: 80, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E2E8F0" />
                                <XAxis type="number" tickFormatter={(v) => `$${v}`} axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 12 }} />
                                <YAxis dataKey="tenantName" type="category" axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 12 }} width={100} />
                                <Tooltip
                                    formatter={(value: any) => [`$${Number(value).toFixed(2)}`, t('cost_label')]}
                                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                />
                                <Legend />
                                <Bar dataKey="totalCost" name={t('estimated_cost_label')} fill="#F59E0B" radius={[0, 4, 4, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="flex items-center justify-center h-full text-[#8a8a8a] text-sm">
                            {t('no_ai_usage_yet')}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Per-Tenant Breakdown Table */}
            <Card variant="plain">
                <CardHeader className="border-b bg-slate-50/50 pb-4">
                    <CardTitle className="text-lg">{t('per_tenant_breakdown')}</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-white">
                                <tr>
                                    <th className="text-left py-3 px-4 font-medium text-[#8a8a8a]">{t('tenant_col')}</th>
                                    <th className="text-right py-3 px-4 font-medium text-[#8a8a8a]">{t('calls')}</th>
                                    <th className="text-right py-3 px-4 font-medium text-[#8a8a8a]">{t('input_tokens_col')}</th>
                                    <th className="text-right py-3 px-4 font-medium text-[#8a8a8a]">{t('output_tokens_col')}</th>
                                    <th className="text-right py-3 px-4 font-medium text-[#8a8a8a]">{t('total_tokens_col')}</th>
                                    <th className="text-right py-3 px-4 font-medium text-[#8a8a8a]">{t('est_cost')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {tenants.map((tenant) => (
                                    <tr key={tenant.tenantId} className="border-b last:border-0 hover:bg-slate-50/50">
                                        <td className="py-3 px-4 font-medium text-[#171717]">{tenant.tenantName}</td>
                                        <td className="py-3 px-4 text-right text-[#4a4a4a]">{tenant.totalCalls.toLocaleString()}</td>
                                        <td className="py-3 px-4 text-right text-[#4a4a4a]">{tenant.totalInputTokens.toLocaleString()}</td>
                                        <td className="py-3 px-4 text-right text-[#4a4a4a]">{tenant.totalOutputTokens.toLocaleString()}</td>
                                        <td className="py-3 px-4 text-right font-medium text-[#171717]">
                                            {(tenant.totalInputTokens + tenant.totalOutputTokens).toLocaleString()}
                                        </td>
                                        <td className="py-3 px-4 text-right font-medium text-amber-600">
                                            ${tenant.totalCost.toFixed(2)}
                                        </td>
                                    </tr>
                                ))}
                                {tenants.length === 0 && (
                                    <tr>
                                        <td colSpan={6} className="py-8 text-center text-[#8a8a8a]">
                                            {t('no_ai_usage_yet')}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

function KpiCard({
    title,
    value,
    icon: Icon,
    iconColor,
}: {
    title: string;
    value: string;
    icon: React.ElementType;
    iconColor: string;
}) {
    return (
        <Card variant="plain">
            <CardContent className="p-6">
                <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-[#8a8a8a]">{title}</p>
                    <Icon className={`h-5 w-5 ${iconColor}`} />
                </div>
                <div className="mt-2">
                    <span className="text-3xl font-bold tracking-tight text-[#171717]">{value}</span>
                </div>
            </CardContent>
        </Card>
    );
}
