import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { canAccessRoute, fallbackPathFor } from '@/lib/route-permissions';

// Routes only org users can access.
const ORG_PREFIXES = [
    '/crm', '/organization', '/estimation', '/contracts',
    '/projects', '/team-assignment', '/schedule-tracking', '/my-schedule',
    '/financial', '/forecast', '/dashboard',
    '/profile',
];

// Routes only super admins can access.
// /tenant is shared: the page renders OrgTenantSettings vs SuperAdminTenantManagement
// based on isSuperAdmin, so it is not listed here.
const SUPER_ADMIN_PREFIXES = ['/admin'];

export function middleware(request: NextRequest) {
    const path = request.nextUrl.pathname;
    const isLoginPage = path === '/login' || path === '/register';

    const token = request.cookies.get('__session')?.value;
    const role = request.cookies.get('__role')?.value; // 'super_admin' | 'member' | undefined
    const permsCookie = request.cookies.get('__perms')?.value ?? '';
    const isSuperAdmin = role === 'super_admin';
    const isAuthenticated = !!token;
    // __perms is comma-separated. Empty string → empty list. "all" is a wildcard
    // (super admins and the default Admin role both carry it).
    const permissions = permsCookie ? permsCookie.split(',').filter(Boolean) : [];

    // ── Unauthenticated ────────────────────────────────────────────────────
    if (!isAuthenticated) {
        const isProtected = [...ORG_PREFIXES, ...SUPER_ADMIN_PREFIXES].some((p) =>
            path.startsWith(p)
        );
        if (isProtected) {
            return NextResponse.redirect(new URL('/login', request.nextUrl));
        }
        return NextResponse.next();
    }

    // ── Authenticated ──────────────────────────────────────────────────────

    // Redirect away from login page.
    if (isLoginPage) {
        const dest = isSuperAdmin ? '/admin/dashboard' : '/dashboard';
        return NextResponse.redirect(new URL(dest, request.nextUrl));
    }

    // Block super admin from org routes → send them to admin dashboard.
    if (isSuperAdmin) {
        const isOrgRoute = ORG_PREFIXES.some((p) => path.startsWith(p));
        if (isOrgRoute) {
            return NextResponse.redirect(new URL('/admin/dashboard', request.nextUrl));
        }
        return NextResponse.next();
    }

    // Block org users from super admin routes → send them to dashboard.
    const isSuperAdminRoute = SUPER_ADMIN_PREFIXES.some((p) => path.startsWith(p));
    if (isSuperAdminRoute) {
        return NextResponse.redirect(new URL('/dashboard', request.nextUrl));
    }

    // App-role permission gate. Without __perms (legacy cookie not yet refreshed
    // post-login from an older session) fall through to client-side gating —
    // failing closed at the edge would log the user out of pages they have
    // valid in-memory access to. Once __perms is populated by the next
    // /auth/me cycle, the edge gate kicks in.
    if (permsCookie) {
        const user = { permissions, isSuperAdmin: false };
        if (!canAccessRoute(user, path)) {
            return NextResponse.redirect(new URL(fallbackPathFor(user), request.nextUrl));
        }
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        '/dashboard/:path*',
        '/crm/:path*',
        '/organization/:path*',
        '/estimation/:path*',
        '/contracts/:path*',
        '/projects/:path*',
        '/team-assignment/:path*',
        '/schedule-tracking/:path*',
        '/my-schedule/:path*',
        '/financial/:path*',
        '/forecast/:path*',
        '/profile/:path*',
        '/tenant/:path*',
        '/admin/:path*',
        '/login',
    ],
};
