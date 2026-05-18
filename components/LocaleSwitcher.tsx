'use client';

import { useLocale } from 'next-intl';
import { useTransition } from 'react';
import { setLocale } from '@/app/actions/setLocale';
import {
    LOCALE_LABELS,
    SUPPORTED_LOCALES,
    type Locale,
} from '@/i18n/config';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

// Drop this anywhere (header, sidebar, settings page). It is not auto-mounted
// — Phase 1 is plumbing only.
export function LocaleSwitcher() {
    const current = useLocale() as Locale;
    const [isPending, startTransition] = useTransition();

    return (
        <Select
            value={current}
            disabled={isPending}
            onValueChange={(value) => {
                startTransition(async () => {
                    await setLocale(value as Locale);
                });
            }}
        >
            <SelectTrigger className="h-8 w-[140px] text-sm">
                <SelectValue />
            </SelectTrigger>
            <SelectContent>
                {SUPPORTED_LOCALES.map((loc) => (
                    <SelectItem key={loc} value={loc}>
                        {LOCALE_LABELS[loc]}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}
