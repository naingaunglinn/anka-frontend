'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAdminAuditLogs } from '@/lib/queries/adminAudit';
import { Shield, User, Building2, BrainCircuit, Key, AlertTriangle } from 'lucide-react';

const ACTION_ICONS: Record<string, React.ElementType> = {
    'tenant.create': Building2,
    'tenant.update': Building2,
    'tenant.deactivate': Building2,
    'user.create': User,
    'user.update': User,
    'user.delete': User,
    'auth.login': Key,
    'auth.login_failed': AlertTriangle,
};

const ACTION_COLORS: Record<string, string> = {
    'tenant.create': 'text-emerald-600 bg-emerald-50',
    'tenant.update': 'text-blue-600 bg-blue-50',
    'tenant.deactivate': 'text-rose-600 bg-rose-50',
    'user.create': 'text-emerald-600 bg-emerald-50',
    'user.update': 'text-blue-600 bg-blue-50',
    'user.delete': 'text-rose-600 bg-rose-50',
    'auth.login': 'text-emerald-600 bg-emerald-50',
    'auth.login_failed': 'text-amber-600 bg-amber-50',
};

export default function AdminAuditPage() {
    const [page, setPage] = useState(1);
    const { data, isLoading } = useAdminAuditLogs(page);

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
                <p className="text-slate-500 mt-1">Track all administrative actions and security events.</p>
            </div>

            <Card className="shadow-sm border-slate-100">
                <CardHeader className="border-b bg-slate-50/50 pb-4">
                    <CardTitle className="text-lg">Activity Log</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50">
                                <tr>
                                    <th className="text-left py-3 px-4 font-medium text-slate-500">Action</th>
                                    <th className="text-left py-3 px-4 font-medium text-slate-500">Target</th>
                                    <th className="text-left py-3 px-4 font-medium text-slate-500">Details</th>
                                    <th className="text-left py-3 px-4 font-medium text-slate-500">User</th>
                                    <th className="text-left py-3 px-4 font-medium text-slate-500">IP</th>
                                    <th className="text-left py-3 px-4 font-medium text-slate-500">Time</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data?.data.map((log) => {
                                    const Icon = ACTION_ICONS[log.action] || Shield;
                                    const colorClass = ACTION_COLORS[log.action] || 'text-slate-600 bg-slate-50';
                                    return (
                                        <tr key={log.id} className="border-b last:border-0 hover:bg-slate-50/50">
                                            <td className="py-3 px-4">
                                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${colorClass}`}>
                                                    <Icon className="h-3.5 w-3.5" />
                                                    {log.action}
                                                </span>
                                            </td>
                                            <td className="py-3 px-4 text-slate-500">
                                                {log.target_type ? `${log.target_type}:${log.target_id?.slice(0, 8)}...` : '-'}
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
                                        <td colSpan={6} className="py-8 text-center text-slate-400">
                                            No audit logs yet. Actions will appear here as they occur.
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
                                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                                    disabled={page <= 1}
                                    className="px-3 py-1 text-sm border rounded-md disabled:opacity-50 hover:bg-slate-50"
                                >
                                    Previous
                                </button>
                                <button
                                    onClick={() => setPage((p) => Math.min(data.meta.last_page, p + 1))}
                                    disabled={page >= data.meta.last_page}
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
