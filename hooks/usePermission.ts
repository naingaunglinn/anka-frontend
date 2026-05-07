import { useAuthStore } from '@/store/authStore';
import { hasPermission, type Role } from '@/lib/rbac';

interface UsePermissionResult {
    allowed: boolean;
    // Human-readable reason shown in the tooltip when allowed is false.
    reason: string;
}

/**
 * Returns whether the current user holds a given RBAC permission.
 *
 * Usage:
 *   const { allowed, reason } = usePermission('manage_crm');
 *
 * Always render the guarded element — use `allowed` to disable it and show
 * `reason` in a tooltip. Never conditionally hide elements based on permission:
 * hidden controls create confusion about whether a feature exists at all.
 */
export function usePermission(permission: string): UsePermissionResult {
    const user = useAuthStore((state) => state.user);

    if (!user) {
        return { allowed: false, reason: 'You must be logged in to perform this action.' };
    }

    const allowed = hasPermission(user.appRole as Role, permission);
    const reason = allowed
        ? ''
        : `Your role (${user.appRole}) does not have permission to perform this action.`;

    return { allowed, reason };
}
