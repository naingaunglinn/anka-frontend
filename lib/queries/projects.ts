import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { useBusinessStore } from '@/store/businessStore';
import { toProject } from '@/lib/dealsMapper';
import { normalizeError } from '@/lib/errorHandler';
import type { Project, ProjectTaskAssignment, ProjectTeamAssignment } from '@/types/business';
import type { PaginatedResponse } from '@/types/api';

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

function toTaskAssignment(row: Record<string, unknown>): ProjectTaskAssignment {
    return {
        id: row.id as string,
        projectId: row.project_id as string,
        rowNo: Number(row.row_no ?? 0),
        functionId: (row.function_id as string | null) ?? undefined,
        functionName: (row.function_name as string | null) ?? 'Task',
        category: (row.category as string | null) ?? null,
        offshore: (row.offshore as string | null) ?? null,
        difficulty: (row.difficulty as string | null) ?? null,
        totalHours: Number(row.total_hours ?? 0),
        assigneeId: (row.assignee_id as string | null) ?? null,
        assigneeName: (row.assignee_name as string | null) ?? undefined,
        assigneeRankId: (row.assignee_rank_id as string | null) ?? null,
        assigneeRankCode: (row.assignee_rank_code as string | null) ?? null,
        assigneeRankName: (row.assignee_rank_name as string | null) ?? null,
        assignmentSource: (row.assignment_source as string | null) ?? null,
        plannedStart: (row.planned_start as string | null) ?? undefined,
        plannedEnd: (row.planned_end as string | null) ?? undefined,
        actualStart: (row.actual_start as string | null) ?? undefined,
        actualEnd: (row.actual_end as string | null) ?? undefined,
        status: (row.status as string | null) ?? null,
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

export async function fetchProjectTaskAssignments(projectId: string): Promise<ProjectTaskAssignment[]> {
    const { data: body } = await api.get(`/projects/${projectId}/task-assignments`);
    const rows = (body.data ?? body ?? []) as Record<string, unknown>[];
    return rows.map(toTaskAssignment);
}

export function useProjectTaskAssignments(id: string) {
    return useQuery<ProjectTaskAssignment[]>({
        queryKey: projectKeys.taskAssignments(id),
        queryFn: () => fetchProjectTaskAssignments(id),
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
