import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { useBusinessStore } from '@/store/businessStore';
import { toProject } from '@/lib/dealsMapper';
import { normalizeError } from '@/lib/errorHandler';
import { scheduleTrackingKeys } from '@/lib/queries/scheduleTracking';
import type {
    Project,
    ProjectTeamAssignment,
    ProjectTaskAssignment,
    ProjectTaskPhaseAssignment,
    ProjectTaskAssignmentsPayload,
    ActivePhase,
    PhaseCode,
} from '@/types/business';
import type { PaginatedResponse } from '@/types/api';

function toPhaseAssignment(row: Record<string, unknown>): ProjectTaskPhaseAssignment {
    return {
        id:                 row.id as string,
        taskAssignmentId:   row.task_assignment_id as string,
        phaseCode:          row.phase_code as PhaseCode,
        phaseName:          (row.phase_name as string) ?? '',
        phaseOrder:         Number(row.phase_order ?? 0),
        estimatedHours:     Number(row.estimated_hours ?? 0),
        startDayHours:      row.start_day_hours !== null && row.start_day_hours !== undefined
            ? Number(row.start_day_hours)
            : null,
        assigneeId:         (row.assignee_id as string | null) ?? null,
        assigneeName:       (row.assignee_name as string | null) ?? null,
        assigneeRankId:     (row.assignee_rank_id as string | null) ?? null,
        assigneeRankCode:   (row.assignee_rank_code as ProjectTaskPhaseAssignment['assigneeRankCode']) ?? null,
        assigneeRankName:   (row.assignee_rank_name as string | null) ?? null,
        assignmentSource:   (row.assignment_source as ProjectTaskPhaseAssignment['assignmentSource']) ?? 'ai',
        plannedStart:       (row.planned_start as string | null) ?? null,
        plannedEnd:         (row.planned_end as string | null) ?? null,
        actualStart:        (row.actual_start as string | null) ?? null,
        actualEnd:          (row.actual_end as string | null) ?? null,
        status:             (row.status as ProjectTaskPhaseAssignment['status']) ?? '未着手',
    };
}

function toActivePhase(row: Record<string, unknown>): ActivePhase {
    return {
        code:  row.code as PhaseCode,
        name:  (row.name as string) ?? '',
        order: Number(row.order ?? 0),
    };
}

function toTeamAssignment(row: Record<string, unknown>): ProjectTeamAssignment {
    return {
        id:               row.id as string,
        projectId:        row.project_id as string,
        employeeId:       row.employee_id as string,
        employeeName:     (row.employee_name as string | null) ?? undefined,
        departmentName:   (row.department_name as string | null) ?? undefined,
        rankName:         (row.rank_name as string | null) ?? undefined,
        rankCode:         (row.rank_code as string | null) ?? undefined,
        allocatedHours:   Number(row.allocated_hours ?? 0),
        assignmentSource: (row.assignment_source as ProjectTeamAssignment['assignmentSource']) ?? 'manual',
        costPerHour:      row.cost_per_hour != null ? Number(row.cost_per_hour) : undefined,
        monthlySalary:    row.monthly_salary != null ? Number(row.monthly_salary) : undefined,
    };
}

function toTaskAssignment(row: Record<string, unknown>): ProjectTaskAssignment {
    const phases = Array.isArray(row.phases)
        ? (row.phases as Record<string, unknown>[]).map(toPhaseAssignment)
        : [];
    return {
        id:           row.id as string,
        projectId:    row.project_id as string,
        rowNo:        Number(row.row_no ?? 0),
        functionId:   (row.function_id as string | null) ?? null,
        functionName: (row.function_name as string) ?? '',
        category:     (row.category as string | null) ?? null,
        offshore:     (row.offshore as string | null) ?? null,
        difficulty:   (row.difficulty as ProjectTaskAssignment['difficulty']) ?? '',
        totalHours:   Number(row.total_hours ?? 0),
        phases,
    };
}

// ── Query key factory ────────────────────────────────────────────────────────

