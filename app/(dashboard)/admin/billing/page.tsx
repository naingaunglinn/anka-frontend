'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAdminTenantList, useAdminMutations } from '@/lib/queries/admin';
import { useTenantStore, type Currency, CURRENCY_CONFIG } from '@/store/tenantStore';
import { Building2, Check, X, Loader2 } from 'lucide-react';

const PLANS = ['free', 'starter', 'pro', 'enterprise'];

const CURRENCIES: Currency[] = ['MMK', 'JPY', 'USD'];

export default function AdminBillingPage() {
    const { data: tenants, isLoading } = useAdminTenantList();
    const { updateTenant } = useAdminMutations();
    const { setTenantCurrency, tenants: storedTenants } = useTenantStore();
    const [updatingId, setUpdatingId] = useState<string | null>(null);
    const [currencyMap, setCurrencyMap] = useState<Record<string, Currency>>({});

    // Initialize currency map from API data when tenants load
    useEffect(() => {
        if (!tenants) return;
        const initial: Record<string, Currency> = {};
        tenants.forEach((t) => {
            initial[t.id] = (t.currency as Currency) ?? 'MMK';
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
        count: tenants?.filter((t) => (t.plan ?? 'free').toLowerCase() === plan).length ?? 0,
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
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">Billing & Plans</h1>
                <p className="text-slate-500 mt-1">Manage tenant subscription plans and billing status.</p>
            </div>

            {/* Plan Distribution Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {planStats.map((stat) => (
                    <Card key={stat.plan} className="shadow-sm border-slate-100">
                        <CardContent className="p-4">
                            <p className="text-xs font-medium text-slate-500 uppercase">{stat.plan}</p>
                            <p className="text-2xl font-bold text-slate-900 mt-1">{stat.count}</p>
                        </CardContent>
                    </Card>
                ))}
                {planStats.length === 0 && (
                    <Card className="shadow-sm border-slate-100 col-span-full">
                        <CardContent className="p-4 text-center text-slate-400 text-sm">
                            No tenant data
                        </CardContent>
                    </Card>
                )}
            </div>

            {/* Tenant Billing Table */}
            <Card className="shadow-sm border-slate-100">
                <CardHeader className="border-b bg-slate-50/50 pb-4">
                    <CardTitle className="text-lg">Tenant Plans</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50">
                                <tr>
                                    <th className="text-left py-3 px-4 font-medium text-slate-500">Tenant</th>
                                    <th className="text-left py-3 px-4 font-medium text-slate-500">Slug</th>
                                    <th className="text-left py-3 px-4 font-medium text-slate-500">Plan</th>
                                    <th className="text-left py-3 px-4 font-medium text-slate-500">Currency</th>
                                    <th className="text-left py-3 px-4 font-medium text-slate-500">Status</th>
                                    <th className="text-left py-3 px-4 font-medium text-slate-500">Users</th>
                                    <th className="text-left py-3 px-4 font-medium text-slate-500">Created</th>
                                    <th className="text-left py-3 px-4 font-medium text-slate-500">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {tenants?.map((tenant) => (
                                    <tr key={tenant.id} className="border-b last:border-0 hover:bg-slate-50/50">
                                        <td className="py-3 px-4 font-medium text-slate-900 flex items-center gap-2">
                                            <Building2 className="h-4 w-4 text-slate-400" />
                                            {tenant.name}
                                        </td>
                                        <td className="py-3 px-4 text-slate-500">{tenant.slug}</td>
                                        <td className="py-3 px-4">
                                            <select
                                                value={tenant.plan ?? 'free'}
                                                onChange={(e) => handlePlanChange(tenant.id, e.target.value)}
                                                disabled={updatingId === tenant.id}
                                                className="text-sm border border-slate-200 rounded-md px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                                            >
                                                {PLANS.map((plan) => (
                                                    <option key={plan} value={plan}>
                                                        {plan.charAt(0).toUpperCase() + plan.slice(1)}
                                                    </option>
                                                ))}
                                            </select>
                                        </td>
                                        <td className="py-3 px-4">
                                            <select
                                                value={getTenantCurrency(tenant.id)}
                                                onChange={(e) => handleCurrencyChange(tenant.id, e.target.value as Currency)}
                                                disabled={updatingId === tenant.id}
                                                className="text-sm border border-slate-200 rounded-md px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
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
                                                {tenant.isActive ? 'Active' : 'Inactive'}
                                            </span>
                                        </td>
                                        <td className="py-3 px-4 text-slate-500">{tenant.usersCount}</td>
                                        <td className="py-3 px-4 text-slate-500">
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
                                                        Deactivate
                                                    </>
                                                ) : (
                                                    <>
                                                        <Check className="h-4 w-4 mr-1" />
                                                        Activate
                                                    </>
                                                )}
                                            </Button>
                                        </td>
                                    </tr>
                                ))}
                                {(!tenants || tenants.length === 0) && (
                                    <tr>
                                        <td colSpan={8} className="py-8 text-center text-slate-400">
                                            No tenants found
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
