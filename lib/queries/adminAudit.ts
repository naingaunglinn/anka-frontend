import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

export const auditKeys = {
    all: ['admin', 'audit'] as const,
    logs: (filters: AuditFilters) => [...auditKeys.all, 'logs', filters] as const,
    users: () => [...auditKeys.all, 'users'] as const,
};

export interface AuditFilters {
    tenantId?: string;
    userId?: string;
    dateFrom?: string;
    dateTo?: string;
    level?: string;
    page?: number;
}

export interface AuditLog {
    id: string;
    action: string;
    level: string;
    target_type: string | null;
    target_id: string | null;
    details: string | null;
    ip_address: string | null;
    created_at: string;
    user: {
        id: string;
        name: string;
        email: string;
    } | null;
    tenant: {
        id: string;
        name: string;
    } | null;
}

export interface AuditLogResponse {
    data: AuditLog[];
    meta: {
        total: number;
        per_page: number;
        current_page: number;
        last_page: number;
    };
}

export interface AuditUser {
    id: string;
    name: string;
    email: string;
}

export function useAdminAuditLogs(filters: AuditFilters = {}) {
    return useQuery<AuditLogResponse>({
        queryKey: auditKeys.logs(filters),
        queryFn: async () => {
            const params: Record<string, unknown> = { page: filters.page ?? 1 };
            if (filters.tenantId) params.tenant_id = filters.tenantId;
            if (filters.userId) params.user_id = filters.userId;
            if (filters.dateFrom) params.date_from = filters.dateFrom;
            if (filters.dateTo) params.date_to = filters.dateTo;
            if (filters.level) params.level = filters.level;

            const { data } = await api.get('/admin/audit-logs', { params });
            return {
                data: data.data,
                meta: data.meta,
            };
        },
        staleTime: 30_000,
    });
}

export function useAdminAuditUsers() {
    return useQuery<AuditUser[]>({
        queryKey: auditKeys.users(),
        queryFn: async () => {
            const { data } = await api.get('/admin/users');
            return data.data;
        },
        staleTime: 300_000,
    });
}
