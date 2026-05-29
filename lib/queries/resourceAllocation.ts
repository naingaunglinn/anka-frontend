import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

export interface MonthAllocation {
    month: number;
    operate: number;
    available: number;
}

export interface EmployeeAllocation {
    id: string;
    name: string;
    role: 'leader' | 'member';
    capacityRole: string;
    department: string;
    months: MonthAllocation[];
}

export interface ResourceAllocationSummary {
    headcount: number;
    avgUtilization: number;
    totalBench: number;
    overAllocationAlerts: number;
}

export interface ResourceAllocationData {
    year: number;
    employees: EmployeeAllocation[];
    summary: ResourceAllocationSummary;
}

export const resourceAllocationKeys = {
    all: ['resource-allocation'] as const,
    year: (year: number) => [...resourceAllocationKeys.all, year] as const,
};

export function useResourceAllocation(year: number) {
    return useQuery<ResourceAllocationData>({
        queryKey: resourceAllocationKeys.year(year),
        queryFn: async () => {
            const { data: body } = await api.get('/resource-allocation', {
                params: { year },
            });
            const employees: EmployeeAllocation[] = (body.employees ?? []).map(
                (e: Record<string, unknown>) => ({
                    id: String(e.id ?? ''),
                    name: String(e.name ?? ''),
                    role: e.role === 'leader' ? 'leader' : 'member',
                    capacityRole: String(e.capacity_role ?? ''),
                    department: String(e.department ?? ''),
                    months: ((e.months as Record<string, unknown>[]) ?? []).map(
                        (m) => ({
                            month: Number(m.month ?? 0),
                            operate: Number(m.operate ?? 0),
                            available: Number(m.available ?? 0),
                        }),
                    ),
                }),
            );
            const s = (body.summary ?? {}) as Record<string, unknown>;
            return {
                year: Number(body.year ?? year),
                employees,
                summary: {
                    headcount: Number(s.headcount ?? 0),
                    avgUtilization: Number(s.avg_utilization ?? 0),
                    totalBench: Number(s.total_bench ?? 0),
                    overAllocationAlerts: Number(s.over_allocation_alerts ?? 0),
                },
            };
        },
        staleTime: 60_000,
    });
}
