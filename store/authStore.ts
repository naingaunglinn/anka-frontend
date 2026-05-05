import { create } from 'zustand';

export interface AuthUser {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    appRole: 'Admin' | 'Executive' | 'Sales' | 'Delivery' | 'HR';
    systemRole: string;
    isSuperAdmin: boolean;
    tenant: {
        id: string;
        name: string;
        slug: string;
    } | null;
}

interface AuthState {
    user: AuthUser | null;
    token: string | null;
    isAuthenticated: boolean;
    login: (user: AuthUser, token: string) => void;
    // setToken is used by the token-refresh interceptor to update the token
    // without wiping the user profile — avoids a redundant /auth/me round-trip
    setToken: (token: string) => void;
    logout: () => void;
}

// No persist middleware: the raw Sanctum token is kept only in memory.
// Persistence is handled by the __session httpOnly cookie (see app/api/auth/session/route.ts),
// which is unreadable by JS. AuthInitializer re-hydrates this store from that cookie on mount.
export const useAuthStore = create<AuthState>()((set) => ({
    user: null,
    token: null,
    isAuthenticated: false,
    login: (user, token) => set({ user, token, isAuthenticated: true }),
    setToken: (token) => set({ token }),
    logout: () => set({ user: null, token: null, isAuthenticated: false }),
}));
