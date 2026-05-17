import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';

// ─────────────────────────────────────────────────────────────────────────
// Tenant-managed app roles + admin-editable permissions.
//
// Backend: app/Http/Controllers/Api/TenantAppRoleController.php
// Storage: tenant_app_roles + tenant_app_role_permissions
// Catalog: app/Support/PermissionCatalog.php (code-defined permission strings)
// ─────────────────────────────────────────────────────────────────────────

export interface TenantAppRole {
    id: string;
    name: string;
    description: string | null;
    isSystem: boolean;
    permissions: string[];
    createdAt: string | null;
    updatedAt: string | null;
}

export interface PermissionCatalogEntry {
    key: string;
    label: string;
    group: string;
    description: string | null;
}

export const tenantAppRoleKeys = {
    all:     ['tenant-app-roles'] as const,
    list:    () => [...tenantAppRoleKeys.all, 'list'] as const,
    catalog: () => ['permission-catalog'] as const,
};

function toRole(row: Record<string, unknown>): TenantAppRole {
    return {
        id:          row.id as string,
        name:        row.name as string,
        description: (row.description as string | null) ?? null,
        isSystem:    !!row.is_system,
        permissions: Array.isArray(row.permissions) ? (row.permissions as string[]) : [],
        createdAt:   (row.created_at as string | null) ?? null,
        updatedAt:   (row.updated_at as string | null) ?? null,
    };
}

export function useTenantAppRoles() {
    return useQuery<TenantAppRole[]>({
        queryKey: tenantAppRoleKeys.list(),
        queryFn: async () => {
            const { data: body } = await api.get('/tenant/app-roles');
            const rows = (body.data ?? []) as Record<string, unknown>[];
            return rows.map(toRole);
        },
        staleTime: 60_000,
    });
}

export function usePermissionCatalog() {
    return useQuery<PermissionCatalogEntry[]>({
        queryKey: tenantAppRoleKeys.catalog(),
        queryFn: async () => {
            const { data: body } = await api.get('/tenant/permission-catalog');
            return (body.data ?? []) as PermissionCatalogEntry[];
        },
        staleTime: 60 * 60_000, // catalog only changes on deploys
    });
}

export interface TenantAppRolePayload {
    name?: string;
    description?: string | null;
    permissions?: string[];
}

export function useTenantAppRoleMutations() {
    const qc = useQueryClient();

    const invalidate = () => {
        qc.invalidateQueries({ queryKey: tenantAppRoleKeys.list() });
        // Permissions on /auth/me may have changed for the current user too.
        qc.invalidateQueries({ queryKey: ['user'] });
    };

    const create = useMutation<TenantAppRole, Error, TenantAppRolePayload>({
        mutationFn: async (payload) => {
            const { data: body } = await api.post('/tenant/app-roles', payload);
            return toRole(body.data ?? body);
        },
        onSuccess: invalidate,
    });

    const update = useMutation<TenantAppRole, Error, { id: string; payload: TenantAppRolePayload }>({
        mutationFn: async ({ id, payload }) => {
            const { data: body } = await api.patch(`/tenant/app-roles/${id}`, payload);
            return toRole(body.data ?? body);
        },
        onSuccess: invalidate,
    });

    const remove = useMutation<void, Error, string>({
        mutationFn: async (id) => {
            await api.delete(`/tenant/app-roles/${id}`);
        },
        onSuccess: invalidate,
    });

    return { create, update, remove };
}
