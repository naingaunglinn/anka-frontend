import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { normalizeError } from '@/lib/errorHandler';
import type {
    MyScheduleTodayItem,
    PhaseProgressLog,
    PhaseVariance,
    ScheduleHealth,
    ScheduleState,
    ScheduleTrackingByAssignee,
    ScheduleTrackingProjectSummary,
    ScheduleTrackingRow,
} from '@/types/business';

// ── Mappers ──────────────────────────────────────────────────────────────────

function toLog(row: Record<string, unknown>): PhaseProgressLog {
    return {
        id:                row.id as string,
        phaseAssignmentId: row.phase_assignment_id as string,
        employeeId:        row.employee_id as string,
        employeeName:      (row.employee_name as string | null) ?? null,
        logDate:           row.log_date as string,
        progressHours:     Number(row.progress_hours ?? 0),
        usedHours:         Number(row.used_hours ?? 0),
        lateHours:         Number(row.late_hours ?? Math.max(0, Number(row.used_hours ?? 0) - Number(row.progress_hours ?? 0))),
        note:              (row.note as string | null) ?? null,
        lockedAt:          (row.locked_at as string | null) ?? null,
        isLocked:          Boolean(row.is_locked),
        createdAt:         (row.created_at as string | null) ?? null,
        updatedAt:         (row.updated_at as string | null) ?? null,
    };
}

function toVariance(row: Record<string, unknown>): PhaseVariance {
    return {
        cumulativeProgressHours: Number(row.cumulative_progress_hours ?? 0),
        cumulativeUsedHours:     Number(row.cumulative_used_hours ?? 0),
        expectedProgressHours:   Number(row.expected_progress_hours ?? 0),
        varianceHours:           Number(row.variance_hours ?? 0),
        overDeliveredHours:      Number(row.over_delivered_hours ?? 0),
        lateHours:               Number(row.late_hours ?? 0),
        scheduleState:           (row.schedule_state as ScheduleState) ?? 'pending',
        health:                  (row.health as ScheduleHealth) ?? 'on_track',
        isCompleted:             Boolean(row.is_completed),
    };
}

function toTrackingRow(row: Record<string, unknown>): ScheduleTrackingRow {
    const logs = Array.isArray(row.progress_logs)
        ? (row.progress_logs as Record<string, unknown>[]).map(toLog)
        : [];
    return {
        id:                row.id as string,
        taskAssignmentId:  row.task_assignment_id as string,
        functionId:        (row.function_id as string | null) ?? null,
        functionName:      (row.function_name as string) ?? '',
        difficulty:        row.difficulty as ScheduleTrackingRow['difficulty'],
        phaseCode:         row.phase_code as ScheduleTrackingRow['phaseCode'],
        phaseName:         (row.phase_name as string) ?? '',
        phaseOrder:        Number(row.phase_order ?? 0),
        estimatedHours:    Number(row.estimated_hours ?? 0),
        plannedStart:      (row.planned_start as string | null) ?? null,
        plannedEnd:        (row.planned_end as string | null) ?? null,
        actualStart:       (row.actual_start as string | null) ?? null,
        actualEnd:         (row.actual_end as string | null) ?? null,
        assigneeId:        (row.assignee_id as string | null) ?? null,
        assigneeName:      (row.assignee_name as string | null) ?? null,
        status:            row.status as ScheduleTrackingRow['status'],
        progressLogs:      logs,
        variance:          toVariance(row.variance as Record<string, unknown>),
    };
}

function toSummary(row: Record<string, unknown>): ScheduleTrackingProjectSummary {
    return {
        totalEstimatedHours:   Number(row.total_estimated_hours ?? 0),
        totalProgressHours:    Number(row.total_progress_hours ?? 0),
        totalUsedHours:        Number(row.total_used_hours ?? 0),
        expectedProgressHours: Number(row.expected_progress_hours ?? 0),
        todayExpectedHours:    Number(row.today_expected_hours ?? 0),
        todayProgressHours:    Number(row.today_progress_hours ?? 0),
        varianceHours:         Number(row.variance_hours ?? 0),
        overDeliveredHours:    Number(row.over_delivered_hours ?? 0),
        lateHours:             Number(row.late_hours ?? 0),
        phaseCount:            Number(row.phase_count ?? 0),
        completedCount:        Number(row.completed_count ?? 0),
        health:                (row.health as ScheduleHealth) ?? 'on_track',
    };
}

