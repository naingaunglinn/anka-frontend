'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAdminAIUsage } from '@/lib/queries/aiUsage';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { BrainCircuit, Coins, MessageSquare, Hash } from 'lucide-react';

export default function AdminAIUsagePage() {
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
                <h1 className="text-2xl font-bold text-slate-900">AI Usage</h1>
                <p className="text-slate-500 mt-2">Unable to load AI usage data.</p>
            </div>
        );
    }

    const { totals, tenants } = data;

    return (
        <div className="p-6 space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">AI Usage & Costs</h1>
                <p className="text-slate-500 mt-1">Platform-wide AI consumption and estimated costs.</p>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <KpiCard
                    title="Total Calls"
                    value={totals.totalCalls.toLocaleString()}
                    icon={MessageSquare}
                    iconColor="text-[#00a7f4]"
                />
                <KpiCard
                    title="Total Tokens"
                    value={(totals.totalInputTokens + totals.totalOutputTokens).toLocaleString()}
                    icon={Hash}
                    iconColor="text-violet-500"
                />
                <KpiCard
                    title="Input Tokens"
                    value={totals.totalInputTokens.toLocaleString()}
                    icon={BrainCircuit}
                    iconColor="text-emerald-500"
                />
                <KpiCard
                    title="Est. Cost"
                    value={`$${totals.totalCost.toFixed(2)}`}
                    icon={Coins}
                    iconColor="text-amber-500"
                />
            </div>

            {/* Cost Per Tenant Chart */}
            <Card className="shadow-sm border-slate-100">
                <CardHeader className="pb-2">
                    <CardTitle className="text-lg">Cost Per Tenant</CardTitle>
                </CardHeader>
                <CardContent className="pt-4 h-[350px]">
                    {tenants.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={tenants} layout="vertical" margin={{ top: 5, right: 30, left: 80, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E2E8F0" />
                                <XAxis type="number" tickFormatter={(v) => `$${v}`} axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 12 }} />
                                <YAxis dataKey="tenantName" type="category" axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 12 }} width={100} />
                                <Tooltip
                                    formatter={(value: any, name: any) => [`$${Number(value).toFixed(2)}`, 'Cost']}
                                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                />
                                <Legend />
                                <Bar dataKey="totalCost" name="Estimated Cost" fill="#F59E0B" radius={[0, 4, 4, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="flex items-center justify-center h-full text-slate-400 text-sm">
                            No AI usage data yet
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Per-Tenant Breakdown Table */}
            <Card className="shadow-sm border-slate-100">
                <CardHeader className="border-b bg-slate-50/50 pb-4">
                    <CardTitle className="text-lg">Per-Tenant Breakdown</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50">
                                <tr>
                                    <th className="text-left py-3 px-4 font-medium text-slate-500">Tenant</th>
                                    <th className="text-right py-3 px-4 font-medium text-slate-500">Calls</th>
                                    <th className="text-right py-3 px-4 font-medium text-slate-500">Input Tokens</th>
                                    <th className="text-right py-3 px-4 font-medium text-slate-500">Output Tokens</th>
                                    <th className="text-right py-3 px-4 font-medium text-slate-500">Total Tokens</th>
                                    <th className="text-right py-3 px-4 font-medium text-slate-500">Est. Cost</th>
                                </tr>
                            </thead>
                            <tbody>
                                {tenants.map((tenant) => (
                                    <tr key={tenant.tenantId} className="border-b last:border-0 hover:bg-slate-50/50">
                                        <td className="py-3 px-4 font-medium text-slate-900">{tenant.tenantName}</td>
                                        <td className="py-3 px-4 text-right text-slate-600">{tenant.totalCalls.toLocaleString()}</td>
                                        <td className="py-3 px-4 text-right text-slate-600">{tenant.totalInputTokens.toLocaleString()}</td>
                                        <td className="py-3 px-4 text-right text-slate-600">{tenant.totalOutputTokens.toLocaleString()}</td>
                                        <td className="py-3 px-4 text-right font-medium text-slate-900">
                                            {(tenant.totalInputTokens + tenant.totalOutputTokens).toLocaleString()}
                                        </td>
                                        <td className="py-3 px-4 text-right font-medium text-amber-600">
                                            ${tenant.totalCost.toFixed(2)}
                                        </td>
                                    </tr>
                                ))}
                                {tenants.length === 0 && (
                                    <tr>
                                        <td colSpan={6} className="py-8 text-center text-slate-400">
                                            No AI usage data yet
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
        <Card className="shadow-sm border-slate-100">
            <CardContent className="p-6">
                <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-slate-500">{title}</p>
                    <Icon className={`h-5 w-5 ${iconColor}`} />
                </div>
                <div className="mt-2">
                    <span className="text-3xl font-bold tracking-tight text-slate-900">{value}</span>
                </div>
            </CardContent>
        </Card>
    );
}
