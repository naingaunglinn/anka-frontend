import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface Tenant {
    id: string;
    name: string;
    slug: string;
}

interface TenantState {
    activeTenantId: string | null;
    currentTenant: Tenant | null;
    tenants: Tenant[];
    setActiveTenant: (id: string) => void;
    setCurrentTenant: (tenant: Tenant | null) => void;
    setTenants: (tenants: Tenant[]) => void;
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
            clearTenant: () => set({ activeTenantId: null, currentTenant: null, tenants: [] }),
        }),
        {
            name: 'tenant-storage',
        }
    )
);