function toByAssignee(row: Record<string, unknown>): ScheduleTrackingByAssignee {
    return {
        ...toSummary(row),
        assigneeId:   row.assignee_id as string,
        assigneeName: (row.assignee_name as string | null) ?? null,
    };
}

function toTodayItem(row: Record<string, unknown>): MyScheduleTodayItem {
    return {
        phaseAssignmentId: row.phase_assignment_id as string,
        taskAssignmentId:  row.task_assignment_id as string,
        phaseCode:         row.phase_code as MyScheduleTodayItem['phaseCode'],
        phaseName:         (row.phase_name as string) ?? '',
        estimatedHours:    Number(row.estimated_hours ?? 0),
        plannedStart:      (row.planned_start as string | null) ?? null,
        plannedEnd:        (row.planned_end as string | null) ?? null,
        status:            row.status as MyScheduleTodayItem['status'],
        functionName:      (row.function_name as string | null) ?? null,
        functionId:        (row.function_id as string | null) ?? null,
        projectId:         (row.project_id as string | null) ?? null,
        projectName:       (row.project_name as string | null) ?? null,
        todayLog:          row.today_log ? toLog(row.today_log as Record<string, unknown>) : null,
    };
}

// ── Query keys ───────────────────────────────────────────────────────────────

export const scheduleTrackingKeys = {
    all: ['schedule-tracking'] as const,
    today: () => [...scheduleTrackingKeys.all, 'today'] as const,
    listFor: (projectId: string, params: ScheduleTrackingListParams) =>
        [...scheduleTrackingKeys.all, 'list', projectId, params] as const,
    summary: (projectId: string) => [...scheduleTrackingKeys.all, 'summary', projectId] as const,
    byAssignee: (projectId: string) => [...scheduleTrackingKeys.all, 'by-assignee', projectId] as const,
    logsFor: (phaseAssignmentId: string) => [...scheduleTrackingKeys.all, 'logs', phaseAssignmentId] as const,
    lateHoursForProject: (projectId: string, asOf?: string) =>
        [...scheduleTrackingKeys.all, 'late-hours', projectId, asOf ?? null] as const,
    progressSummary: (params: ProgressLogSummaryParams) =>
        [...scheduleTrackingKeys.all, 'progress-summary', params] as const,
};

// ── Progress-log summary (Time Tracking page KPI) ───────────────────────────

export interface ProgressLogSummaryParams {
    dateFrom?: string;
    dateTo?: string;
    phaseStatus?: '未着手' | '進行中' | '完了';
    /** When provided, scopes the summary to a single project. Omit for tenant-wide. */
    projectId?: string;
}

export interface ProgressLogSummary {
    totalProgressHours: number;
    totalUsedHours: number;
    logCount: number;
}

/**
 * Aggregated stats for the Time Tracking page's "Total Hours Logged" KPI.
 * Hits `GET /phase-progress-logs/summary` with optional date_from / date_to /
 * phase_status / project_id filters. Returns SUM(progress_hours),
 * SUM(used_hours), COUNT.
 *
 * The card displays `totalUsedHours` (labor time), not `totalProgressHours`
 * (completion units) — change here if you flip that decision.
 */
export function useProgressLogSummary(params: ProgressLogSummaryParams = {}) {
    return useQuery<ProgressLogSummary>({
        queryKey: scheduleTrackingKeys.progressSummary(params),
        queryFn: async () => {
            const query: Record<string, string> = {};
            if (params.dateFrom)    query.date_from    = params.dateFrom;
            if (params.dateTo)      query.date_to      = params.dateTo;
            if (params.phaseStatus) query.phase_status = params.phaseStatus;
            if (params.projectId)   query.project_id   = params.projectId;
            const { data: body } = await api.get('/phase-progress-logs/summary', { params: query });
            const d = body.data ?? {};
            return {
                totalProgressHours: Number(d.total_progress_hours ?? 0),
                totalUsedHours:     Number(d.total_used_hours     ?? 0),
                logCount:           Number(d.log_count            ?? 0),
            };
        },
    });
}

// ── Late hours (Finance + Schedule Tracking) ─────────────────────────────────

export interface LateHourLogRow {
    logDate: string;
    employeeId: string;
    employeeName: string | null;
    rankCode: string | null;
    capacityRole: string | null;
    progressHours: number;
    usedHours: number;
    lateHours: number;
    costPerHour: number;
    lateCost: number;
}

