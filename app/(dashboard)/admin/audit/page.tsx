'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAdminAuditLogs, type AuditFilters } from '@/lib/queries/adminAudit';
import { useAdminTenantList } from '@/lib/queries/admin';
import { Shield, User, Building2, AlertTriangle, Bug, Info, AlertCircle } from 'lucide-react';

const ACTION_ICONS: Record<string, React.ElementType> = {
    'tenant.create': Building2,
    'tenant.update': Building2,
    'tenant.deactivate': Building2,
    'user.create': User,
    'user.update': User,
    'user.delete': User,
    'auth.login': Shield,
    'auth.login_failed': AlertTriangle,
    'system.error': Bug,
    'system.exception': Bug,
};

const LEVEL_CONFIG: Record<string, { color: string; icon: React.ElementType }> = {
    info:    { color: 'text-blue-600 bg-blue-50 border-blue-200', icon: Info },
    warning: { color: 'text-amber-600 bg-amber-50 border-amber-200', icon: AlertCircle },
    error:   { color: 'text-rose-600 bg-rose-50 border-rose-200', icon: AlertTriangle },
    critical:{ color: 'text-red-700 bg-red-50 border-red-300', icon: Bug },
};

export default function AdminAuditPage() {
    const [filters, setFilters] = useState<AuditFilters>({ page: 1 });
    const { data, isLoading } = useAdminAuditLogs(filters);
    const { data: tenants } = useAdminTenantList();

    const updateFilter = (key: keyof AuditFilters, value: string) => {
        setFilters((prev) => ({
            ...prev,
            [key]: value || undefined,
            page: 1,
        }));
    };

    const clearFilters = () => {
        setFilters({ page: 1 });
    };

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
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">Audit Logs</h1>
                <p className="text-slate-500 mt-1">Track all administrative actions, user activity, and system errors.</p>
            </div>

            {/* Filters */}
            <Card className="shadow-sm border-slate-100">
                <CardContent className="p-4">
                    <div className="flex flex-wrap items-end gap-4">
                        <div className="space-y-1.5">
                            <label className="text-xs font-medium text-slate-500">Tenant</label>
                            <select
                                value={filters.tenantId || ''}
                                onChange={(e) => updateFilter('tenantId', e.target.value)}
                                className="text-sm border border-slate-200 rounded-md px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 w-48"
                            >
                                <option value="">All Tenants</option>
                                {tenants?.map((t) => (
                                    <option key={t.id} value={t.id}>{t.name}</option>
                                ))}
                            </select>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-xs font-medium text-slate-500">Level</label>
                            <select
                                value={filters.level || ''}
                                onChange={(e) => updateFilter('level', e.target.value)}
                                className="text-sm border border-slate-200 rounded-md px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 w-36"
                            >
                                <option value="">All Levels</option>
                                <option value="info">Info</option>
                                <option value="warning">Warning</option>
                                <option value="error">Error</option>
                                <option value="critical">Critical</option>
                            </select>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-xs font-medium text-slate-500">From</label>
                            <Input
                                type="date"
                                value={filters.dateFrom || ''}
                                onChange={(e) => updateFilter('dateFrom', e.target.value)}
                                className="w-40 text-sm"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-xs font-medium text-slate-500">To</label>
                            <Input
                                type="date"
                                value={filters.dateTo || ''}
                                onChange={(e) => updateFilter('dateTo', e.target.value)}
                                className="w-40 text-sm"
                            />
                        </div>

                        <Button variant="ghost" size="sm" onClick={clearFilters} className="text-slate-500">
                            Clear Filters
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Logs Table */}
            <Card className="shadow-sm border-slate-100">
                <CardHeader className="border-b bg-slate-50/50 pb-4">
                    <CardTitle className="text-lg">
                        Activity Log
                        {data?.meta && (
                            <span className="text-sm font-normal text-slate-400 ml-2">
                                ({data.meta.total} entries)
                            </span>
                        )}
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50">
                                <tr>
                                    <th className="text-left py-3 px-4 font-medium text-slate-500">Level</th>
                                    <th className="text-left py-3 px-4 font-medium text-slate-500">Action</th>
                                    <th className="text-left py-3 px-4 font-medium text-slate-500">Target</th>
                                    <th className="text-left py-3 px-4 font-medium text-slate-500">Tenant</th>
                                    <th className="text-left py-3 px-4 font-medium text-slate-500">Details</th>
                                    <th className="text-left py-3 px-4 font-medium text-slate-500">User</th>
                                    <th className="text-left py-3 px-4 font-medium text-slate-500">IP</th>
                                    <th className="text-left py-3 px-4 font-medium text-slate-500">Time</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data?.data.map((log) => {
                                    const Icon = ACTION_ICONS[log.action] || Shield;
                                    const levelCfg = LEVEL_CONFIG[log.level] || LEVEL_CONFIG.info;
                                    const LevelIcon = levelCfg.icon;
                                    return (
                                        <tr key={log.id} className="border-b last:border-0 hover:bg-slate-50/50">
                                            <td className="py-3 px-4">
                                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${levelCfg.color}`}>
                                                    <LevelIcon className="h-3 w-3" />
                                                    {log.level}
                                                </span>
                                            </td>
                                            <td className="py-3 px-4">
                                                <span className="inline-flex items-center gap-1.5 text-slate-700">
                                                    <Icon className="h-4 w-4 text-slate-400" />
                                                    {log.action}
                                                </span>
                                            </td>
                                            <td className="py-3 px-4 text-slate-500">
                                                {log.target_type ? `${log.target_type}:${log.target_id?.slice(0, 8)}...` : '-'}
                                            </td>
                                            <td className="py-3 px-4">
                                                {log.tenant ? (
                                                    <span className="text-slate-700 font-medium">{log.tenant.name}</span>
                                                ) : (
                                                    <span className="text-slate-400">-</span>
                                                )}
                                            </td>
                                            <td className="py-3 px-4 text-slate-600 max-w-xs truncate">
                                                {log.details || '-'}
                                            </td>
                                            <td className="py-3 px-4 text-slate-500">
                                                {log.user ? (
                                                    <div>
                                                        <div className="font-medium text-slate-900">{log.user.name}</div>
                                                        <div className="text-xs">{log.user.email}</div>
                                                    </div>
                                                ) : (
                                                    'System'
                                                )}
                                            </td>
                                            <td className="py-3 px-4 text-slate-500 font-mono text-xs">
                                                {log.ip_address || '-'}
                                            </td>
                                            <td className="py-3 px-4 text-slate-500 whitespace-nowrap">
                                                {new Date(log.created_at).toLocaleString()}
                                            </td>
                                        </tr>
                                    );
                                })}
                                {(!data?.data || data.data.length === 0) && (
                                    <tr>
                                        <td colSpan={8} className="py-8 text-center text-slate-400">
                                            No audit logs match your filters.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    {data?.meta && data.meta.last_page > 1 && (
                        <div className="flex items-center justify-between px-4 py-3 border-t">
                            <div className="text-sm text-slate-500">
                                Page {data.meta.current_page} of {data.meta.last_page}
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setFilters((p) => ({ ...p, page: Math.max(1, (p.page ?? 1) - 1) }))}
                                    disabled={(filters.page ?? 1) <= 1}
                                    className="px-3 py-1 text-sm border rounded-md disabled:opacity-50 hover:bg-slate-50"
                                >
                                    Previous
                                </button>
                                <button
                                    onClick={() => setFilters((p) => ({ ...p, page: Math.min(data.meta.last_page, (p.page ?? 1) + 1) }))}
                                    disabled={(filters.page ?? 1) >= data.meta.last_page}
                                    className="px-3 py-1 text-sm border rounded-md disabled:opacity-50 hover:bg-slate-50"
                                >
                                    Next
                                </button>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
