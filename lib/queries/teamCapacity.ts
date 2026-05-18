import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

export interface TeamCapacitySummary {
    from: string;
    to: string;
    activeEmployees: number;
    /** Holiday-aware available hours summed across the tenant's active employees. */
    availableHours: number;
    /** Stable cost-basis hours (Σ employees.workable_hours). For reference / fallback. */
    costBasisHours: number;
}

export const teamCapacityKeys = {
    all: ['team-capacity'] as const,
    range: (from?: string, to?: string) => [...teamCapacityKeys.all, from ?? null, to ?? null] as const,
};

/**
 * Tenant-wide holiday-aware capacity for an arbitrary range.
 * When `from` / `to` are omitted the backend defaults to the current month.
 *
 * Drives the Time Tracking page's "Available Team Utilization" KPI — using
 * holiday-aware available_hours as the denominator means the percentage stays
 * accurate in months with more public holidays.
 */
export function useTeamCapacity(from?: string, to?: string) {
    return useQuery<TeamCapacitySummary>({
        queryKey: teamCapacityKeys.range(from, to),
        queryFn: async () => {
            const params: Record<string, string> = {};
            if (from) params.from = from;
            if (to)   params.to   = to;
            const { data: body } = await api.get('/team-capacity', { params });
            const d = body.data ?? {};
            return {
                from:             String(d.from ?? ''),
                to:               String(d.to ?? ''),
                activeEmployees:  Number(d.active_employees ?? 0),
                availableHours:   Number(d.available_hours ?? 0),
                costBasisHours:   Number(d.cost_basis_hours ?? 0),
            };
        },
        staleTime: 60_000,
    });
}
