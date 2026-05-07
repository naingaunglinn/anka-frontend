'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore, type AuthUser } from '@/store/authStore';

function mapApiUser(raw: Record<string, unknown>): AuthUser {
    const tenant = raw.tenant as Record<string, unknown> | null | undefined;
    const isSuperAdmin = !!(raw.is_super_admin ?? raw.isSuperAdmin);

    return {
        id: raw.id as string,
        firstName: (raw.first_name ?? raw.firstName) as string,
        lastName: (raw.last_name ?? raw.lastName) as string,
        email: raw.email as string,
        appRole: ((raw.app_role ?? raw.appRole) as AuthUser['appRole']) ?? 'Executive',
        systemRole: (raw.system_role ?? raw.systemRole ?? 'member') as string,
        isSuperAdmin,
        tenant: tenant
            ? {
                id: (tenant.id as string) ?? '',
                name: (tenant.name as string) ?? '',
                slug: (tenant.slug as string) ?? '',
            }
            : null,
    };
}

function GoogleCallbackContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [status, setStatus] = useState('Finalizing Google sign-in...');

    useEffect(() => {
        const finalizeGoogleLogin = async () => {
            const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
            const queryString = searchParams.toString();

            if (!queryString) {
                setStatus('Google callback is missing required parameters.');
                return;
            }

            try {
                const res = await fetch(`${backendUrl}/api/auth/google/callback?${queryString}`, {
                    method: 'GET',
                    headers: {
                        Accept: 'application/json',
                        'Content-Type': 'application/json',
                    },
                    credentials: 'include',
                });

                if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    throw new Error(err?.message || 'Google login failed.');
                }

                const data = await res.json();
                const token = data?.token as string | undefined;
                const rawUser = (data?.user ?? data?.data?.user) as Record<string, unknown> | undefined;

                if (!token || !rawUser) {
                    throw new Error('Google login response is missing token/user payload.');
                }

                const user = mapApiUser(rawUser);

                await fetch('/api/auth/session', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token, is_super_admin: user.isSuperAdmin }),
                });

                useAuthStore.getState().login(user, token);
                router.replace(user.isSuperAdmin ? '/tenant' : '/dashboard');
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Google login failed.';
                setStatus(message);
            }
        };

        finalizeGoogleLogin();
    }, [router, searchParams]);

    return (
        <main className="flex min-h-screen items-center justify-center bg-[#f8fafc] px-6 text-[#171717]">
            <div className="w-full max-w-lg rounded-2xl border border-[#00a6f4]/20 bg-white p-8 text-center shadow-[0_18px_50px_rgba(0,0,0,0.08)]">
                <h1 className="text-2xl font-bold">ANKA Google Sign-In</h1>
                <p className="mt-3 text-sm text-[#171717]/70">{status}</p>
                <button
                    type="button"
                    onClick={() => router.replace('/login')}
                    className="mt-6 rounded-full bg-[#00a6f4] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#0599df]"
                >
                    Back to Login
                </button>
            </div>
        </main>
    );
}

export default function GoogleCallbackPage() {
    return (
        <Suspense fallback={
            <main className="flex min-h-screen items-center justify-center bg-[#f8fafc] px-6 text-[#171717]">
                <div className="w-full max-w-lg rounded-2xl border border-[#00a6f4]/20 bg-white p-8 text-center shadow-[0_18px_50px_rgba(0,0,0,0.08)]">
                    <h1 className="text-2xl font-bold">ANKA Google Sign-In</h1>
                    <p className="mt-3 text-sm text-[#171717]/70">Loading...</p>
                </div>
            </main>
        }>
            <GoogleCallbackContent />
        </Suspense>
    );
}
