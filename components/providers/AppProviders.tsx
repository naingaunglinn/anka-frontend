'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { useState, ReactNode } from 'react';
import { AuthInitializer } from './AuthInitializer';

export function AppProviders({ children }: { children: ReactNode }) {
    const [queryClient] = useState(() => new QueryClient());

    return (
        <QueryClientProvider client={queryClient}>
            <AuthInitializer>
                {children}
            </AuthInitializer>
            <ReactQueryDevtools initialIsOpen={false} />
        </QueryClientProvider>
    );
}
