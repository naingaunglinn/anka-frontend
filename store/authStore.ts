import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface AuthUser {
    id: number;
    firstName: string;
    lastName: string;
    email: string;
    appRole: 'Admin' | 'Executive' | 'Sales' | 'Delivery' | 'HR';
    tenant: {
        id: string;
        name: string;
        slug: string;
    };
}

interface AuthState {
    user: AuthUser | null;
    token: string | null;
    isAuthenticated: boolean;
    login: (user: AuthUser, token: string) => void;
    logout: () => void;
}

export const useAuthStore = create<AuthState>()(
    persist(
        (set) => ({
            user: null,
            token: null,
            isAuthenticated: false,
            login: (user, token) => set({ user, token, isAuthenticated: true }),
            logout: () => set({ user: null, token: null, isAuthenticated: false }),
        }),
        {
            name: 'auth-storage',
            // Wipe persisted user if it's the old shape (missing firstName)
            // so stale localStorage data doesn't crash components expecting AuthUser
            merge: (persisted, current) => {
                const p = persisted as Partial<AuthState>;
                if (p.user && !(p.user as AuthUser).firstName) {
                    return { ...current, user: null, token: null, isAuthenticated: false };
                }
                return { ...current, ...p };
            },
        }
    )
);
