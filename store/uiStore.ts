import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UIState {
    isSidebarCollapsed: boolean;
    chatbotOpen: boolean;
    toggleSidebar: () => void;
    toggleChatbot: () => void;
}

export const useUIStore = create<UIState>()(
    persist(
        (set) => ({
            isSidebarCollapsed: false,
            chatbotOpen: false,
            toggleSidebar: () => set((state) => ({ isSidebarCollapsed: !state.isSidebarCollapsed })),
            toggleChatbot: () => set((state) => ({ chatbotOpen: !state.chatbotOpen })),
        }),
        {
            name: 'ui-storage',
            skipHydration: true,
        }
    )
);
