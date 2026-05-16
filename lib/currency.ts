import { Currency, CURRENCY_CONFIG } from '@/lib/currencyConfig';

const FALLBACK_CFG = CURRENCY_CONFIG['MMK'];

function getCfg(currency: Currency) {
    return CURRENCY_CONFIG[currency] ?? FALLBACK_CFG;
}

export function formatMoney(amount: number, currency: Currency = 'MMK'): string {
    const cfg = getCfg(currency);
    if (currency === 'JPY') {
        return `${cfg.symbol}${Math.round(amount).toLocaleString(cfg.locale)}`;
    }
    return `${cfg.symbol}${amount.toLocaleString(cfg.locale, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export function formatMoneyShort(amount: number, currency: Currency = 'MMK'): string {
    const cfg = getCfg(currency);
    if (amount >= 1_000_000) {
        return `${cfg.symbol}${(amount / 1_000_000).toFixed(1)}M`;
    }
    if (amount >= 1_000) {
        return `${cfg.symbol}${(amount / 1_000).toFixed(0)}k`;
    }
    return `${cfg.symbol}${amount.toLocaleString()}`;
}
