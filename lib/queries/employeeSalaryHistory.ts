import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';

/**
 * Spec ②.1.B — salary timeline per employee. One row per
 * (employee, target_month). The Employee record's basic_salary /
 * allowance / cost_per_hour fields stay as the *current* row's values
 * (denormalized cache), so legacy readers across the app keep
 * working unchanged. Date-aware lookups (estimation/profit/forecast,
 * later phases) go through the timeline.
 */
export interface EmployeeSalaryHistoryRow {
    id: string;
    employeeId: string;
    targetMonth: string;       // YYYY-MM-01
    basicSalary: number;
    allowance: number;
    monthlySalary: number;     // = basic + allowance (derived server-side)
    costPerHour: number;       // snapshot at row creation
    workableHours: number;
    notes: string | null;
    createdByUserId: string | null;
    createdAt: string | null;
    updatedAt: string | null;
}

function toRow(row: Record<string, unknown>): EmployeeSalaryHistoryRow {
    return {
        id:               row.id as string,
        employeeId:       row.employee_id as string,
        targetMonth:      row.target_month as string,
        basicSalary:      Number(row.basic_salary),
        allowance:        Number(row.allowance),
        monthlySalary:    Number(row.monthly_salary),
        costPerHour:      Number(row.cost_per_hour),
        workableHours:    Number(row.workable_hours),
        notes:            (row.notes as string | null) ?? null,
        createdByUserId:  (row.created_by_user_id as string | null) ?? null,
        createdAt:        (row.created_at as string | null) ?? null,
        updatedAt:        (row.updated_at as string | null) ?? null,
    };
}

export const salaryHistoryKeys = {
    all: ['employee-salary-history'] as const,
    forEmployee: (employeeId: string) => [...salaryHistoryKeys.all, employeeId] as const,
};

export function useEmployeeSalaryHistory(employeeId: string | null | undefined) {
    return useQuery<EmployeeSalaryHistoryRow[]>({
        queryKey: salaryHistoryKeys.forEmployee(employeeId ?? ''),
        queryFn: async () => {
            const { data } = await api.get(`/employees/${employeeId}/salary-history`);
            return (data.data ?? []).map(toRow);
        },
        enabled: !!employeeId,
        staleTime: 30_000,
    });
}

/**
 * Tenant-wide salary timeline — every row for every employee in the
 * active tenant. Used by the Forecast page to compute past-month payroll
 * from applicable historical salaries instead of today's salary applied
 * retroactively.
 */
export function useAllSalaryHistory() {
    return useQuery<EmployeeSalaryHistoryRow[]>({
        queryKey: salaryHistoryKeys.all,
        queryFn: async () => {
            const { data } = await api.get('/employee-salary-history');
            return (data.data ?? []).map(toRow);
        },
        staleTime: 30_000,
    });
}

export interface AddSalaryRowInput {
    employeeId: string;
    targetMonth: string;       // YYYY-MM-01 or any parseable date (server coerces to start-of-month)
    basicSalary: number;
    allowance?: number;
    notes?: string | null;
}

export function useAddSalaryRow() {
    const qc = useQueryClient();
    return useMutation<EmployeeSalaryHistoryRow, Error, AddSalaryRowInput>({
        mutationFn: async ({ employeeId, targetMonth, basicSalary, allowance, notes }) => {
            const { data } = await api.post(`/employees/${employeeId}/salary-history`, {
                target_month: targetMonth,
                basic_salary: basicSalary,
                allowance: allowance ?? 0,
                notes: notes ?? null,
            });
            return toRow(data.data);
        },
        onSuccess: (_data, vars) => {
            qc.invalidateQueries({ queryKey: salaryHistoryKeys.forEmployee(vars.employeeId) });
            // Employee's denormalized current salary may have been recomputed
            // server-side — invalidate the employee/list caches so the table
            // and detail page show fresh numbers.
            qc.invalidateQueries({ queryKey: ['employees'] });
        },
    });
}

export interface UpdateSalaryRowInput {
    employeeId: string;
    rowId: string;
    basicSalary?: number;
    allowance?: number;
    notes?: string | null;
}

export function useUpdateSalaryRow() {
    const qc = useQueryClient();
    return useMutation<EmployeeSalaryHistoryRow, Error, UpdateSalaryRowInput>({
        mutationFn: async ({ employeeId, rowId, basicSalary, allowance, notes }) => {
            const payload: Record<string, unknown> = {};
            if (basicSalary !== undefined) payload.basic_salary = basicSalary;
            if (allowance !== undefined) payload.allowance = allowance;
            if (notes !== undefined) payload.notes = notes;
            const { data } = await api.put(`/employees/${employeeId}/salary-history/${rowId}`, payload);
            return toRow(data.data);
        },
        onSuccess: (_data, vars) => {
            qc.invalidateQueries({ queryKey: salaryHistoryKeys.forEmployee(vars.employeeId) });
            qc.invalidateQueries({ queryKey: ['employees'] });
        },
    });
}

export function useDeleteSalaryRow() {
    const qc = useQueryClient();
    return useMutation<void, Error, { employeeId: string; rowId: string }>({
        mutationFn: async ({ employeeId, rowId }) => {
            await api.delete(`/employees/${employeeId}/salary-history/${rowId}`);
        },
        onSuccess: (_data, vars) => {
            qc.invalidateQueries({ queryKey: salaryHistoryKeys.forEmployee(vars.employeeId) });
            qc.invalidateQueries({ queryKey: ['employees'] });
        },
    });
}

/**
 * Frontend helper: "is this row in a past month?" — past rows are
 * read-only per decision 2(b) of the 1.2.B → 2.1.B fix plan.
 */
export function isPastMonth(targetMonth: string): boolean {
    const monthStart = new Date(targetMonth + 'T00:00:00Z');
    const now = new Date();
    const currentMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    return monthStart < currentMonthStart;
}
