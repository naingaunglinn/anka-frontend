'use client';

import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAdminDashboardStats } from '@/lib/queries/adminDashboard';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { Building2, Users, Activity, BrainCircuit, TrendingUp, TrendingDown } from 'lucide-react';
import { formatMoney } from '@/lib/currency';
// Skeleton component not available — using simple div with animate-pulse

const COLORS = ['#10B981', '#00a7f4', '#F59E0B', '#EF4444', '#8B5CF6'];

export default function AdminDashboardPage() {
    const t = useTranslations();
    const { data: stats, isLoading } = useAdminDashboardStats();

    if (isLoading) {
        return <DashboardSkeleton />;
    }

    if (!stats) {
        return (
            <div className="p-6">
                <h1 className="text-2xl font-bold text-[#171717]">{t('platform_dashboard_title')}</h1>
                <p className="text-[#8a8a8a] mt-2">{t('unable_to_load_dashboard')}</p>
            </div>
        );
    }

    const activeRate = stats.total_tenants > 0
        ? Math.round((stats.active_tenants / stats.total_tenants) * 100)
        : 0;

    return (
        <div className="p-6 space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight text-[#171717]">{t('platform_dashboard_title')}</h1>
                <p className="text-[#8a8a8a] mt-1">{t('platform_dashboard_subtitle')}</p>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <KpiCard
                    title={t('total_tenants_kpi')}
                    value={stats.total_tenants}
                    subValue={t('n_active', { count: stats.active_tenants })}
                    icon={Building2}
                    iconColor="text-violet-500"
                    trend={activeRate >= 80 ? 'up' : 'down'}
                    trendValue={t('active_rate_suffix', { rate: activeRate })}
                />
                <KpiCard
                    title={t('total_users_kpi')}
                    value={stats.total_users}
                    subValue={t('across_all_tenants')}
                    icon={Users}
                    iconColor="text-[#00a7f4]"
                />
                <KpiCard
                    title={t('ai_calls_kpi')}
                    value={stats.ai_usage.total_calls.toLocaleString()}
                    subValue={t('n_tokens', { tokens: stats.ai_usage.total_tokens.toLocaleString() })}
                    icon={BrainCircuit}
                    iconColor="text-pink-500"
                />
                <KpiCard
                    title={t('ai_cost_kpi')}
                    value={formatMoney(stats.ai_usage.total_cost)}
                    subValue={t('estimated_value')}
                    icon={Activity}
                    iconColor="text-emerald-500"
                />
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Signups Over Time */}
                <Card className="shadow-sm border-[#e6e9ee]">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-lg">{t('tenant_signups_6mo')}</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4 h-[300px]">
                        {stats.signups_over_time.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={stats.signups_over_time}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                                    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 12 }} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 12 }} />
                                    <Tooltip
                                        formatter={(value: any) => [value, t('signups_tooltip')]}
                                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                    />
                                    <Bar dataKey="count" fill="#00a7f4" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="flex items-center justify-center h-full text-[#8a8a8a] text-sm">
                                {t('no_signup_data')}
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Plan Distribution */}
                <Card className="shadow-sm border-[#e6e9ee]">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-lg">{t('plan_distribution')}</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4 h-[300px]">
                        {stats.plan_distribution.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={stats.plan_distribution}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={60}
                                        outerRadius={100}
                                        paddingAngle={5}
                                        dataKey="count"
                                        nameKey="plan"
                                    >
                                        {stats.plan_distribution.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip
                                        formatter={(value: any, name: any) => [value, name]}
                                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                    />
                                    <Legend />
                                </PieChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="flex items-center justify-center h-full text-[#8a8a8a] text-sm">
                                {t('no_plan_data')}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Recent Signups Table */}
            <Card className="shadow-sm border-[#e6e9ee]">
                <CardHeader className="border-b bg-slate-50/50 pb-4">
                    <CardTitle className="text-lg">{t('recent_signups')}</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-white">
                                <tr>
                                    <th className="text-left py-3 px-4 font-medium text-[#8a8a8a]">{t('tenant_col')}</th>
                                    <th className="text-left py-3 px-4 font-medium text-[#8a8a8a]">{t('slug_col')}</th>
                                    <th className="text-left py-3 px-4 font-medium text-[#8a8a8a]">{t('plan')}</th>
                                    <th className="text-left py-3 px-4 font-medium text-[#8a8a8a]">{t('status')}</th>
                                    <th className="text-left py-3 px-4 font-medium text-[#8a8a8a]">{t('created_col')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {stats.recent_signups.map((tenant) => (
                                    <tr key={tenant.id} className="border-b last:border-0 hover:bg-slate-50/50">
                                        <td className="py-3 px-4 font-medium text-[#171717]">{tenant.name}</td>
                                        <td className="py-3 px-4 text-[#8a8a8a]">{tenant.slug}</td>
                                        <td className="py-3 px-4">
                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#00a7f4]/5 text-[#0086c4]">
                                                {tenant.plan}
                                            </span>
                                        </td>
                                        <td className="py-3 px-4">
                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                                tenant.is_active
                                                    ? 'bg-emerald-50 text-emerald-700'
                                                    : 'bg-rose-50 text-rose-700'
                                            }`}>
                                                {tenant.is_active ? t('active') : t('inactive')}
                                            </span>
                                        </td>
                                        <td className="py-3 px-4 text-[#8a8a8a]">
                                            {new Date(tenant.created_at).toLocaleDateString()}
                                        </td>
                                    </tr>
                                ))}
                                {stats.recent_signups.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="py-8 text-center text-[#8a8a8a]">
                                            {t('no_tenants_yet')}
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
    subValue,
    icon: Icon,
    iconColor,
    trend,
    trendValue,
}: {
    title: string;
    value: string | number;
    subValue: string;
    icon: React.ElementType;
    iconColor: string;
    trend?: 'up' | 'down';
    trendValue?: string;
}) {
    return (
        <Card className="shadow-sm border-[#e6e9ee]">
            <CardContent className="p-6">
                <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-[#8a8a8a]">{title}</p>
                    <Icon className={`h-5 w-5 ${iconColor}`} />
                </div>
                <div className="mt-2">
                    <span className="text-3xl font-bold tracking-tight text-[#171717]">{value}</span>
                </div>
                <div className="mt-1 flex items-center gap-2">
                    <span className="text-xs text-[#8a8a8a]">{subValue}</span>
                    {trend && trendValue && (
                        <span className={`inline-flex items-center gap-1 text-xs font-medium ${
                            trend === 'up' ? 'text-emerald-600' : 'text-rose-600'
                        }`}>
                            {trend === 'up' ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                            {trendValue}
                        </span>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}

function DashboardSkeleton() {
    return (
        <div className="p-6 space-y-6">
            <div>
                <div className="h-8 w-64 bg-slate-200 rounded animate-pulse" />
                <div className="h-4 w-96 mt-2 bg-slate-200 rounded animate-pulse" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {Array.from({ length: 4 }).map((_, i) => (
                    <Card key={i} className="shadow-sm border-[#e6e9ee]">
                        <CardContent className="p-6 space-y-3">
                            <div className="h-4 w-24 bg-slate-200 rounded animate-pulse" />
                            <div className="h-10 w-20 bg-slate-200 rounded animate-pulse" />
                            <div className="h-3 w-32 bg-slate-200 rounded animate-pulse" />
                        </CardContent>
                    </Card>
                ))}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="shadow-sm border-[#e6e9ee]">
                    <CardContent className="p-6 h-[300px]">
                        <div className="h-full w-full bg-slate-200 rounded animate-pulse" />
                    </CardContent>
                </Card>
                <Card className="shadow-sm border-[#e6e9ee]">
                    <CardContent className="p-6 h-[300px]">
                        <div className="h-full w-full bg-slate-200 rounded animate-pulse" />
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
