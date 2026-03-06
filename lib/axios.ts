import Axios, { AxiosError } from 'axios';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

const api = Axios.create({
    baseURL: `${BACKEND_URL}/api`,
    headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
    },
    withCredentials: true,
});

api.interceptors.response.use(
    (response) => response,
    (error: AxiosError) => {
        if (error.response?.status === 401 || error.response?.status === 419) {
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new Event('auth-unauthorized'));
            }
        }
        return Promise.reject(error);
    }
);

export const csrfCookie = () => api.get('/sanctum/csrf-cookie', { baseURL: BACKEND_URL });

export default api;