export const projectKeys = {
    all: ['projects'] as const,
    lists: () => [...projectKeys.all, 'list'] as const,
    list: (params: ProjectListParams = {}) => [...projectKeys.lists(), params] as const,
    details: () => [...projectKeys.all, 'detail'] as const,
    detail: (id: string) => [...projectKeys.details(), id] as const,
    team: (id: string) => [...projectKeys.detail(id), 'team'] as const,
    taskAssignments: (id: string) => [...projectKeys.detail(id), 'task-assignments'] as const,
    teamPlanPreview: (id: string) => [...projectKeys.detail(id), 'team-plan-preview'] as const,
    availableEmployees: (id: string) => [...projectKeys.detail(id), 'available-employees'] as const,
};

// ── Idle employee pool (TeamPreviewDialog manual picker) ─────────────────────

/**
 * An employee returned by `GET /projects/:id/available-employees` — an active
 * full-timer (≥160h workable) with zero rows in `project_team_assignments`.
 * Same shape as a `TeamPlanProposed` row's display fields so the dialog can
 * render them in the same `Manual` Select that holds the AI's pick.
 */
export interface AvailableEmployee {
    employeeId: string;
    name: string;
    rankCode: string | null;
    rankName: string | null;
    capacityRole: string | null;
    workableHours: number;
    monthlySalary: number;
}

function toAvailableEmployee(row: Record<string, unknown>): AvailableEmployee {
    return {
        employeeId:     row.employee_id as string,
        name:           (row.name as string) ?? '',
        rankCode:       (row.rank_code as string | null) ?? null,
        rankName:       (row.rank_name as string | null) ?? null,
        capacityRole:   (row.capacity_role as string | null) ?? null,
        workableHours:  Number(row.workable_hours ?? 0),
        monthlySalary:  Number(row.monthly_salary ?? 0),
    };
}

/**
 * Idle full-time employees the manager can pick from to override an AI
 * proposal or add a manual row in `TeamPreviewDialog`. Server-side filter
 * mirrors the new pool the AI itself draws from.
 */
export function useAvailableEmployees(projectId: string) {
    return useQuery<AvailableEmployee[]>({
        queryKey: projectKeys.availableEmployees(projectId),
        enabled: !!projectId,
        staleTime: 10_000,
        queryFn: async () => {
            const { data } = await api.get(`/projects/${projectId}/available-employees`);
            const rows = (data.data ?? []) as Record<string, unknown>[];
            return rows.map(toAvailableEmployee);
        },
    });
}

// ── Team plan preview (AI Task Assignment new flow) ──────────────────────────

export interface TeamPlanKept {
    employeeId: string;
    name: string | null;
    rankCode: string | null;
    rankName: string | null;
    capacityRole: string | null;
    /** Ghost-role this kept member was paired with at preview time. */
    ghostRoleId: string | null;
    /** Engagement months from the matched ghost role; 0 when unmatched. */
    months: number;
    allocatedHours: number;
    /** True when no ghost role of matching role_type was available to pair against. */
    unmatched: boolean;
}

export interface TeamPlanProposed {
    ghostRoleId: string;
    employeeId: string;
    employeeName: string | null;
    employeeRank: string | null;
    capacityRole: string | null;
    roleType: string;
    neededRank: string | null;
    /** Engagement months for this pick (= ghost_role.months). */
    months: number;
    /** Picked employee's monthly_salary — used for cost-envelope display. */
    monthlySalary: number;
    allocatedHours: number;
    rankMatch: 'exact' | 'downgrade' | 'upgrade' | 'split';
}

/**
 * Per-role-type capacity arithmetic returned by /plan-team. Powers the
 * "is this team correctly sized?" panel in TeamPreviewDialog. All hours
 * and money are absolute (not per-month).
 */
export interface TeamPlanCapacityRow {
    roleType: string;
    quantity: number;
    monthsMax: number;
    hoursBudget: number;
    hoursSupply: number;
    hoursShortfall: number;
    costBudget: number;
    costUsed: number;
    costOverrun: number;
}

export interface TeamPlanUnfilled {
    ghostRoleId: string;
    reason: string;
}

export interface TeamPlanRoleToFill {
    ghostRoleId: string;
    roleType: string;
    rankCode: string | null;
    rankName: string | null;
    quantityNeeded: number;
    minSalary: number;
    avgSalary: number;
    maxSalary: number;
    months: number;
}

