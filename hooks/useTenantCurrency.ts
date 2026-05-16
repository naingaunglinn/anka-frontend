import { Currency, CURRENCY_CONFIG } from '@/lib/currencyConfig';
import { useTenantStore } from '@/store/tenantStore';

export function useTenantCurrency(): Currency {
    const { currentTenant, tenants, activeTenantId } = useTenantStore();
    return (
        (currentTenant?.currency as Currency) ??
        tenants.find((t) => t.id === activeTenantId)?.currency ??
        'MMK'
    );
}

export function useCurrencySymbol(): string {
    const currency = useTenantCurrency();
    return CURRENCY_CONFIG[currency]?.symbol ?? CURRENCY_CONFIG['MMK'].symbol;
}
