import { AxiosError } from 'axios';
import type { ApiError, ValidationErrors } from '@/types/api';

export type ErrorCode =
    | 'validation'   // 422 — field-level bag from Laravel
    | 'conflict'     // 409 — e.g. invoice already paid
    | 'locked'       // 423 — pessimistic row lock held by another process
    | 'unauthorized' // 401 — missing or expired token
    | 'forbidden'    // 403 — RBAC denied
    | 'not_found'    // 404
    | 'server'       // 5xx
    | 'network'      // no response received (offline / CORS / timeout)
    | 'unknown';

export interface NormalizedError {
    code: ErrorCode;
    message: string;
    /**
     * Field-keyed validation messages from a Laravel 422 response.
     * Keys are the field names; values are arrays of error strings.
     * Only present when `code === 'validation'`.
     */
    fields?: ValidationErrors;
}

/**
 * Maps any thrown value to a consistent {@link NormalizedError} shape.
 *
 * **Never** access `error.response.data.errors` directly in components or stores —
 * call this function instead so the error surface is typed and predictable.
 *
 * @example
 * ```ts
 * try {
 *   await api.post('/deals', payload);
 * } catch (err) {
 *   const { code, message, fields } = normalizeError(err);
 *   toast.error(message);
 *   if (fields) form.setErrors(fields); // surface 422 fields in a form
 * }
 * ```
 */
export function normalizeError(err: unknown): NormalizedError {
    if (err instanceof AxiosError) {
        // No response at all — network failure, CORS, or request timeout
        if (!err.response) {
            return {
                code: 'network',
                message: 'Network error. Please check your connection and try again.',
            };
        }

        const status = err.response.status;
        const data = err.response.data as ApiError | undefined;
        // Always prefer the server's human-readable message; only fall back to
        // a safe default when the backend didn't include one (e.g. plain 500).
        const serverMessage = data?.message;

        switch (status) {
            case 422:
                return {
                    code: 'validation',
                    message: serverMessage ?? 'Validation failed. Please check your input.',
                    fields: data?.errors,
                };
            case 409:
                // The server is telling us the requested state change is not allowed
                // (e.g. "invoice has already been paid"). Use the server message verbatim.
                return {
                    code: 'conflict',
                    message: serverMessage ?? 'This action conflicts with the current state.',
                };
            case 423:
                // A pessimistic DB lock is held by another process. Prompt the user to
                // retry — do NOT suggest the record is broken or the action is forbidden.
                return {
                    code: 'locked',
                    message: serverMessage ?? 'This record is currently being modified. Please try again in a moment.',
                };
            case 401:
                return {
                    code: 'unauthorized',
                    message: 'Your session has expired. Please log in again.',
                };
            case 403:
                return {
                    code: 'forbidden',
                    message: serverMessage ?? 'You do not have permission to perform this action.',
                };
            case 404:
                return {
                    code: 'not_found',
                    message: serverMessage ?? 'The requested resource was not found.',
                };
            default:
                return {
                    code: 'server',
                    message: serverMessage ?? 'A server error occurred. Please try again later.',
                };
        }
    }

    if (err instanceof Error) {
        return { code: 'unknown', message: err.message };
    }

    return { code: 'unknown', message: 'An unexpected error occurred.' };
}

/**
 * Extracts the first field-level validation error string.
 * Useful for surfacing a single inline hint without rendering the full error map.
 */
export function firstFieldError(err: NormalizedError): string | undefined {
    if (!err.fields) return undefined;
    const firstKey = Object.keys(err.fields)[0];
    return firstKey ? err.fields[firstKey]?.[0] : undefined;
}