export interface LateHourEmployeeRow {
    employeeId: string;
    employeeName: string | null;
    rankCode: string | null;
    capacityRole: string | null;
    costPerHour: number;
    totalProgressHours: number;
    totalUsedHours: number;
    totalLateHours: number;
    totalLateCost: number;
    daysCount: number;
}

export interface ProjectLateHoursResponse {
    data: LateHourLogRow[];
    byEmployee: LateHourEmployeeRow[];
    meta: {
        projectId: string;
        projectName: string;
        asOf: string | null;
        totalLateHours: number;
        totalLateCost: number;
        logCount: number;
    };
}

function toLateHourLog(row: Record<string, unknown>): LateHourLogRow {
    return {
        logDate:       (row.log_date as string) ?? '',
        employeeId:    row.employee_id as string,
        employeeName:  (row.employee_name as string | null) ?? null,
        rankCode:      (row.rank_code as string | null) ?? null,
        capacityRole:  (row.capacity_role as string | null) ?? null,
        progressHours: Number(row.progress_hours ?? 0),
        usedHours:     Number(row.used_hours ?? 0),
        lateHours:     Number(row.late_hours ?? 0),
        costPerHour:   Number(row.cost_per_hour ?? 0),
        lateCost:      Number(row.late_cost ?? 0),
    };
}

function toLateHourEmployee(row: Record<string, unknown>): LateHourEmployeeRow {
    return {
        employeeId:         row.employee_id as string,
        employeeName:       (row.employee_name as string | null) ?? null,
        rankCode:           (row.rank_code as string | null) ?? null,
        capacityRole:       (row.capacity_role as string | null) ?? null,
        costPerHour:        Number(row.cost_per_hour ?? 0),
        totalProgressHours: Number(row.total_progress_hours ?? 0),
        totalUsedHours:     Number(row.total_used_hours ?? 0),
        totalLateHours:     Number(row.total_late_hours ?? 0),
        totalLateCost:      Number(row.total_late_cost ?? 0),
        daysCount:          Number(row.days_count ?? 0),
    };
}

export function useProjectLateHours(projectId: string, asOf?: string) {
    return useQuery<ProjectLateHoursResponse>({
        queryKey: scheduleTrackingKeys.lateHoursForProject(projectId, asOf),
        enabled: !!projectId,
        staleTime: 30_000,
        queryFn: async () => {
            const { data } = await api.get(`/projects/${projectId}/late-hours-by-day`, {
                params: asOf ? { as_of: asOf } : undefined,
            });
            const meta = (data.meta ?? {}) as Record<string, unknown>;
            return {
                data:       ((data.data ?? []) as Record<string, unknown>[]).map(toLateHourLog),
                byEmployee: ((data.by_employee ?? []) as Record<string, unknown>[]).map(toLateHourEmployee),
                meta: {
                    projectId:      (meta.project_id as string) ?? projectId,
                    projectName:    (meta.project_name as string) ?? '',
                    asOf:           (meta.as_of as string | null) ?? null,
                    totalLateHours: Number(meta.total_late_hours ?? 0),
                    totalLateCost:  Number(meta.total_late_cost ?? 0),
                    logCount:       Number(meta.log_count ?? 0),
                },
            };
        },
    });
}

export interface ScheduleTrackingListParams {
    phase_code?: string;
    assignee_id?: string;
    status?: string;
    health?: string;
    state?: string;
    planned_date_from?: string;
    planned_date_to?: string;
    search?: string;
    sort?: string;
    direction?: 'asc' | 'desc';
    page?: number;
    per_page?: number;
    as_of?: string;
}

// ── Read hooks ───────────────────────────────────────────────────────────────

export function useTodaySchedule() {
    return useQuery({
        queryKey: scheduleTrackingKeys.today(),
        staleTime: 30_000,
        queryFn: async () => {
            const { data } = await api.get('/me/schedule-tracking/today');
            return {
                data: ((data.data as Record<string, unknown>[]) ?? []).map(toTodayItem),
                meta: data.meta as { employee_id: string | null; log_date: string },
            };
        },
    });
}

export function useScheduleTrackingList(projectId: string, params: ScheduleTrackingListParams = {}) {
    return useQuery({
        queryKey: scheduleTrackingKeys.listFor(projectId, params),
        enabled: !!projectId,
        staleTime: 15_000,
        queryFn: async () => {
            const { data } = await api.get(`/projects/${projectId}/schedule-tracking`, { params });
            return {
                data: ((data.data as Record<string, unknown>[]) ?? []).map(toTrackingRow),
                meta: data.meta as Record<string, unknown>,
            };
        },
    });
}

