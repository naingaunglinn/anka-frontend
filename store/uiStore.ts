import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UIState {
    isSidebarCollapsed: boolean;
    isDemoMode: boolean;
    toggleSidebar: () => void;
    enterDemoMode: () => void;
    exitDemoMode: () => void;
}

export const useUIStore = create<UIState>()(
    persist(
        (set) => ({
            isSidebarCollapsed: false,
            isDemoMode: false,
            toggleSidebar: () => set((state) => ({ isSidebarCollapsed: !state.isSidebarCollapsed })),
            enterDemoMode: () => set({ isDemoMode: true }),
            exitDemoMode: () => set({ isDemoMode: false }),
        }),
        {
            name: 'ui-storage',
            skipHydration: true,
        }
    )
);
