import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// All route prefixes that require an authenticated session.
// The /api/auth/* routes are intentionally excluded so the session handler
// itself is always reachable (even when logged out).
const PROTECTED_PREFIXES = [
    '/crm', '/organization', '/estimation', '/contracts',
    '/projects', '/time-tracking', '/financial', '/forecast',
    '/tenant', '/dashboard',
];

export function middleware(request: NextRequest) {
    const path = request.nextUrl.pathname;
    const isPublicPath = path === '/login' || path === '/register';

    // The __session cookie is httpOnly — its value cannot be read by client-side JS.
    // Edge Middleware running on the server can read it, which is the whole point:
    // route protection without exposing the raw Sanctum token to the browser.
    const token = request.cookies.get('__session')?.value;

    // Authenticated users hitting /login are redirected to the default landing page.
    if (isPublicPath && token) {
        return NextResponse.redirect(new URL('/crm', request.nextUrl));
    }

    // Unauthenticated users trying to reach a protected route are sent to login.
    if (!isPublicPath && !token) {
        const isProtected = PROTECTED_PREFIXES.some((prefix) => path.startsWith(prefix));
        if (isProtected) {
            return NextResponse.redirect(new URL('/login', request.nextUrl));
        }
    }
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
        '/financial/:path*',
        '/forecast/:path*',
        '/tenant/:path*',
        '/login',
    ],
};
