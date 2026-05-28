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
 * red background and a tooltip with the holiday name on hover. Weekends are
 * dimmed grey. Used to edit phase planned dates without letting the user
 * land on a non-working day — matches WorkingDayCalendar server-side rules.
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

    const triggerLabel = value
        ? value.replaceAll('-', '/')
        : <span className="text-slate-400">{placeholder}</span>;

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    disabled={disabled}
                    className={cn(
                        'inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-1 text-[12px] font-mono tabular-nums text-slate-700 hover:border-indigo-300 hover:bg-indigo-50/40 disabled:cursor-not-allowed disabled:opacity-50 transition-colors',
                        className,
                    )}
                >
                    <CalendarIcon className="h-3 w-3 text-slate-400" />
                    {triggerLabel}
                </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-2" align="start">
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
                        weekend: 'bg-slate-100 text-slate-400',
                        holiday: 'bg-rose-100 text-rose-700 font-semibold',
                    }}
                    components={{
                        DayButton: (props) => {
                            const iso = toISO(props.day.date);
                            const name = holidays[iso];
                            return (
                                <button
                                    {...props}
                                    title={name ?? undefined}
                                />
                            );
                        },
                    }}
                    showOutsideDays
                />
                {Object.keys(holidays).length > 0 && (
                    <div className="mt-2 flex items-center gap-3 px-1 text-[10px] text-slate-500">
                        <span className="inline-flex items-center gap-1">
                            <span className="inline-block h-2 w-2 rounded-sm bg-slate-100 border border-slate-300" />
                            Weekend
                        </span>
                        <span className="inline-flex items-center gap-1">
                            <span className="inline-block h-2 w-2 rounded-sm bg-rose-100 border border-rose-300" />
                            Holiday
                        </span>
                    </div>
                )}
            </PopoverContent>
        </Popover>
    );
}
