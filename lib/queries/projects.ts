import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { useBusinessStore } from '@/store/businessStore';
import { toProject } from '@/lib/dealsMapper';
import type { Project } from '@/types/business';
import type { PaginatedResponse } from '@/types/api';

// ── Query key factory ────────────────────────────────────────────────────────

export const projectKeys = {
    all: ['projects'] as const,
    lists: () => [...projectKeys.all, 'list'] as const,
    list: (params: ProjectListParams = {}) => [...projectKeys.lists(), params] as const,
    details: () => [...projectKeys.all, 'detail'] as const,
    detail: (id: string) => [...projectKeys.details(), id] as const,
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
