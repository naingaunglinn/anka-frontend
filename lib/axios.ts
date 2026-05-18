import Axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';
import type { ApiError } from '@/types/api';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

const api = Axios.create({
    baseURL: `${BACKEND_URL}/api`,
    headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
    },
    withCredentials: true,
    // Prevent hung requests when the backend DB is slow or unreachable.
    timeout: 15000,
    // We use Bearer token auth â€” Axios must not auto-inject X-XSRF-TOKEN.
    // The XSRF-TOKEN cookie is shared across localhost ports, so Axios would
    // find it in document.cookie and add the header, causing CORS preflight
    // failures because X-XSRF-TOKEN isn't in the server's allowed headers.
    xsrfCookieName: '',
    xsrfHeaderName: '',
});

export const csrfCookie = () => api.get('/sanctum/csrf-cookie', { baseURL: BACKEND_URL });

const MUTATING_METHODS = new Set(['post', 'put', 'patch', 'delete']);

api.interceptors.request.use(async (config) => {
    // Auto-fetch CSRF cookie before any mutating request when absent.
    if (
        typeof document !== 'undefined' &&
        MUTATING_METHODS.has(config.method?.toLowerCase() ?? '')
    ) {
        const hasCsrf = document.cookie.split(';').some((c) => c.trim().startsWith('XSRF-TOKEN='));
        if (!hasCsrf) {
            await csrfCookie();
        }
    }

    const token = useAuthStore.getState().token;
    if (token) {
        // SECURITY: do NOT log config.headers anywhere â€” Authorization value is a secret.
        config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
});

// â”€â”€ Token refresh state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
let isRefreshing = false;
type QueueItem = { resolve: (token: string) => void; reject: (err: unknown) => void };
let refreshQueue: QueueItem[] = [];

function drainQueue(token: string | null, err: unknown) {
    refreshQueue.forEach(({ resolve, reject }) => (token ? resolve(token) : reject(err)));
    refreshQueue = [];
}

function triggerLogout() {
    useAuthStore.getState().logout();
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('auth-unauthorized'));
    }
}

// â”€â”€ Rate-limit countdown â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// A single timer prevents multiple overlapping countdowns if concurrent
// requests all 429 at the same time.
let rateLimitTimer: ReturnType<typeof setInterval> | null = null;

function startRateLimitCountdown(retryAfterSeconds: number, prefix = 'Too many requests.') {
    if (typeof window === 'undefined') return;
    if (rateLimitTimer) return; // already counting down

    let remaining = Math.max(1, retryAfterSeconds);
    const TOAST_ID = 'rate-limit-axios';

    toast.error(`${prefix} Try again in ${remaining}s.`, {
        id: TOAST_ID,
        // Duration slightly longer than the countdown so the toast doesn't
        // auto-dismiss before we call toast.dismiss() ourselves.
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

// â”€â”€ Response interceptor â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
api.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
        const status = error.response?.status;
        const message = (error.response?.data as ApiError | undefined)?.message;
        const originalConfig = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

        // Network errors / timeouts â€” don't trigger logout, let the caller retry.
        if (!status) {
            return Promise.reject(error);
        }

        // 5xx server errors â€” don't logout, the backend may be temporarily down.
        if (status >= 500) {
            return Promise.reject(error);
        }

        // 429 â€” brute-force / rate-limit guard (throttle:5,1 on POST /login)
        if (status === 429) {
            const retryAfter = parseInt(
                (error.response?.headers?.['retry-after'] as string) ?? '60',
                10,
            );
            startRateLimitCountdown(
                isNaN(retryAfter) ? 60 : retryAfter,
                'Too many login attempts.',
            );
            return Promise.reject(error);
        }

        // 419 = CSRF mismatch â€” session is broken, no refresh attempt
        if (status === 419) {
            triggerLogout();
            return Promise.reject(error);
        }

        if (status === 401) {
            const isRefreshEndpoint = originalConfig.url?.includes('/auth/refresh');
            if (isRefreshEndpoint || originalConfig._retry) {
                drainQueue(null, error);
                triggerLogout();
                return Promise.reject(error);
            }

            if (message !== 'token_expired') {
                triggerLogout();
                return Promise.reject(error);
            }

            if (isRefreshing) {
                return new Promise<unknown>((resolve, reject) => {
                    refreshQueue.push({
                        resolve: (newToken) => {
                            originalConfig.headers.Authorization = `Bearer ${newToken}`;
                            resolve(api(originalConfig));
                        },
                        reject,
                    });
                });
            }

            originalConfig._retry = true;
            isRefreshing = true;

            try {
                const res = await api.post('/auth/refresh');
                const newToken = res.data.token as string;

                useAuthStore.getState().setToken(newToken);

                await fetch('/api/auth/session', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token: newToken }),
                });

                drainQueue(newToken, null);
                originalConfig.headers.Authorization = `Bearer ${newToken}`;
                return api(originalConfig);
            } catch (refreshError) {
                drainQueue(null, refreshError);
                triggerLogout();
                return Promise.reject(refreshError);
            } finally {
                isRefreshing = false;
            }
        }

        return Promise.reject(error);
    },
);

export default api;

