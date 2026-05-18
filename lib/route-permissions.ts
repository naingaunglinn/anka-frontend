import type { AuthUser } from '@/store/authStore';
import { hasPermission } from '@/lib/rbac';

/**
 * Single source of truth for which permission key gates each route.
 * Used by:
 *   - components/layout/Sidebar.tsx → filters which links to render
 *   - middleware.ts                 → redirects URL-jumps for unauthorized users
 *
 * `'public'` means every authenticated org user can access the route.
 * Otherwise the route is allowed only when the user holds the listed permission.
 *
 * Failure mode: if a path isn't listed here, `canAccessRoute()` returns true
 * (treats it as public). Safe default — a new page does not silently lock
 * anyone out until you remember to map it.
 *
 * NOTE: route-level visibility used to be role-based. It is now
 * permission-based so that tenant admins can hand out keys via
 * /tenant/roles and the sidebar follows automatically.
 */
export const ROUTE_PERMISSIONS: Record<string, string | 'public'> = {
    // My Schedule + /profile stay public to every authenticated org user.
    '/my-schedule':      'public',
    '/profile':          'public',

    '/dashboard':        'view_dashboard',
    '/organization':     'manage_organization',
    '/project-pipeline': 'view_crm',
    // /crm/* kept for one release as a backward-compat redirect target.
    '/crm':              'view_crm',
    '/estimation':       'manage_estimation',
    '/contracts':        'view_contracts',
    '/projects':         'view_projects',
    '/time-tracking':    'track_time',
    '/schedule-tracking':'view_schedule_tracking',
    '/financial':        'view_reports',
    '/forecast':         'view_reports',
    '/tenant':           'manage_tenant',
    '/tenant/roles':     'manage_tenant',
};

/**
 * Returns true if the user may access the given path. Super admins / users
 * with the `all` wildcard always pass.
 *
 * Path matching is "starts with the longest registered prefix that fits" —
 * so `/projects/123/edit` matches `/projects`.
 */
export function canAccessRoute(
    user: Pick<AuthUser, 'permissions' | 'isSuperAdmin'> | null | undefined,
    path: string,
): boolean {
    if (!user) return false;
    if (user.isSuperAdmin) return true;
    if (user.permissions?.includes('all')) return true;

    const match = Object.keys(ROUTE_PERMISSIONS)
        .filter((prefix) => path === prefix || path.startsWith(prefix + '/'))
        .sort((a, b) => b.length - a.length)[0];

    if (!match) return true; // safe default: unmapped routes are public
    const required = ROUTE_PERMISSIONS[match];
    if (required === 'public') return true;
    return hasPermission(user, required);
}

/**
 * The fallback path to redirect a non-permitted user to. Users without
 * view_dashboard land on My Schedule (their working surface).
 */
export function fallbackPathFor(
    user: Pick<AuthUser, 'permissions' | 'isSuperAdmin'> | null | undefined,
): string {
    if (user && hasPermission(user, 'view_dashboard')) return '/dashboard';
    return '/my-schedule';
}
