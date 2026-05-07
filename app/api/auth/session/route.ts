import { NextRequest, NextResponse } from 'next/server';

// The __session cookie carries the Sanctum personal access token between page loads.
// httpOnly prevents any client-side JS (including third-party scripts) from reading it,
// which eliminates the most common XSS token-theft vector.
const COOKIE_NAME = '__session';
const ROLE_COOKIE = '__role';

const COOKIE_OPTIONS = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 60 * 60 * 24,
};

// __role is readable by Edge Middleware (server-side) but NOT by client JS (httpOnly).
// It lets middleware route super_admin to /tenant and block them from org routes.
const ROLE_OPTIONS = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 60 * 60 * 24,
};

// POST /api/auth/session
export async function POST(req: NextRequest) {
    let token: string | undefined;
    let isSuperAdmin = false;
    try {
        const body = await req.json();
        token = typeof body?.token === 'string' ? body.token : undefined;
        isSuperAdmin = body?.is_super_admin === true;
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    if (!token) {
        return NextResponse.json({ error: 'token is required' }, { status: 400 });
    }

    const res = NextResponse.json({ ok: true });
    res.cookies.set(COOKIE_NAME, token, COOKIE_OPTIONS);
    res.cookies.set(ROLE_COOKIE, isSuperAdmin ? 'super_admin' : 'member', ROLE_OPTIONS);
    return res;
}

// GET /api/auth/session
export async function GET(req: NextRequest) {
    const token = req.cookies.get(COOKIE_NAME)?.value;
    if (!token) {
        return NextResponse.json({ token: null }, { status: 401 });
    }
    return NextResponse.json({ token });
}

// DELETE /api/auth/session
export async function DELETE() {
    const res = NextResponse.json({ ok: true });
    res.cookies.set(COOKIE_NAME, '', { ...COOKIE_OPTIONS, maxAge: 0 });
    res.cookies.set(ROLE_COOKIE, '', { ...ROLE_OPTIONS, maxAge: 0 });
    return res;
}
