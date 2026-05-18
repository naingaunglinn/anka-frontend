import { getRequestConfig } from 'next-intl/server';
import { cookies } from 'next/headers';
import { DEFAULT_LOCALE, isSupportedLocale, LOCALE_COOKIE, type Locale } from './config';

export default getRequestConfig(async () => {
    const cookieStore = await cookies();
    const fromCookie = cookieStore.get(LOCALE_COOKIE)?.value;
    const locale: Locale = isSupportedLocale(fromCookie) ? fromCookie : DEFAULT_LOCALE;

    // Merge EN as the base layer so any key missing from ja.json / vi.json
    // silently resolves to the English value instead of raising MISSING_MESSAGE.
    const en = (await import('../messages/en.json')).default;
    const active =
        locale === 'en'
            ? en
            : ((await import(`../messages/${locale}.json`)).default as typeof en);

    return {
        locale,
        messages: { ...en, ...active },
    };
});
