'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import {
    DEFAULT_LOCALE,
    LOCALE_COOKIE,
    SUPPORTED_LOCALES,
    type Locale,
} from '@/i18n/config';

// One-year cookie — long enough that users don't have to re-pick on each visit,
// short enough that browsers will actually persist it.
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export async function setLocale(locale: Locale) {
    const next: Locale = (SUPPORTED_LOCALES as readonly string[]).includes(locale)
        ? locale
        : DEFAULT_LOCALE;

    const cookieStore = await cookies();
    cookieStore.set(LOCALE_COOKIE, next, {
        path: '/',
        maxAge: ONE_YEAR_SECONDS,
        sameSite: 'lax',
        httpOnly: false,
    });

    // Force every route to re-render with the new locale on the next navigation.
    revalidatePath('/', 'layout');
}