export interface TeamPlanAllocationMeta {
    /** Xlsx grand total (sum of all task-phase hours in the project's estimation file). */
    grandTotal: number;
    /** Sum of allocated_hours across the entire team. Should equal grandTotal (±rounding). */
    sumOfAllocations: number;
    /** Basename of the xlsx the calculator read from. Display-only. */
    xlsxPath?: string;
}

export interface TeamPlanPreview {
    kept: TeamPlanKept[];
    proposed: TeamPlanProposed[];
    unfilled: TeamPlanUnfilled[];
    rolesToFill: TeamPlanRoleToFill[];
    message?: string;
    /**
     * Server-side allocation meta. Present when the backend computed
     * xlsx-driven allocations (which is now always required for plan-team).
     */
    allocation?: TeamPlanAllocationMeta;
    /**
     * Per-role capacity table: tells the user whether the picked team's
     * total engagement-hours and total cost fit inside the ghost-role budget.
     */
    capacityCheck: TeamPlanCapacityRow[];
}

function toTeamPlanKept(row: Record<string, unknown>): TeamPlanKept {
    return {
        employeeId:     row.employee_id as string,
        name:           (row.name as string | null) ?? null,
        rankCode:       (row.rank_code as string | null) ?? null,
        rankName:       (row.rank_name as string | null) ?? null,
        capacityRole:   (row.capacity_role as string | null) ?? null,
        ghostRoleId:    (row.ghost_role_id as string | null) ?? null,
        months:         Number(row.months ?? 0),
        allocatedHours: Number(row.allocated_hours ?? 0),
        unmatched:      Boolean(row.unmatched ?? false),
    };
}

function toTeamPlanProposed(row: Record<string, unknown>): TeamPlanProposed {
    return {
        ghostRoleId:    row.ghost_role_id as string,
        employeeId:     row.employee_id as string,
        employeeName:   (row.employee_name as string | null) ?? null,
        employeeRank:   (row.employee_rank as string | null) ?? null,
        capacityRole:   (row.capacity_role as string | null) ?? null,
        roleType:       (row.role_type as string) ?? '',
        neededRank:     (row.needed_rank as string | null) ?? null,
        months:         Number(row.months ?? 0),
        monthlySalary:  Number(row.monthly_salary ?? 0),
        allocatedHours: Number(row.allocated_hours ?? 0),
        rankMatch:      (row.rank_match as TeamPlanProposed['rankMatch']) ?? 'exact',
    };
}

function toCapacityRow(row: Record<string, unknown>): TeamPlanCapacityRow {
    return {
        roleType:       (row.role_type as string) ?? '',
        quantity:       Number(row.quantity ?? 0),
        monthsMax:      Number(row.months_max ?? 0),
        hoursBudget:    Number(row.hours_budget ?? 0),
        hoursSupply:    Number(row.hours_supply ?? 0),
        hoursShortfall: Number(row.hours_shortfall ?? 0),
        costBudget:     Number(row.cost_budget ?? 0),
        costUsed:       Number(row.cost_used ?? 0),
        costOverrun:    Number(row.cost_overrun ?? 0),
    };
}

function toTeamPlanRoleToFill(row: Record<string, unknown>): TeamPlanRoleToFill {
    return {
        ghostRoleId:    row.ghost_role_id as string,
        roleType:       (row.role_type as string) ?? '',
        rankCode:       (row.rank_code as string | null) ?? null,
        rankName:       (row.rank_name as string | null) ?? null,
        quantityNeeded: Number(row.quantity_needed ?? 0),
        minSalary:      Number(row.min_salary ?? 0),
        avgSalary:      Number(row.avg_salary ?? 0),
        maxSalary:      Number(row.max_salary ?? 0),
        months:         Number(row.months ?? 0),
    };
}

/**
 * Optional payload for the Regenerate flow. Pass the IDs of employees the AI
 * already suggested in earlier runs of this preview session so the next call
 * picks from a different (or smaller) pool. The backend enforces the exclusion
 * at the pool level — those employees won't even reach the AI prompt.
 */
