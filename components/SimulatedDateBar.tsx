'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { CalendarClock, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useSimulatedToday } from '@/store/simulatedTodayStore';

/**
 * Date picker + amber banner combo. Renders at the top of pages that surface
 * variance / health badges so a tester can preview the system "as of" any date.
 *
 * Hydration order:
 *   1. URL `?as_of=YYYY-MM-DD` wins if present (so shared links work).
 *   2. Otherwise localStorage value (Zustand persist) wins.
 *   3. Otherwise null → server uses real today.
 *
 * Changes from the picker update the store AND push to the URL query so the
 * current URL is shareable.
 */
export function SimulatedDateBar() {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const { simulatedDate, setSimulatedDate, reset } = useSimulatedToday();
    const [hydrated, setHydrated] = useState(false);

    // 1-shot hydration: rehydrate Zustand from localStorage, then layer URL on top.
    useEffect(() => {
        useSimulatedToday.persist.rehydrate()?.then(() => {
            const urlValue = searchParams.get('as_of');
            if (urlValue && /^\d{4}-\d{2}-\d{2}$/.test(urlValue)) {
                setSimulatedDate(urlValue);
            }
            setHydrated(true);
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const pushUrl = (next: string | null) => {
        const params = new URLSearchParams(searchParams.toString());
        if (next) params.set('as_of', next);
        else params.delete('as_of');
        const qs = params.toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    };

    const onChange = (v: string) => {
        const next = v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
        setSimulatedDate(next);
        pushUrl(next);
    };

    const onReset = () => {
        reset();
        pushUrl(null);
    };

    if (!hydrated) {
        return <div className="h-9" />;
    }

    return (
        <div className="space-y-2">
            <div className="flex items-center gap-3">
                <label className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
                    <CalendarClock className="h-4 w-4" />
                    Treat as today:
                </label>
                <Input
                    type="date"
                    value={simulatedDate ?? ''}
                    onChange={(e) => onChange(e.target.value)}
                    className="w-44 h-8 text-sm"
                />
                {simulatedDate && (
                    <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 gap-1 text-xs text-slate-600"
                        onClick={onReset}
                    >
                        <X className="h-3 w-3" />
                        Reset to real today
                    </Button>
                )}
            </div>
            {simulatedDate && (
                <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 flex items-center justify-between">
                    <span>
                        <strong>Test view:</strong> variance and health badges are computed as if today were{' '}
                        <strong>{simulatedDate}</strong>. Real today is still the actual date — log entries you create use real today, not this override.
                    </span>
                    <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 text-xs text-amber-900 hover:bg-amber-100"
                        onClick={onReset}
                    >
                        Clear
                    </Button>
                </div>
            )}
        </div>
    );
}

/** Convenience hook for pages that need the current asOf value (post-hydration). */
export function useAsOfParam(): string | undefined {
    const date = useSimulatedToday((s) => s.simulatedDate);
    return date ?? undefined;
}
