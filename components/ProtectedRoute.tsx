'use client';

import { useAuth } from '@/hooks/useAuth';
import { ReactNode, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';

export interface ProtectedRouteProps {
    children: ReactNode;
    allowedRoles?: string[];
}

export function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
    const { user, isLoading } = useAuth();
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        if (isLoading) return;

        if (!user) {
            router.push(`/login?redirect=${encodeURIComponent(pathname)}`);
            return;
        }

        if (allowedRoles && user.appRole) {
            const hasRole = allowedRoles.includes(user.appRole);
            if (!hasRole) {
                router.push('/unauthorized');
                return;
            }
        }
    }, [user, isLoading, allowedRoles, router, pathname]);

    if (isLoading) return <div className="flex h-screen w-full items-center justify-center">Loading...</div>;

    if (!user) return null;

    return <>{children}</>;
}