export interface PlanTeamPreviewArgs {
    excludeEmployeeIds?: string[];
}

export function usePlanTeamPreview(projectId: string) {
    return useMutation({
        mutationFn: async (args?: PlanTeamPreviewArgs): Promise<TeamPlanPreview> => {
            const body: Record<string, unknown> = {};
            if (args?.excludeEmployeeIds && args.excludeEmployeeIds.length > 0) {
                body.exclude_employee_ids = args.excludeEmployeeIds;
            }
            const { data } = await api.post(`/projects/${projectId}/plan-team`, body);
            const allocation = data.allocation as Record<string, unknown> | undefined;
            return {
                kept:        ((data.kept ?? []) as Record<string, unknown>[]).map(toTeamPlanKept),
                proposed:    ((data.proposed ?? []) as Record<string, unknown>[]).map(toTeamPlanProposed),
                unfilled:    ((data.unfilled ?? []) as Record<string, unknown>[]).map((u) => ({
                    ghostRoleId: u.ghost_role_id as string,
                    reason:      (u.reason as string) ?? '',
                })),
                rolesToFill: ((data.roles_to_fill ?? []) as Record<string, unknown>[]).map(toTeamPlanRoleToFill),
                message:     (data.message as string | undefined) ?? undefined,
                allocation:  allocation
                    ? {
                        grandTotal:       Number(allocation.grand_total ?? 0),
                        sumOfAllocations: Number(allocation.sum_of_allocations ?? 0),
                        xlsxPath:         (allocation.xlsx_path as string | undefined) ?? undefined,
                    }
                    : undefined,
                capacityCheck: ((data.capacity_check ?? []) as Record<string, unknown>[]).map(toCapacityRow),
            };
        },
        onError: (err) => toast.error(`Team preview failed: ${normalizeError(err).message}`),
    });
}

/**
 * Confirm-team payload — `employeeId` is required; `ghostRoleId` links the
 * pick back to the role it fills so the backend can store
 * allocated_hours = workable_hours × ghost_role.months for that pick.
 * `allocatedHours` is optional and only used by manual additions where the
 * user wants to override the engagement-window default (e.g. assigning a
 * shared expert for fewer hours than a full ghost-role engagement).
 */
export interface ConfirmTeamPick {
    employeeId: string;
    ghostRoleId?: string;
    allocatedHours?: number;
}

export function useConfirmTeamPlan(projectId: string) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (picks: ConfirmTeamPick[]) => {
            const { data } = await api.post(`/projects/${projectId}/confirm-team`, {
                picks: picks.map((p) => ({
                    employee_id:   p.employeeId,
                    ghost_role_id: p.ghostRoleId,
                    // Only include when explicitly set — otherwise the backend
                    // falls back to workable_hours × ghost_role.months.
                    ...(p.allocatedHours !== undefined ? { allocated_hours: p.allocatedHours } : {}),
                })),
            });
            return data as { inserted: number; data: unknown };
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: projectKeys.team(projectId) });
            queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId) });
            queryClient.invalidateQueries({ queryKey: projectKeys.lists() });
        },
        onError: (err) => toast.error(`Confirm team failed: ${normalizeError(err).message}`),
    });
}

export interface ProjectListParams {
    page?: number;
    per_page?: number;
    contract_id?: string;
    status?: Project['status'];
}

// ── Read hooks ───────────────────────────────────────────────────────────────

/**
 * Fetches a paginated list of projects from `GET /projects`.
 *
 * Projects are created by the `win_deal()` stored proc and can be optionally
 * filtered by `contract_id` or `status`.
 *
 * @param params Optional pagination and filter params.
 */
export function useProjectList(params: ProjectListParams = {}) {
    return useQuery<PaginatedResponse<Project>>({
        queryKey: projectKeys.list(params),
        queryFn: async () => {
            const { data: body } = await api.get('/projects', { params });
            const projects = (body.data ?? []).map(toProject);
            useBusinessStore.setState({ projects });
            return { ...body, data: projects } as PaginatedResponse<Project>;
        },
        staleTime: 30_000,
    });
}

/**
 * Fetches a single project by ID from `GET /projects/:id`.
 *
 * @param id Project UUID. Query is disabled when `id` is empty.
 */