export function useProjectScheduleSummary(projectId: string, asOf?: string) {
    return useQuery({
        queryKey: [...scheduleTrackingKeys.summary(projectId), asOf ?? null],
        enabled: !!projectId,
        staleTime: 30_000,
        queryFn: async () => {
            const { data } = await api.get(`/projects/${projectId}/schedule-tracking/summary`, {
                params: asOf ? { as_of: asOf } : undefined,
            });
            return toSummary(data.data as Record<string, unknown>);
        },
    });
}

export function useProjectScheduleByAssignee(projectId: string, asOf?: string) {
    return useQuery({
        queryKey: [...scheduleTrackingKeys.byAssignee(projectId), asOf ?? null],
        enabled: !!projectId,
        staleTime: 30_000,
        queryFn: async () => {
            const { data } = await api.get(`/projects/${projectId}/schedule-tracking/by-assignee`, {
                params: asOf ? { as_of: asOf } : undefined,
            });
            return ((data.data as Record<string, unknown>[]) ?? []).map(toByAssignee);
        },
    });
}

export function usePhaseProgressLogs(phaseAssignmentId: string | null) {
    return useQuery({
        queryKey: phaseAssignmentId ? scheduleTrackingKeys.logsFor(phaseAssignmentId) : ['noop'],
        enabled: !!phaseAssignmentId,
        staleTime: 15_000,
        queryFn: async () => {
            const { data } = await api.get(`/phase-assignments/${phaseAssignmentId}/progress-logs`);
            return ((data.data as Record<string, unknown>[]) ?? []).map(toLog);
        },
    });
}

// ── Mutations ────────────────────────────────────────────────────────────────

interface LogProgressInput {
    phaseAssignmentId: string;
    progressHours: number;
    usedHours: number;
    note?: string;
    logDate?: string;
}

export function useLogProgress() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (input: LogProgressInput) => {
            const { data } = await api.post(
                `/phase-assignments/${input.phaseAssignmentId}/progress-logs`,
                {
                    progress_hours: input.progressHours,
                    used_hours: input.usedHours,
                    note: input.note,
                    log_date: input.logDate,
                },
            );
            return toLog(data.data ?? data);
        },
        onSuccess: () => {
            toast.success('Progress saved');
        },
        onError: (err) => {
            toast.error(`Failed to save progress: ${normalizeError(err).message}`);
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: scheduleTrackingKeys.all });
        },
    });
}

export function useUpdateProgressLog() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, logDate, progressHours, usedHours, note }: { id: string; logDate?: string; progressHours?: number; usedHours?: number; note?: string | null }) => {
            const payload: Record<string, unknown> = {};
            if (logDate !== undefined) payload.log_date = logDate;
            if (progressHours !== undefined) payload.progress_hours = progressHours;
            if (usedHours !== undefined) payload.used_hours = usedHours;
            if (note !== undefined) payload.note = note;
            const { data } = await api.patch(`/phase-progress-logs/${id}`, payload);
            return toLog(data.data ?? data);
        },
        onSuccess: () => {
            toast.success('Progress updated');
        },
        onError: (err) => {
            toast.error(`Failed to update progress: ${normalizeError(err).message}`);
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: scheduleTrackingKeys.all });
        },
    });
}

export function useDeleteProgressLog() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) => {
            try {
                await api.delete(`/phase-progress-logs/${id}`);
            } catch (err) {
                // 404 = the row is already gone (deleted in another tab, by an
                // AI re-assign cascade, or by a rapid second click). The
                // desired end state matches what the user wanted — swallow it
                // and let the cache invalidate so the stale row disappears.
                const status = (err as { response?: { status?: number } })?.response?.status;
                if (status !== 404) {
                    throw err;
                }
            }
            return id;
        },
        onError: (err) => {
            toast.error(`Failed to delete progress: ${normalizeError(err).message}`);
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: scheduleTrackingKeys.all });
        },
    });
}

export function useUnlockProgressLog() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) => {
            const { data } = await api.post(`/phase-progress-logs/${id}/unlock`);
            return toLog(data.data ?? data);
        },
        onSuccess: () => {
            toast.success('Log unlocked');
        },
        onError: (err) => {
            toast.error(`Failed to unlock log: ${normalizeError(err).message}`);
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: scheduleTrackingKeys.all });
        },
    });
}
