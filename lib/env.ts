const CLIENT_VARS = [
    'NEXT_PUBLIC_BACKEND_URL',
    'NEXT_PUBLIC_API_URL',
] as const;

const SERVER_VARS = ['GEMINI_API_KEY'] as const;

if (process.env.NODE_ENV === 'development') {
    for (const key of CLIENT_VARS) {
        if (!process.env[key]) {
            throw new Error(
                `Missing required environment variable: ${key}\n` +
                `Add it to .env.local and restart the dev server.`
            );
        }
    }

    if (typeof window === 'undefined') {
        for (const key of SERVER_VARS) {
            if (!process.env[key]) {
                throw new Error(
                    `Missing required server-side environment variable: ${key}\n` +
                    `Add it to .env.local and restart the dev server.`
                );
            }
        }
    }
}

export const env = {
    backendUrl: process.env.NEXT_PUBLIC_BACKEND_URL!,
    apiUrl:     process.env.NEXT_PUBLIC_API_URL!,
} as const;
