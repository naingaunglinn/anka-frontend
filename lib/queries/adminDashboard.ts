import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

export const adminKeys = {
    all: ['admin'] as const,
    dashboard: () => [...adminKeys.all, 'dashboard'] as const,
};

export interface DashboardStats {
    total_tenants: number;
    active_tenants: number;
    inactive_tenants: number;
    total_users: number;
    ai_usage: {
        total_calls: number;
        total_tokens: number;
        total_cost: number;
    };
    signups_over_time: { month: string; count: number }[];
    recent_signups: {
        id: string;
        name: string;
        slug: string;
        plan: string;
        is_active: boolean;
        created_at: string;
    }[];
    plan_distribution: { plan: string; count: number }[];
}

export function useAdminDashboardStats() {
    return useQuery<DashboardStats>({
        queryKey: adminKeys.dashboard(),
        queryFn: async () => {
            const { data } = await api.get('/admin/dashboard/stats');
            return data.data;
        },
        staleTime: 60_000,
    });
}
