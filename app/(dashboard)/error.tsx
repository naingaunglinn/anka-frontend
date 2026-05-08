'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { AlertCircle } from 'lucide-react';

export default function DashboardError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error('[Dashboard error]', error);
    }, [error]);

    return (
        <div className="flex flex-col items-center justify-center h-[60vh] gap-4 text-center">
            <div className="w-12 h-12 rounded-full bg-rose-100 flex items-center justify-center">
                <AlertCircle className="w-6 h-6 text-rose-600" />
            </div>
            <div>
                <h2 className="text-lg font-semibold text-[#171717]">Something went wrong</h2>
                <p className="text-sm text-[#8a8a8a] mt-1 max-w-sm">
                    {error.message || 'An unexpected error occurred loading this page.'}
                </p>
            </div>
            <Button variant="outline" onClick={reset}>
                Try again
            </Button>
        </div>
    );
}
