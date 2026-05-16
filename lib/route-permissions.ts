import type { Role } from '@/lib/rbac';

/**
 * Single source of truth for which app_role can access which org route.
 * Used by:
 *   - components/layout/Sidebar.tsx → filters which links to render
 *   - middleware.ts                 → redirects URL-jumps for unauthorized roles
 *
 * `'public'` means every authenticated org user (Admin, Executive, Sales, Delivery, HR)
 * can access the route. Otherwise the route is allowed only for the listed roles.
 *
 * Admins bypass all role checks via `canAccessRoute()` below; you don't need to
 * add 'Admin' to every list explicitly.
 *
 * Failure mode: if a path isn't listed here, `canAccessRoute()` returns true
 * (treats it as public). This is the safe default — it means adding a new
 * page does not silently lock anyone out until you remember to map it.
 */
export const ROUTE_PERMISSIONS: Record<string, Role[] | 'public'> = {
    // My Tasks is the only working surface for Delivery employees, so it is
    // public to every authenticated org user. /profile stays public so users
    // (including Delivery) can change their password and personal info.
    '/my-tasks':         'public',
    '/my-schedule':      'public',
    '/profile':          'public',

    // Dashboard and the manager pages exclude Delivery — they are pure
    // executors and shouldn't see organization-wide data.
    '/dashboard':        ['Executive', 'Sales', 'HR'],
    '/organization':     ['Executive', 'HR'],
    '/project-pipeline': ['Executive', 'Sales'],
    // /crm/* kept for one release as a backward-compat redirect target.
    // Phase D rename (chg-009) made /project-pipeline the canonical home.
    '/crm':              ['Executive', 'Sales'],
    '/estimation':       ['Executive', 'Sales'],
    '/contracts':        ['Executive', 'Sales'],
    '/projects':         ['Executive'],
    '/time-tracking':    ['Executive'],
    '/schedule-tracking':['Executive'],
    '/financial':        ['Executive'],
    '/forecast':         ['Executive'],
    '/tenant':           ['Executive'],
};

/**
 * Returns true if `role` may access the given path. Admins always pass.
 *
 * Path matching is "starts with the longest registered prefix that fits"
 * — so `/projects/123/edit` matches `/projects`. Subpaths inherit their
 * parent route's permission unless explicitly overridden in ROUTE_PERMISSIONS.
 */
export function canAccessRoute(role: Role | undefined | null, path: string): boolean {
    if (!role) return false;
    if (role === 'Admin') return true;

    const match = Object.keys(ROUTE_PERMISSIONS)
        .filter((prefix) => path === prefix || path.startsWith(prefix + '/'))
        .sort((a, b) => b.length - a.length)[0];

    if (!match) return true; // safe default: unmapped routes are public
    const allowed = ROUTE_PERMISSIONS[match];
    if (allowed === 'public') return true;
    return allowed.includes(role);
}

/**
 * The fallback path to redirect a non-permitted role to. Delivery users land
 * on My Tasks (their working surface); everyone else lands on the Dashboard.
 */
export function fallbackPathFor(role: Role | undefined | null): string {
    return role === 'Delivery' ? '/my-tasks' : '/dashboard';
}
