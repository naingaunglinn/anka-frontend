import axios, { AxiosError } from 'axios';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';
import { useTenantStore } from '@/store/tenantStore';

let rateLimitTimer: ReturnType<typeof setInterval> | null = null;

function startRateLimitCountdown(retryAfterSeconds: number, prefix = 'Too many requests.') {
    if (typeof window === 'undefined') return;
    if (rateLimitTimer) return;

    let remaining = Math.max(1, retryAfterSeconds);
    const TOAST_ID = 'rate-limit-api';

    toast.error(`${prefix} Try again in ${remaining}s.`, {
        id: TOAST_ID,
        duration: (remaining + 2) * 1000,
    });

    rateLimitTimer = setInterval(() => {
        remaining -= 1;
        if (remaining <= 0) {
            clearInterval(rateLimitTimer!);
            rateLimitTimer = null;
            toast.dismiss(TOAST_ID);
        } else {
            toast.error(`${prefix} Try again in ${remaining}s.`, {
                id: TOAST_ID,
                duration: (remaining + 2) * 1000,
            });
        }
    }, 1000);
}

const api = axios.create({
    baseURL: process.env.NEXT_PUBLIC_API_URL
        || `${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'}/api`,
    headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
    },
});

api.interceptors.request.use(
    (config) => {
        const token = useAuthStore.getState().token;
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }

        // Super admins operate globally — no tenant scope required.
        const isSuperAdmin = useAuthStore.getState().user?.isSuperAdmin ?? false;
        if (isSuperAdmin) {
            return config;
        }

        const tenantId = useTenantStore.getState().activeTenantId;

        if (!tenantId) {
            return Promise.reject(new Error('No active tenant. Please select a tenant to continue.'));
        }

        // Guard against stale / invalid values persisted in localStorage (e.g. "t1").
        const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!UUID_RE.test(tenantId)) {
            // Clear the bad value so the next login writes the real one.
            useTenantStore.getState().setActiveTenant('');
            return Promise.reject(new Error('Invalid tenant ID format. Please log in again.'));
        }

        config.headers['X-Tenant-ID'] = tenantId;

        return config;
    },
    (error) => Promise.reject(error)
);

api.interceptors.response.use(
    (response) => response,
    (error: AxiosError) => {
        const status = error.response?.status;

        if (status === 429) {
            const retryAfter = parseInt(
                (error.response?.headers?.['retry-after'] as string) ?? '60',
                10,
            );
            startRateLimitCountdown(isNaN(retryAfter) ? 60 : retryAfter, 'Too many requests.');
            return Promise.reject(error);
        }

        if (status === 401) {
            useAuthStore.getState().logout();
            if (typeof window !== 'undefined') {
                window.location.href = '/login';
            }
        }

        if (status === 403) {
            toast.error('You do not have permission to perform this action');
        }

        return Promise.reject(error);
    }
);

export default api;
