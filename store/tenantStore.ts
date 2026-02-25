import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface Tenant {
    id: string;
    name: string;
}

interface TenantState {
    activeTenantId: string | null;
    tenants: Tenant[];
    setActiveTenant: (id: string) => void;
    setTenants: (tenants: Tenant[]) => void;
}

export const useTenantStore = create<TenantState>()(
    persist(
        (set) => ({
            activeTenantId: null,
            tenants: [],
            setActiveTenant: (id) => set({ activeTenantId: id }),
            setTenants: (tenants) => set({ tenants }),
        }),
        {
            name: 'tenant-storage',
        }
    )
);
