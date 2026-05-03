import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
    // Basic protection: if we are trying to access dashboard/auth routes
    const path = request.nextUrl.pathname;

    const isPublicPath = path === '/login' || path === '/register';

    // In a real application, you would verify the JWT token here
    // For now, checking local auth state isn't directly possible in Edge Middleware without parsing cookies.
    // Assuming the user token would be stored in mostly cookies for SSR setups.
    // If you use LocalStorage, Middleware CANNOT read it. You need a client-side wrapper or sync LocalStorage to cookies.
    // Here we'll implement a basic check looking for an 'auth_token' cookie.

    const token = request.cookies.get('auth_token')?.value;

    if (isPublicPath && token) {
        return NextResponse.redirect(new URL('/dashboard', request.nextUrl));
    }

    if (!isPublicPath && !token) {
        // Only redirect dashboard routes
        if (path.startsWith('/dashboard') || path.startsWith('/crm') || path.startsWith('/organization') || path.startsWith('/estimation') || path.startsWith('/contracts') || path.startsWith('/projects') || path.startsWith('/time-tracking') || path.startsWith('/financial') || path.startsWith('/forecast') || path.startsWith('/tenant')) {
            return NextResponse.redirect(new URL('/login', request.nextUrl));
        }
    }
}

// See "Matching Paths" below to learn more
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
        '/login'
    ],
};
