'use client';

import * as React from 'react';
import { CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export interface WorkingDayPickerProps {
    value: string | null;                          // 'YYYY-MM-DD'
    onChange: (next: string) => void;
    /** Map of YYYY-MM-DD => holiday name (already expanded for visible year). */
    holidays?: Record<string, string>;
    /** Earliest selectable date (YYYY-MM-DD). Earlier days are disabled. */
    min?: string | null;
    /** Latest selectable date (YYYY-MM-DD). Later days are disabled. */
    max?: string | null;
    disabled?: boolean;
    placeholder?: string;
    className?: string;
}

function parseISO(s: string | null | undefined): Date | undefined {
    if (!s) return undefined;
    const [y, m, d] = s.split('-').map(Number);
    if (!y || !m || !d) return undefined;
    return new Date(y, m - 1, d);
}

function toISO(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function isWeekend(d: Date): boolean {
    const wd = d.getDay();
    return wd === 0 || wd === 6;
}

/**
 * Date picker that disables weekends and tenant holidays. Holidays show a
 * rose background, weekends a slate fill. Selected and today retain shadcn's
 * default styling — we no longer override DayButton, which previously wiped
 * those out.
 */
export function WorkingDayPicker({
    value,
    onChange,
    holidays = {},
    min,
    max,
    disabled = false,
    placeholder = 'Pick a date',
    className,
}: WorkingDayPickerProps) {
    const [open, setOpen] = React.useState(false);
    const selected = parseISO(value);
    const minDate = parseISO(min);
    const maxDate = parseISO(max);

    const isHoliday = React.useCallback(
        (d: Date) => Boolean(holidays[toISO(d)]),
        [holidays],
    );

    const isBeforeMin = React.useCallback(
        (d: Date) => (minDate ? d < minDate : false),
        [minDate],
    );
    const isAfterMax = React.useCallback(
        (d: Date) => (maxDate ? d > maxDate : false),
        [maxDate],
    );

    const matchDisabled = React.useCallback(
        (d: Date) =>
            isWeekend(d) || isHoliday(d) || isBeforeMin(d) || isAfterMax(d),
        [isHoliday, isBeforeMin, isAfterMax],
    );

    const triggerLabel = value ? value.replaceAll('-', '/') : placeholder;

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    disabled={disabled}
                    className={cn(
                        'inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[12px] font-mono tabular-nums text-slate-700 shadow-xs',
                        'hover:border-indigo-300 hover:bg-indigo-50/40 hover:shadow-sm',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300/60',
                        'disabled:cursor-not-allowed disabled:opacity-50',
                        'transition-all duration-150',
                        !value && 'text-slate-400',
                        className,
                    )}
                >
                    <CalendarIcon className="h-3.5 w-3.5 text-slate-400" />
                    {triggerLabel}
                </button>
            </PopoverTrigger>
            <PopoverContent
                className="w-auto rounded-xl border-slate-200 p-3 shadow-lg"
                align="start"
                sideOffset={6}
            >
                <Calendar
                    mode="single"
                    selected={selected}
                    onSelect={(d) => {
                        if (!d) return;
                        if (matchDisabled(d)) return;
                        onChange(toISO(d));
                        setOpen(false);
                    }}
                    defaultMonth={selected ?? minDate ?? new Date()}
                    disabled={matchDisabled}
                    modifiers={{
                        weekend: isWeekend,
                        holiday: isHoliday,
                    }}
                    modifiersClassNames={{
                        weekend: 'bg-slate-100/70 text-slate-400 hover:bg-slate-100',
                        holiday: 'bg-rose-100/80 text-rose-700 font-semibold hover:bg-rose-100',
                    }}
                    showOutsideDays
                    className="[--cell-size:--spacing(10)]"
                    classNames={{
                        caption_label: 'text-sm font-semibold text-slate-800',
                        weekdays: 'flex w-full mb-1 border-b border-slate-100 pb-1.5',
                        weekday: 'flex-1 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-500 select-none',
                        week: 'flex w-full mt-1.5',
                        day: 'flex-1 p-0.5 text-[13px]',
                        outside: 'text-slate-300',
                    }}
                />
                <div className="mt-3 flex items-center gap-4 px-1 pt-2 border-t border-slate-100 text-[11px] text-slate-500">
                    <span className="inline-flex items-center gap-1.5">
                        <span className="inline-block h-2.5 w-2.5 rounded-sm bg-slate-100 border border-slate-300" />
                        Weekend
                    </span>
                    {Object.keys(holidays).length > 0 && (
                        <span className="inline-flex items-center gap-1.5">
                            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-rose-100 border border-rose-300" />
                            Holiday
                        </span>
                    )}
                    <span className="inline-flex items-center gap-1.5 ml-auto">
                        <span className="inline-block h-2.5 w-2.5 rounded-sm bg-indigo-600" />
                        Selected
                    </span>
                </div>
            </PopoverContent>
        </Popover>
    );
}
