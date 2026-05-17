'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { canAccessRoute, fallbackPathFor } from '@/lib/route-permissions';

/**
 * Client-side route guard for dashboard pages.
 *
 * Renders nothing — its job is the side effect: when the auth user is loaded
 * and they don't have permission for the current path, replace the URL with
 * the user's fallback page (Dashboard if they hold view_dashboard,
 * else My Schedule).
 *
 * Why client-side and not middleware:
 *   The middleware-based version requires a third cookie (`__app_role`) carried
 *   alongside `__session` and `__role`. That's invasive to set up and easy to
 *   leave stale. Doing the check here is one render frame slower (small flicker
 *   on initial load if the user URL-jumps to a forbidden route) but doesn't
 *   touch the cookie/Edge layer at all.
 *
 * Failure modes:
 *   - `user` is null (not yet hydrated): no redirect, render normally.
 *   - Super admins bypass entirely; their own redirect rules live in middleware.ts.
 *   - Unmapped routes default to `canAccessRoute === true` (see lib/route-permissions.ts),
 *     so adding a new page never silently locks anyone out.
 */
export function RouteGuard() {
    const pathname = usePathname();
    const user = useAuthStore((s) => s.user);
    const router = useRouter();
    // Avoid loops if the fallback path itself isn't accessible (shouldn't happen,
    // since both /dashboard and /my-schedule are 'public', but defense in depth).
    const lastRedirected = useRef<string | null>(null);

    useEffect(() => {
        if (!user || user.isSuperAdmin) return;
        if (!pathname) return;
        if (canAccessRoute(user, pathname)) return;

        const fallback = fallbackPathFor(user);
        if (lastRedirected.current === fallback) return; // already tried, stop
        lastRedirected.current = fallback;
        router.replace(fallback);
    }, [user, pathname, router]);

    return null;
}
