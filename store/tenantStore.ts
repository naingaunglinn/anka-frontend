import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Currency, CURRENCY_CONFIG } from '@/lib/currencyConfig';

export type { Currency };
export { CURRENCY_CONFIG };

export interface Tenant {
    id: string;
    name: string;
    slug: string;
    currency?: Currency;
    taxRate?: number;
    deliveryLagMonths?: number;
    paymentDaysLate?: number;
    exchangeRates?: Record<string, number>;
}

interface TenantState {
    activeTenantId: string | null;
    currentTenant: Tenant | null;
    tenants: Tenant[];
    setActiveTenant: (id: string) => void;
    setCurrentTenant: (tenant: Tenant | null) => void;
    setTenants: (tenants: Tenant[]) => void;
    setTenantCurrency: (tenantId: string, currency: Currency) => void;
    clearTenant: () => void;
}

export const useTenantStore = create<TenantState>()(
    persist(
        (set) => ({
            activeTenantId: null,
            currentTenant: null,
            tenants: [],
            setActiveTenant: (id) => set({ activeTenantId: id }),
            setCurrentTenant: (tenant) => set({ currentTenant: tenant }),
            setTenants: (tenants) => set({ tenants }),
            setTenantCurrency: (tenantId, currency) =>
                set((state) => {
                    const exists = state.tenants.some((t) => t.id === tenantId);
                    const tenants = exists
                        ? state.tenants.map((t) =>
                              t.id === tenantId ? { ...t, currency } : t
                          )
                        : [...state.tenants, { id: tenantId, name: '', slug: '', currency }];
                    return {
                        tenants,
                        currentTenant:
                            state.currentTenant?.id === tenantId
                                ? { ...state.currentTenant, currency }
                                : state.currentTenant,
                    };
                }),
            clearTenant: () => set({ activeTenantId: null, currentTenant: null, tenants: [] }),
        }),
        {
            name: 'tenant-storage',
        }
    )
);
