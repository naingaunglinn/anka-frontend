'use client'

import { AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props {
    /** Error message from `useOrganizationSync()` — null/undefined hides the banner. */
    error: string | null | undefined
    /** Async retry function. Disabled while `retrying` is true. */
    onRetry: () => void
    /** True while a retry is in-flight (suppress repeat clicks). */
    retrying?: boolean
    /**
     * Optional context line shown below the error, explaining what part of the
     * page will be wrong without org data. CRM pages should pass something
     * like "Capacity bookings and salary-range suggestions will be inaccurate
     * until this is resolved."
     */
    context?: string
}

/**
 * Inline retry/error panel for `useOrganizationSync` failures.
 *
 * Multiple CRM screens depend on the organization slice (employees, settings,
 * roles, skills) being hydrated; if the initial sync fails, capacity numbers,
 * AI candidate pools, and salary ranges go quietly wrong. Until this banner
 * was added, the only signal was the one-shot toast inside the hook.
 */
export function OrgSyncErrorBanner({ error, onRetry, retrying, context }: Props) {
    if (!error) return null
    return (
        <div className="flex items-start gap-3 rounded-md border border-rose-200 bg-rose-50 p-3">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-rose-600" />
            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-rose-700">Could not load organization data</p>
                <p className="text-xs text-rose-600 mt-0.5">{error}</p>
                {context && (
                    <p className="text-xs text-rose-600/80 mt-1">{context}</p>
                )}
            </div>
            <Button
                variant="outline"
                size="sm"
                className="h-7 border-rose-300 text-rose-700 hover:bg-rose-100"
                onClick={onRetry}
                disabled={retrying}
            >
                {retrying ? 'Retrying...' : 'Retry'}
            </Button>
        </div>
    )
}
