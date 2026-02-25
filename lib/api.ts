import axios from 'axios';
import { useAuthStore } from '@/store/authStore';
import { useTenantStore } from '@/store/tenantStore';

const api = axios.create({
    baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api',
    headers: {
        'Content-Type': 'application/json',
    },
});

api.interceptors.request.use(
    (config) => {
        const token = useAuthStore.getState().token;
        const tenantId = useTenantStore.getState().activeTenantId;

        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        if (tenantId) {
            config.headers['X-Tenant-ID'] = tenantId;
        }

        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

api.interceptors.response.use(
    (response) => {
        return response;
    },
    async (error) => {
        // Handle 401s dynamically, e.g. token refresh logic or redirect
        if (error.response?.status === 401) {
            useAuthStore.getState().logout();
            if (typeof window !== 'undefined') {
                window.location.href = '/login';
            }
        }
        return Promise.reject(error);
    }
);

export default api;