export function useProjectDetail(id: string) {
    return useQuery<Project>({
        queryKey: projectKeys.detail(id),
        queryFn: async () => {
            const { data: body } = await api.get(`/projects/${id}`);
            return toProject(body.data ?? body);
        },
        enabled: !!id,
    });
}

/**
 * Fetches team assignments for a project from `GET /projects/:id/team`.
 *
 * @param id Project UUID. Query is disabled when `id` is empty.
 */
export function useProjectTeam(id: string) {
    return useQuery<ProjectTeamAssignment[]>({
        queryKey: projectKeys.team(id),
        queryFn: async () => {
            const { data: body } = await api.get(`/projects/${id}/team`);
            const rows = (body.data ?? body ?? []) as Record<string, unknown>[];
            return rows.map(toTeamAssignment);
        },
        enabled: !!id,
        staleTime: 10_000,
    });
}

/**
 * Fetches persisted per-phase task assignments for a project.
 *
 * Returns the full `{ data, meta: { activePhases } }` payload so every caller
 * shares one cache slot under `projectKeys.taskAssignments(projectId)`. If
 * different callers wrote different shapes to the same key, whichever mounted
 * second would corrupt the cache for the other (`tasks.map is not a function`
 * vs `cannot read meta.activePhases`).
 *
 * Callers that only need the rows should read `.data` off the payload.
 */
export async function fetchProjectTaskAssignments(projectId: string): Promise<ProjectTaskAssignmentsPayload> {
    const { data: body } = await api.get(`/projects/${projectId}/task-assignments`);
    const rows = (body.data ?? []) as Record<string, unknown>[];
    const phases = ((body.meta?.active_phases ?? []) as Record<string, unknown>[]).map(toActivePhase);
    return {
        data: rows.map(toTaskAssignment),
        meta: { activePhases: phases },
    };
}

/**
 * Team-editing mutations: add member, remove member, run AI auto-assign.
 *
 * All three invalidate both the project's team query (so the roster refetches)
 * and the project list query (so the `team_size` rollup column updates).
 */
export function useProjectTeamMutations(projectId: string) {
    const queryClient = useQueryClient();

    const invalidate = () => {
        queryClient.invalidateQueries({ queryKey: projectKeys.team(projectId) });
        queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId) });
        queryClient.invalidateQueries({ queryKey: projectKeys.lists() });
    };

    const assignMember = useMutation({
        mutationFn: async ({ employeeId, allocatedHours }: { employeeId: string; allocatedHours: number }) => {
            const { data } = await api.post(`/projects/${projectId}/team`, {
                employee_id: employeeId,
                allocated_hours: allocatedHours,
            });
            return toTeamAssignment(data.data ?? data);
        },
        onSuccess: () => toast.success('Team member added.'),
        onError: (err) => toast.error(`Failed to add member: ${normalizeError(err).message}`),
        onSettled: invalidate,
    });

    const removeMember = useMutation({
        mutationFn: (assignmentId: string) =>
            api.delete(`/projects/${projectId}/team/${assignmentId}`),
        onSuccess: () => toast.success('Team member removed.'),
        onError: (err) => toast.error(`Failed to remove member: ${normalizeError(err).message}`),
        onSettled: invalidate,
    });

    /**
     * Re-runs AI staffing for the project. Destructive: the backend wipes the
     * existing roster and rebuilds it. The UI confirms before calling.
     */
    const autoAssignTeam = useMutation({
        mutationFn: async () => {
            const { data } = await api.post(`/projects/${projectId}/auto-assign`);
            const rows = (data.data ?? data ?? []) as Record<string, unknown>[];
            return rows.map(toTeamAssignment);
        },
        onSuccess: (rows) => toast.success(`Team rebuilt — ${rows.length} ${rows.length === 1 ? 'member' : 'members'} assigned.`),
        onError: (err) => toast.error(`AI auto-assign failed: ${normalizeError(err).message}`),
        onSettled: invalidate,
    });

    return { assignMember, removeMember, autoAssignTeam };
}

// ── Task Assignments (xlsx-driven AI allocation) ─────────────────────────────

