// Client-safe locale config. Imported by both server (request.ts, server
// actions) and client (LocaleSwitcher) modules — must NOT pull anything
// from `next/headers` or other server-only APIs.

export const SUPPORTED_LOCALES = ['en', 'ja', 'vi'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';
export const LOCALE_COOKIE = 'NEXT_LOCALE';

export const LOCALE_LABELS: Record<Locale, string> = {
    en: 'English',
    ja: '日本語',
    vi: 'Tiếng Việt',
};

export function isSupportedLocale(value: string | undefined): value is Locale {
    return !!value && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}
