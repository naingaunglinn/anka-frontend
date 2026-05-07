import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LoadingStateProps {
    message?: string;
    className?: string;
    /** Spinner size — `md` works for tables, `lg` for full-page placeholders. */
    size?: 'sm' | 'md' | 'lg';
}

const SIZES: Record<NonNullable<LoadingStateProps['size']>, string> = {
    sm: 'h-5 w-5',
    md: 'h-8 w-8',
    lg: 'h-12 w-12',
};

/**
 * Centered spinner + label. Prefer this over inline "Loading..." text so the
 * loading affordance is consistent across pages.
 */
export function LoadingState({ message = 'Loading…', className, size = 'md' }: LoadingStateProps) {
    return (
        <div
            role="status"
            aria-live="polite"
            className={cn(
                'flex flex-col items-center justify-center gap-3 p-8 text-slate-500',
                className,
            )}
        >
            <Loader2 className={cn('animate-spin text-slate-400', SIZES[size])} />
            <p className="text-sm font-medium tracking-tight">{message}</p>
        </div>
    );
}
