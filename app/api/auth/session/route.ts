import { NextRequest, NextResponse } from 'next/server';

// The __session cookie carries the Sanctum personal access token between page loads.
// httpOnly prevents any client-side JS (including third-party scripts) from reading it,
// which eliminates the most common XSS token-theft vector.
const COOKIE_NAME = '__session';

const COOKIE_OPTIONS = {
    httpOnly: true,
    // secure: only transmitted over HTTPS in production; allows HTTP in dev
    secure: process.env.NODE_ENV === 'production',
    // sameSite: 'lax' blocks the cookie on cross-site POST requests (CSRF protection)
    // while still allowing it on top-level navigations (GET links from other sites).
    sameSite: 'lax' as const,
    path: '/',
    // Match the Sanctum token TTL configured on the Laravel side (default 24 h).
    maxAge: 60 * 60 * 24,
};

// POST /api/auth/session
// Called immediately after a successful /auth/login response.
// The client posts the raw token here; this route handler bakes it into the
// httpOnly cookie so subsequent requests (and Edge Middleware) can verify auth
// without the token ever being stored in localStorage or readable cookies.
export async function POST(req: NextRequest) {
    let token: string | undefined;
    try {
        const body = await req.json();
        token = typeof body?.token === 'string' ? body.token : undefined;
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    if (!token) {
        return NextResponse.json({ error: 'token is required' }, { status: 400 });
    }

    const res = NextResponse.json({ ok: true });
    res.cookies.set(COOKIE_NAME, token, COOKIE_OPTIONS);
    return res;
}

// GET /api/auth/session
// Called by AuthInitializer on mount to re-hydrate the in-memory Zustand store
// after a page refresh (when in-memory state has been cleared).
// Returning the token here is safe: it is scoped to same-origin requests and the
// value ends up back in memory — not re-stored anywhere persistent by the client.
export async function GET(req: NextRequest) {
    const token = req.cookies.get(COOKIE_NAME)?.value;
    if (!token) {
        return NextResponse.json({ token: null }, { status: 401 });
    }
    return NextResponse.json({ token });
}

// DELETE /api/auth/session
// Called during logout (and on auth-unauthorized) to invalidate the session cookie.
// Setting maxAge: 0 instructs the browser to immediately expire and delete the cookie.
export async function DELETE() {
    const res = NextResponse.json({ ok: true });
    res.cookies.set(COOKIE_NAME, '', { ...COOKIE_OPTIONS, maxAge: 0 });
    return res;
}
