export type Currency = 'MMK' | 'JPY' | 'USD';

export const CURRENCY_CONFIG: Record<Currency, { symbol: string; label: string; locale: string }> = {
    MMK: { symbol: 'Ks', label: 'Myanmar Kyat', locale: 'my-MM' },
    JPY: { symbol: '¥', label: 'Japanese Yen', locale: 'ja-JP' },
    USD: { symbol: '$', label: 'US Dollar', locale: 'en-US' },
};
