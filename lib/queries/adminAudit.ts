import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

export const auditKeys = {
    all: ['admin', 'audit'] as const,
    logs: (page = 1) => [...auditKeys.all, 'logs', page] as const,
};

export interface AuditLog {
    id: string;
    action: string;
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

export function useAdminAuditLogs(page = 1) {
    return useQuery<AuditLogResponse>({
        queryKey: auditKeys.logs(page),
        queryFn: async () => {
            const { data } = await api.get('/admin/audit-logs', { params: { page } });
            return {
                data: data.data,
                meta: data.meta,
            };
        },
        staleTime: 30_000,
    });
}
