import { create } from 'zustand';

export interface User {
    id: number;
    first_name: string;
    last_name: string;
    email: string;
    roles?: string[];
    permissions?: string[];
    tenant?: any;
    department?: any;
    job_role?: any;
}

interface AuthState {
    user: User | null;
    isAuthenticated: boolean;
    setUser: (user: User | null) => void;
    clearAuth: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
    user: null,
    isAuthenticated: false,
    setUser: (user) => set({ user, isAuthenticated: !!user }),
    clearAuth: () => set({ user: null, isAuthenticated: false }),
}));