/**
 * Fetches persisted per-phase task assignments for a project from
 * `GET /projects/:id/task-assignments`. Used by the Master Assign Table.
 *
 * Returns both `data` (task rows with nested `phases[]`) and `meta.activePhases`
 * (the dynamic column set for the table header).
 */
export function useProjectTaskAssignments(projectId: string) {
    return useQuery<ProjectTaskAssignmentsPayload>({
        queryKey: projectKeys.taskAssignments(projectId),
        queryFn: () => fetchProjectTaskAssignments(projectId),
        enabled: !!projectId,
        staleTime: 10_000,
    });
}

/**
 * Mutations for the Master Assign Table.
 *
 * `assignTasks` triggers the backend to read Estimate.xlsx and ask Claude to
 * map each (task × phase) to a current team member (destructive: wipes existing
 * rows for the project).
 *
 * `updatePhaseAssignment` powers inline edits to assignee / dates / status on a
 * specific phase cell.
 */
export function useProjectTaskMutations(projectId: string) {
    const queryClient = useQueryClient();

    const invalidate = () => {
        queryClient.invalidateQueries({ queryKey: projectKeys.taskAssignments(projectId) });
        // AI re-assign destructively wipes project_task_phase_assignments,
        // which cascade-deletes phase_progress_logs via FK. Schedule-tracking
        // caches (master grid badges, drill-down drawer logs, summary KPIs)
        // would hold phantom rows pointing at deleted log IDs and 404 on
        // subsequent actions. Invalidate them too.
        queryClient.invalidateQueries({ queryKey: scheduleTrackingKeys.all });
    };

    const assignTasks = useMutation({
        mutationFn: async (): Promise<ProjectTaskAssignmentsPayload> => {
            const { data } = await api.post(`/projects/${projectId}/assign-tasks`);
            const rows = (data.data ?? []) as Record<string, unknown>[];
            const phases = ((data.meta?.active_phases ?? []) as Record<string, unknown>[]).map(toActivePhase);
            return {
                data: rows.map(toTaskAssignment),
                meta: { activePhases: phases },
            };
        },
        onSuccess: ({ data, meta }) =>
            toast.success(
                `AI assigned ${data.length} ${data.length === 1 ? 'task' : 'tasks'} across ${meta.activePhases.length} ${meta.activePhases.length === 1 ? 'phase' : 'phases'}.`
            ),
        onError: (err) => toast.error(`Task assignment failed: ${normalizeError(err).message}`),
        onSettled: invalidate,
    });

    const updatePhaseAssignment = useMutation({
        mutationFn: async ({ phaseAssignmentId, updates }: { phaseAssignmentId: string; updates: Partial<ProjectTaskPhaseAssignment> }) => {
            const payload: Record<string, unknown> = {};
            if ('assigneeId' in updates) payload.assignee_id = updates.assigneeId;
            if ('plannedStart' in updates) payload.planned_start = updates.plannedStart;
            if ('plannedEnd' in updates) payload.planned_end = updates.plannedEnd;
            if ('actualStart' in updates) payload.actual_start = updates.actualStart;
            if ('actualEnd' in updates) payload.actual_end = updates.actualEnd;
            if ('status' in updates) payload.status = updates.status;
            const { data } = await api.patch(
                `/projects/${projectId}/task-phase-assignments/${phaseAssignmentId}`,
                payload,
            );
            return toPhaseAssignment(data.data ?? data);
        },
        onError: (err) => toast.error(`Update failed: ${normalizeError(err).message}`),
        onSettled: invalidate,
    });

    return { assignTasks, updatePhaseAssignment };
}

// ── Phase Reassignment ──────────────────────────────────────────────────────

