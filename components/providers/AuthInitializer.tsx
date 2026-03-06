'use client';

import { useAuth } from '@/hooks/useAuth';
import { ReactNode } from 'react';

export function AuthInitializer({ children }: { children: ReactNode }) {
    useAuth(); // Hydrates Zustand store with user profile on app mount
    return <>{children}</>;
}
