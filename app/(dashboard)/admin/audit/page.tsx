'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAdminAuditLogs, type AuditFilters, type AuditLog } from '@/lib/queries/adminAudit';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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
    info:    { color: 'text-[#00a7f4] bg-[#00a7f4]/5 border-[#00a7f4]/20', icon: Info },
    warning: { color: 'text-amber-600 bg-amber-50 border-amber-200', icon: AlertCircle },
    error:   { color: 'text-rose-600 bg-rose-50 border-rose-200', icon: AlertTriangle },
    critical:{ color: 'text-red-700 bg-red-50 border-red-300', icon: Bug },
};

export default function AdminAuditPage() {
    const t = useTranslations();
    const [filters, setFilters] = useState<AuditFilters>({ page: 1 });
    const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
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
                <h1 className="text-2xl font-bold tracking-tight text-[#171717]">{t('audit_logs_title')}</h1>
                <p className="text-[#8a8a8a] mt-1">{t('audit_logs_subtitle')}</p>
            </div>

            {/* Filters */}
            <Card className="shadow-sm border-[#e6e9ee]">
                <CardContent className="p-4">
                    <div className="flex flex-wrap items-end gap-4">
                        <div className="space-y-1.5">
                            <label className="text-xs font-medium text-[#8a8a8a]">{t('tenant_col')}</label>
                            <select
                                value={filters.tenantId || ''}
                                onChange={(e) => updateFilter('tenantId', e.target.value)}
                                className="text-sm border border-[#e6e9ee] rounded-md px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 w-48"
                            >
                                <option value="">{t('all_tenants_option')}</option>
                                {tenants?.map((tenant) => (
                                    <option key={tenant.id} value={tenant.id}>{tenant.name}</option>
                                ))}
                            </select>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-xs font-medium text-[#8a8a8a]">{t('level_filter')}</label>
                            <select
                                value={filters.level || ''}
                                onChange={(e) => updateFilter('level', e.target.value)}
                                className="text-sm border border-[#e6e9ee] rounded-md px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 w-36"
                            >
                                <option value="">{t('all_levels_option')}</option>
                                <option value="info">{t('level_info')}</option>
                                <option value="warning">{t('level_warning')}</option>
                                <option value="error">{t('error')}</option>
                                <option value="critical">{t('critical')}</option>
                            </select>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-xs font-medium text-[#8a8a8a]">{t('from_label')}</label>
                            <Input
                                type="date"
                                value={filters.dateFrom || ''}
                                onChange={(e) => updateFilter('dateFrom', e.target.value)}
                                className="w-40 text-sm"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-xs font-medium text-[#8a8a8a]">{t('to_label')}</label>
                            <Input
                                type="date"
                                value={filters.dateTo || ''}
                                onChange={(e) => updateFilter('dateTo', e.target.value)}
                                className="w-40 text-sm"
                            />
                        </div>

                        <Button variant="ghost" size="sm" onClick={clearFilters} className="text-[#8a8a8a]">
                            {t('clear_filters')}
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Logs Table */}
            <Card className="shadow-sm border-[#e6e9ee]">
                <CardHeader className="border-b bg-slate-50/50 pb-4">
                    <CardTitle className="text-lg">
                        {t('activity_log_title')}
                        {data?.meta && (
                            <span className="text-sm font-normal text-[#8a8a8a] ml-2">
                                {t('n_entries_suffix', { count: data.meta.total })}
                            </span>
                        )}
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-white">
                                <tr>
                                    <th className="text-left py-3 px-4 font-medium text-[#8a8a8a]">{t('level_filter')}</th>
                                    <th className="text-left py-3 px-4 font-medium text-[#8a8a8a]">{t('action_col')}</th>
                                    <th className="text-left py-3 px-4 font-medium text-[#8a8a8a]">{t('target_col')}</th>
                                    <th className="text-left py-3 px-4 font-medium text-[#8a8a8a]">{t('tenant_col')}</th>
                                    <th className="text-left py-3 px-4 font-medium text-[#8a8a8a]">{t('details_col')}</th>
                                    <th className="text-left py-3 px-4 font-medium text-[#8a8a8a]">{t('user_col')}</th>
                                    <th className="text-left py-3 px-4 font-medium text-[#8a8a8a]">{t('ip_col')}</th>
                                    <th className="text-left py-3 px-4 font-medium text-[#8a8a8a]">{t('time_col')}</th>
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
                                                    <Icon className="h-4 w-4 text-[#8a8a8a]" />
                                                    {log.action}
                                                </span>
                                            </td>
                                            <td className="py-3 px-4 text-[#8a8a8a]">
                                                {log.target_type ? `${log.target_type}:${log.target_id?.slice(0, 8)}...` : '-'}
                                            </td>
                                            <td className="py-3 px-4">
                                                {log.tenant ? (
                                                    <span className="text-slate-700 font-medium">{log.tenant.name}</span>
                                                ) : (
                                                    <span className="text-[#8a8a8a]">-</span>
                                                )}
                                            </td>
                                            <td className="py-3 px-4">
                                                <div className="flex items-center justify-between gap-2">
                                                    <div className="text-[#4a4a4a] max-w-xs truncate">
                                                        {log.details || '-'}
                                                    </div>
                                                    {log.details && (
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="h-6 px-2 text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50"
                                                            onClick={() => setSelectedLog(log)}
                                                        >
                                                            {t('view_action')}
                                                        </Button>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="py-3 px-4 text-[#8a8a8a]">
                                                {log.user ? (
                                                    <div>
                                                        <div className="font-medium text-[#171717]">{log.user.name}</div>
                                                        <div className="text-xs">{log.user.email}</div>
                                                    </div>
                                                ) : (
                                                    t('system_actor')
                                                )}
                                            </td>
                                            <td className="py-3 px-4 text-[#8a8a8a] font-mono text-xs">
                                                {log.ip_address || '-'}
                                            </td>
                                            <td className="py-3 px-4 text-[#8a8a8a] whitespace-nowrap">
                                                {new Date(log.created_at).toLocaleString()}
                                            </td>
                                        </tr>
                                    );
                                })}
                                {(!data?.data || data.data.length === 0) && (
                                    <tr>
                                        <td colSpan={8} className="py-8 text-center text-[#8a8a8a]">
                                            {t('no_audit_logs_match')}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    {data?.meta && data.meta.last_page > 1 && (
                        <div className="flex items-center justify-between px-4 py-3 border-t">
                            <div className="text-sm text-[#8a8a8a]">
                                {t('page_x_of_y', { current: data.meta.current_page, total: data.meta.last_page })}
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setFilters((p) => ({ ...p, page: Math.max(1, (p.page ?? 1) - 1) }))}
                                    disabled={(filters.page ?? 1) <= 1}
                                    className="px-3 py-1 text-sm border rounded-md disabled:opacity-50 hover:bg-white"
                                >
                                    {t('previous')}
                                </button>
                                <button
                                    onClick={() => setFilters((p) => ({ ...p, page: Math.min(data.meta.last_page, (p.page ?? 1) + 1) }))}
                                    disabled={(filters.page ?? 1) >= data.meta.last_page}
                                    className="px-3 py-1 text-sm border rounded-md disabled:opacity-50 hover:bg-white"
                                >
                                    {t('next')}
                                </button>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Detail Dialog */}
            <Dialog open={!!selectedLog} onOpenChange={(open) => !open && setSelectedLog(null)}>
                <DialogContent className="sm:max-w-[600px] bg-white">
                    <DialogHeader>
                        <DialogTitle>{t('audit_log_details_title')}</DialogTitle>
                    </DialogHeader>
                    {selectedLog && (
                        <div className="space-y-4 mt-4">
                            <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                    <span className="font-medium text-[#8a8a8a]">{t('level_field')}</span>
                                    <span className="text-[#171717]">{selectedLog.level}</span>
                                </div>
                                <div>
                                    <span className="font-medium text-[#8a8a8a]">{t('action_field')}</span>
                                    <span className="text-[#171717]">{selectedLog.action}</span>
                                </div>
                                <div>
                                    <span className="font-medium text-[#8a8a8a]">{t('time_field')}</span>
                                    <span className="text-[#171717]">{new Date(selectedLog.created_at).toLocaleString()}</span>
                                </div>
                                <div>
                                    <span className="font-medium text-[#8a8a8a]">{t('ip_address_field')}</span>
                                    <span className="text-[#171717]">{selectedLog.ip_address || '-'}</span>
                                </div>
                                <div>
                                    <span className="font-medium text-[#8a8a8a]">{t('user_field')}</span>
                                    <span className="text-[#171717]">{selectedLog.user ? `${selectedLog.user.name} (${selectedLog.user.email})` : t('system_actor')}</span>
                                </div>
                                <div>
                                    <span className="font-medium text-[#8a8a8a]">{t('tenant_field')}</span>
                                    <span className="text-[#171717]">{selectedLog.tenant ? selectedLog.tenant.name : '-'}</span>
                                </div>
                                <div className="col-span-2">
                                    <span className="font-medium text-[#8a8a8a]">{t('target_field')}</span>
                                    <span className="text-[#171717]">{selectedLog.target_type ? `${selectedLog.target_type} : ${selectedLog.target_id}` : '-'}</span>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <span className="font-medium text-[#8a8a8a] text-sm">{t('details_content_label')}</span>
                                <div className="bg-slate-50 p-4 rounded-md border border-slate-200 text-sm text-[#171717] whitespace-pre-wrap font-mono overflow-auto max-h-[300px]">
                                    {selectedLog.details || t('no_additional_details')}
                                </div>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