export function useCheckReassignment(projectId: string) {
    return useMutation({
        mutationFn: async ({ phaseAssignmentId, assigneeId }: { phaseAssignmentId: string; assigneeId: string }) => {
            const { data } = await api.post(
                `/projects/${projectId}/task-phase-assignments/${phaseAssignmentId}/check-reassignment`,
                { assignee_id: assigneeId },
            );
            const d = data as Record<string, unknown>;
            const conflicts = (d.conflicts as Record<string, unknown>[] ?? []).map((c) => ({
                phaseAssignmentId: c.phase_assignment_id as string,
                phaseName:         c.phase_name as string,
                phaseCode:         c.phase_code as string,
                functionName:      c.function_name as string,
                projectName:       c.project_name as string,
                plannedStart:      c.planned_start as string,
                plannedEnd:        c.planned_end as string,
                estimatedHours:    Number(c.estimated_hours ?? 0),
            }));
            const rd = d.readjusted_dates as Record<string, unknown> | null;
            const cascade = (d.cascade_preview as Record<string, unknown>[] ?? []).map((c) => ({
                phaseAssignmentId: c.phase_assignment_id as string,
                phaseName:         c.phase_name as string,
                functionName:      c.function_name as string,
                originalStart:     c.original_start as string,
                originalEnd:       c.original_end as string,
                newStart:          c.new_start as string,
                newEnd:            c.new_end as string,
            }));
            const reverseConflicts = (d.reverse_conflicts as Record<string, unknown>[] ?? []).map((rc) => ({
                swapPhaseId:   rc.swap_phase_id as string,
                swapPhaseName: rc.swap_phase_name as string,
                conflicts: (rc.conflicts as Record<string, unknown>[] ?? []).map((c) => ({
                    phaseAssignmentId: c.phase_assignment_id as string,
                    phaseName:         c.phase_name as string,
                    phaseCode:         c.phase_code as string,
                    functionName:      c.function_name as string,
                    projectName:       c.project_name as string,
                    plannedStart:      c.planned_start as string,
                    plannedEnd:        c.planned_end as string,
                    estimatedHours:    Number(c.estimated_hours ?? 0),
                })),
            }));
            return {
                hasConflicts:    Boolean(d.has_conflicts),
                conflicts,
                reverseConflicts,
                readjustedDates: rd ? { plannedStart: rd.planned_start as string, plannedEnd: rd.planned_end as string } : null,
                cascadePreview:  cascade,
                warnings:        (d.warnings as string[]) ?? [],
                remainingHours:  Number(d.remaining_hours ?? 0),
            };
        },
    });
}

export function useReassignPhase(projectId: string) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (input: {
            phaseAssignmentId: string;
            assigneeId: string;
            mode: 'direct' | 'readjust' | 'swap' | 'assign_anyway';
            swapWithId?: string;
        }) => {
            const { data } = await api.post(
                `/projects/${projectId}/task-phase-assignments/${input.phaseAssignmentId}/reassign`,
                {
                    assignee_id: input.assigneeId,
                    mode: input.mode,
                    swap_with_phase_assignment_id: input.swapWithId,
                },
            );
            return data;
        },
        onSuccess: () => {
            toast.success('Phase reassigned successfully');
        },
        onError: (err) => {
            toast.error(`Reassignment failed: ${normalizeError(err).message}`);
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: projectKeys.taskAssignments(projectId) });
            queryClient.invalidateQueries({ queryKey: scheduleTrackingKeys.all });
        },
    });
}

// ── Mutation hooks ───────────────────────────────────────────────────────────

/**
 * Returns mutation hooks for project operations.
 *
 * Projects cannot be created from the frontend — they are produced by the
 * `win_deal()` stored proc. `update` (status, budget hours, dates) and
 * `delete` are exposed here.
 *
 * Each mutation follows the optimistic-update pattern:
 * snapshot → apply to Zustand → call API → restore on error / invalidate on settled.
 */
export function useProjectMutations() {
    const queryClient = useQueryClient();

    const updateProject = useMutation({
        mutationFn: ({ id, updates }: { id: string; updates: Partial<Project> }) =>
            useBusinessStore.getState().updateProject(id, updates),
        onSettled: (_data, _err, { id }) => {
            queryClient.invalidateQueries({ queryKey: projectKeys.detail(id) });
            queryClient.invalidateQueries({ queryKey: projectKeys.lists() });
        },
    });

    const deleteProject = useMutation({
        mutationFn: (id: string) =>
            useBusinessStore.getState().deleteProject(id),
        onSettled: () =>
            queryClient.invalidateQueries({ queryKey: projectKeys.all }),
    });

    return { updateProject, deleteProject };
}
