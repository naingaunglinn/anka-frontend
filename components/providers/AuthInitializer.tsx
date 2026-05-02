'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useAuthStore } from '@/store/authStore';
import { ReactNode } from 'react';

export function AuthInitializer({ children }: { children: ReactNode }) {
    const router = useRouter();
    const token = useAuthStore((state) => state.token);
    const { isError } = useAuth();

    useEffect(() => {
        if (!token || isError) {
            router.replace('/login');
        }
    }, [token, isError, router]);

    return <>{children}</>;
}
