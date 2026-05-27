/**
 * Permission checking is per-user now (not per-role). The user's effective
 * permission list comes from /auth/me, which the backend resolves against
 * tenant_app_role_permissions for the user's role row.
 *
 * Pass either a string[] (typically `user.permissions`) or an AuthUser-like
 * object. The 'all' wildcard short-circuits to true for super admins and the
 * default Admin role.
 */
import type { AuthUser } from '@/store/authStore';

type PermSource = string[] | Pick<AuthUser, 'permissions' | 'isSuperAdmin'> | null | undefined;

function listFor(source: PermSource): string[] {
    if (!source) return [];
    if (Array.isArray(source)) return source;
    if (source.isSuperAdmin) return ['all'];
    return source.permissions ?? [];
}

export const hasPermission = (source: PermSource, permission: string): boolean => {
    const list = listFor(source);
    if (list.includes('all')) return true;
    return list.includes(permission);
};
