'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useAuthStore } from '@/store/authStore';
import { ReactNode } from 'react';

export function AuthInitializer({ children }: { children: ReactNode }) {
    const router = useRouter();
    const { setToken } = useAuthStore();
    const token = useAuthStore((state) => state.token);
    const { isError } = useAuth();

    // isHydrating prevents a flash-redirect to /login while we're checking
    // the __session httpOnly cookie.  We start hydrating only when the
    // in-memory token is absent (normal after a page refresh).
    const [isHydrating, setIsHydrating] = useState(!token);

    useEffect(() => {
        // If the in-memory store already has a token (e.g. just logged in, no refresh),
        // skip the cookie round-trip entirely.
        if (token) {
            setIsHydrating(false);
            return;
        }

        // Re-hydrate the in-memory Zustand store from the httpOnly __session cookie.
        // The GET /api/auth/session route handler reads the cookie server-side and
        // returns the token in the response body — the only controlled path back to JS.
        fetch('/api/auth/session')
            .then((r) => (r.ok ? r.json() : Promise.reject()))
            .then((data: { token?: string }) => {
                if (data?.token) {
                    setToken(data.token);
                    // useAuth's useQuery will automatically run /auth/me now that
                    // the token is set, populating the full user profile.
                } else {
                    router.replace('/login');
                }
            })
            .catch(() => router.replace('/login'))
            .finally(() => setIsHydrating(false));
    // Run once on mount only; token/setToken refs are stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (!isHydrating && isError) {
            router.replace('/login');
        }
    }, [isHydrating, isError, router]);

    // Render nothing while re-hydrating to avoid a layout flash or premature redirect.
    if (isHydrating) return null;

    return <>{children}</>;
}
