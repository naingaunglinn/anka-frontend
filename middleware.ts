import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Routes only org users can access.
const ORG_PREFIXES = [
    '/crm', '/organization', '/estimation', '/contracts',
    '/projects', '/time-tracking', '/my-tasks', '/financial', '/forecast', '/dashboard',
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
    const isSuperAdmin = role === 'super_admin';
    const isAuthenticated = !!token;

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
        '/time-tracking/:path*',
        '/my-tasks/:path*',
        '/financial/:path*',
        '/forecast/:path*',
        '/profile/:path*',
        '/tenant/:path*',
        '/admin/:path*',
        '/login',
    ],
};
