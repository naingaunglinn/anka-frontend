'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAdminTenantList, useAdminMutations } from '@/lib/queries/admin';
import { useTenantStore, type Currency, CURRENCY_CONFIG } from '@/store/tenantStore';
import { Building2, Check, X, Loader2 } from 'lucide-react';

const PLANS = ['free', 'starter', 'pro', 'enterprise'] as const;
const PLAN_KEY: Record<string, string> = {
    free: 'plan_free',
    starter: 'plan_starter',
    pro: 'plan_pro',
    enterprise: 'plan_enterprise',
};

const CURRENCIES: Currency[] = ['MMK', 'JPY'];

export default function AdminBillingPage() {
    const t = useTranslations();
    const { data: tenants, isLoading } = useAdminTenantList();
    const { updateTenant } = useAdminMutations();
    const { setTenantCurrency, tenants: storedTenants } = useTenantStore();
    const [updatingId, setUpdatingId] = useState<string | null>(null);
    const [currencyMap, setCurrencyMap] = useState<Record<string, Currency>>({});

    // Initialize currency map from API data when tenants load
    useEffect(() => {
        if (!tenants) return;
        const initial: Record<string, Currency> = {};
        tenants.forEach((tenant) => {
            initial[tenant.id] = (tenant.currency as Currency) ?? 'MMK';
        });
        setCurrencyMap(initial);
    }, [tenants]);

    const getTenantCurrency = (tenantId: string): Currency => {
        return currencyMap[tenantId] ?? 'MMK';
    };

    const handlePlanChange = async (tenantId: string, newPlan: string) => {
        setUpdatingId(tenantId);
        await updateTenant.mutateAsync({ id: tenantId, updates: { plan: newPlan } });
        setUpdatingId(null);
    };

    const handleCurrencyChange = async (tenantId: string, currency: Currency) => {
        setUpdatingId(tenantId);
        setCurrencyMap((prev) => ({ ...prev, [tenantId]: currency }));
        setTenantCurrency(tenantId, currency);
        await updateTenant.mutateAsync({ id: tenantId, updates: { currency } });
        setUpdatingId(null);
    };

    const handleToggleActive = async (tenantId: string, currentActive: boolean) => {
        setUpdatingId(tenantId);
        await updateTenant.mutateAsync({ id: tenantId, updates: { isActive: !currentActive } });
        setUpdatingId(null);
    };

    // Simple plan stats
    const planStats = PLANS.map((plan) => ({
        plan,
        count: tenants?.filter((tenant) => (tenant.plan ?? 'free').toLowerCase() === plan).length ?? 0,
    })).filter((s) => s.count > 0);

    if (isLoading) {
        return (
            <div className="p-6 space-y-6">
                <div>
                    <div className="h-8 w-48 bg-slate-200 rounded animate-pulse" />
                    <div className="h-4 w-64 mt-2 bg-slate-200 rounded animate-pulse" />
                </div>
                <div className="h-[400px] bg-slate-200 rounded animate-pulse" />
            </div>
        );
    }

    return (
        <div className="p-6 space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight text-[#171717]">{t('billing_plans_title')}</h1>
                <p className="text-[#8a8a8a] mt-1">{t('billing_plans_subtitle')}</p>
            </div>

            {/* Plan Distribution Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {planStats.map((stat) => (
                    <Card key={stat.plan} className="shadow-sm border-[#e6e9ee]">
                        <CardContent className="p-4">
                            <p className="text-xs font-medium text-[#8a8a8a] uppercase">{t(PLAN_KEY[stat.plan])}</p>
                            <p className="text-2xl font-bold text-[#171717] mt-1">{stat.count}</p>
                        </CardContent>
                    </Card>
                ))}
                {planStats.length === 0 && (
                    <Card className="shadow-sm border-[#e6e9ee] col-span-full">
                        <CardContent className="p-4 text-center text-[#8a8a8a] text-sm">
                            {t('no_tenant_data')}
                        </CardContent>
                    </Card>
                )}
            </div>

            {/* Tenant Billing Table */}
            <Card className="shadow-sm border-[#e6e9ee]">
                <CardHeader className="border-b bg-slate-50/50 pb-4">
                    <CardTitle className="text-lg">{t('tenant_plans_title')}</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-white">
                                <tr>
                                    <th className="text-left py-3 px-4 font-medium text-[#8a8a8a]">{t('tenant_col')}</th>
                                    <th className="text-left py-3 px-4 font-medium text-[#8a8a8a]">{t('slug_col')}</th>
                                    <th className="text-left py-3 px-4 font-medium text-[#8a8a8a]">{t('plan')}</th>
                                    <th className="text-left py-3 px-4 font-medium text-[#8a8a8a]">{t('currency_col')}</th>
                                    <th className="text-left py-3 px-4 font-medium text-[#8a8a8a]">{t('status')}</th>
                                    <th className="text-left py-3 px-4 font-medium text-[#8a8a8a]">{t('users_col')}</th>
                                    <th className="text-left py-3 px-4 font-medium text-[#8a8a8a]">{t('created_col')}</th>
                                    <th className="text-left py-3 px-4 font-medium text-[#8a8a8a]">{t('actions')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {tenants?.map((tenant) => (
                                    <tr key={tenant.id} className="border-b last:border-0 hover:bg-slate-50/50">
                                        <td className="py-3 px-4 font-medium text-[#171717] flex items-center gap-2">
                                            <Building2 className="h-4 w-4 text-[#8a8a8a]" />
                                            {tenant.name}
                                        </td>
                                        <td className="py-3 px-4 text-[#8a8a8a]">{tenant.slug}</td>
                                        <td className="py-3 px-4">
                                            <select
                                                value={tenant.plan ?? 'free'}
                                                onChange={(e) => handlePlanChange(tenant.id, e.target.value)}
                                                disabled={updatingId === tenant.id}
                                                className="text-sm border border-[#e6e9ee] rounded-md px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                                            >
                                                {PLANS.map((plan) => (
                                                    <option key={plan} value={plan}>
                                                        {t(PLAN_KEY[plan])}
                                                    </option>
                                                ))}
                                            </select>
                                        </td>
                                        <td className="py-3 px-4">
                                            <select
                                                value={getTenantCurrency(tenant.id)}
                                                onChange={(e) => handleCurrencyChange(tenant.id, e.target.value as Currency)}
                                                disabled={updatingId === tenant.id}
                                                className="text-sm border border-[#e6e9ee] rounded-md px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                                            >
                                                {CURRENCIES.map((c) => (
                                                    <option key={c} value={c}>
                                                        {CURRENCY_CONFIG[c].symbol} {c}
                                                    </option>
                                                ))}
                                            </select>
                                        </td>
                                        <td className="py-3 px-4">
                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                                tenant.isActive
                                                    ? 'bg-emerald-50 text-emerald-700'
                                                    : 'bg-rose-50 text-rose-700'
                                            }`}>
                                                {tenant.isActive ? t('active') : t('inactive')}
                                            </span>
                                        </td>
                                        <td className="py-3 px-4 text-[#8a8a8a]">{tenant.usersCount}</td>
                                        <td className="py-3 px-4 text-[#8a8a8a]">
                                            {new Date(tenant.createdAt).toLocaleDateString()}
                                        </td>
                                        <td className="py-3 px-4">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleToggleActive(tenant.id, tenant.isActive)}
                                                disabled={updatingId === tenant.id}
                                                className={tenant.isActive ? 'text-rose-600 hover:text-rose-700 hover:bg-rose-50' : 'text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50'}
                                            >
                                                {updatingId === tenant.id ? (
                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                ) : tenant.isActive ? (
                                                    <>
                                                        <X className="h-4 w-4 mr-1" />
                                                        {t('deactivate')}
                                                    </>
                                                ) : (
                                                    <>
                                                        <Check className="h-4 w-4 mr-1" />
                                                        {t('activate')}
                                                    </>
                                                )}
                                            </Button>
                                        </td>
                                    </tr>
                                ))}
                                {(!tenants || tenants.length === 0) && (
                                    <tr>
                                        <td colSpan={8} className="py-8 text-center text-[#8a8a8a]">
                                            {t('no_tenants_found')}
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
