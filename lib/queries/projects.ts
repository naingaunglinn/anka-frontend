import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { useBusinessStore } from '@/store/businessStore';
import { toProject } from '@/lib/dealsMapper';
import { normalizeError } from '@/lib/errorHandler';
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
        difficulty:   (row.difficulty as ProjectTaskAssignment['difficulty']) ?? '普通',
        totalHours:   Number(row.total_hours ?? 0),
        phases,
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
        allocatedHours:   Number(row.allocated_hours ?? 0),
        assignmentSource: (row.assignment_source as ProjectTeamAssignment['assignmentSource']) ?? 'manual',
        costPerHour:      row.cost_per_hour != null ? Number(row.cost_per_hour) : undefined,
        monthlySalary:    row.monthly_salary != null ? Number(row.monthly_salary) : undefined,
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
    tasks: (id: string) => [...projectKeys.detail(id), 'tasks'] as const,
};

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
        queryKey: projectKeys.tasks(projectId),
        queryFn: async () => {
            const { data: body } = await api.get(`/projects/${projectId}/task-assignments`);
            const rows = (body.data ?? []) as Record<string, unknown>[];
            const phases = ((body.meta?.active_phases ?? []) as Record<string, unknown>[]).map(toActivePhase);
            return {
                data: rows.map(toTaskAssignment),
                meta: { activePhases: phases },
            };
        },
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
        queryClient.invalidateQueries({ queryKey: projectKeys.tasks(projectId) });
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
