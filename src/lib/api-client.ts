/**
 * API Client
 * Reusable API client with standardized error handling and JSON parsing
 */

export class ApiError extends Error {
    constructor(
        message: string,
        public status: number,
        public response?: unknown
    ) {
        super(message);
        this.name = "ApiError";
    }
}

export interface ApiClientOptions {
    baseUrl?: string;
    headers?: HeadersInit;
}

/**
 * Make a type-safe API request with standardized error handling
 */
export async function apiRequest<T = unknown>(
    path: string,
    options?: RequestInit & { baseUrl?: string }
): Promise<T> {
    const { baseUrl = "", ...fetchOptions } = options || {};
    const url = baseUrl ? `${baseUrl}${path}` : path;

    try {
        const response = await fetch(url, {
            ...fetchOptions,
            headers: {
                "Content-Type": "application/json",
                ...fetchOptions.headers,
            },
        });

        // Try to parse JSON response
        let json: unknown = null;
        try {
            json = await response.json();
        } catch {
            // Response is not JSON
        }

        if (!response.ok) {
            const errorMessage =
                (json as any)?.error ||
                (json as any)?.message ||
                `Request failed: ${response.status}`;
            throw new ApiError(errorMessage, response.status, json);
        }

        return json as T;
    } catch (error) {
        if (error instanceof ApiError) {
            throw error;
        }
        throw new ApiError(
            error instanceof Error ? error.message : String(error),
            0
        );
    }
}

/**
 * Convenience methods for common HTTP verbs
 */
export const api = {
    get: <T = unknown>(path: string, options?: RequestInit & { baseUrl?: string }) =>
        apiRequest<T>(path, { ...options, method: "GET" }),

    post: <T = unknown>(
        path: string,
        body?: unknown,
        options?: RequestInit & { baseUrl?: string }
    ) =>
        apiRequest<T>(path, {
            ...options,
            method: "POST",
            body: body ? JSON.stringify(body) : undefined,
        }),

    put: <T = unknown>(
        path: string,
        body?: unknown,
        options?: RequestInit & { baseUrl?: string }
    ) =>
        apiRequest<T>(path, {
            ...options,
            method: "PUT",
            body: body ? JSON.stringify(body) : undefined,
        }),

    delete: <T = unknown>(path: string, options?: RequestInit & { baseUrl?: string }) =>
        apiRequest<T>(path, { ...options, method: "DELETE" }),
};

/**
 * Helper to format error messages for display
 */
export function formatApiError(error: unknown): string {
    if (error instanceof ApiError) {
        return error.message;
    }
    if (error instanceof Error) {
        return error.message;
    }
    return String(error);
}
