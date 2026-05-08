import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UIState {
    isSidebarCollapsed: boolean;
    isDemoMode: boolean;
    chatbotOpen: boolean;
    toggleSidebar: () => void;
    enterDemoMode: () => void;
    exitDemoMode: () => void;
    toggleChatbot: () => void;
}

export const useUIStore = create<UIState>()(
    persist(
        (set) => ({
            isSidebarCollapsed: false,
            isDemoMode: false,
            chatbotOpen: false,
            toggleSidebar: () => set((state) => ({ isSidebarCollapsed: !state.isSidebarCollapsed })),
            enterDemoMode: () => set({ isDemoMode: true }),
            exitDemoMode: () => set({ isDemoMode: false }),
            toggleChatbot: () => set((state) => ({ chatbotOpen: !state.chatbotOpen })),
        }),
        {
            name: 'ui-storage',
            skipHydration: true,
        }
    )
);
