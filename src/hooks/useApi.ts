/**
 * Custom Hook for API Calls
 * Provides loading, error, and data state management for API requests
 */

import { useCallback, useState } from "react";
import { api, formatApiError } from "~/lib/api-client";

export interface UseApiState<T> {
    data: T | null;
    loading: boolean;
    error: string | null;
}

export interface UseApiReturn<T> extends UseApiState<T> {
    execute: (...args: any[]) => Promise<T | null>;
    reset: () => void;
}

/**
 * Hook for managing API call state
 * 
 * @example
 * const { data, loading, error, execute } = useApi(async (url: string) => {
 *   return api.get(`/api/search/by-url?url=${url}`);
 * });
 */
export function useApi<T = unknown>(
    apiCall: (...args: any[]) => Promise<T>
): UseApiReturn<T> {
    const [state, setState] = useState<UseApiState<T>>({
        data: null,
        loading: false,
        error: null,
    });

    const execute = useCallback(
        async (...args: any[]): Promise<T | null> => {
            setState({ data: null, loading: true, error: null });
            try {
                const result = await apiCall(...args);
                setState({ data: result, loading: false, error: null });
                return result;
            } catch (err) {
                const errorMessage = formatApiError(err);
                setState({ data: null, loading: false, error: errorMessage });
                return null;
            }
        },
        [apiCall]
    );

    const reset = useCallback(() => {
        setState({ data: null, loading: false, error: null });
    }, []);

    return {
        ...state,
        execute,
        reset,
    };
}

/**
 * Hook for managing multiple API endpoints
 * Useful when you need to track state for several different API calls
 * 
 * @example
 * const endpoints = useApiEndpoints({
 *   search: () => api.post('/api/search/by-url', { ... }),
 *   analyze: () => api.post('/api/optimize/analyze', { ... }),
 * });
 */
export function useApiEndpoints<T extends Record<string, () => Promise<any>>>(
    endpoints: T
): Record<
    keyof T,
    {
        data: unknown;
        loading: boolean;
        error: string | null;
        execute: () => Promise<unknown>;
    }
> {
    type EndpointState = Record<
        string,
        { loading: boolean; data: unknown; error: string | null }
    >;

    const [states, setStates] = useState<EndpointState>(() => {
        const initial: EndpointState = {};
        for (const key in endpoints) {
            initial[key] = { loading: false, data: null, error: null };
        }
        return initial;
    });

    const result: any = {};

    for (const key in endpoints) {
        result[key] = {
            ...states[key],
            execute: async () => {
                setStates((prev) => ({
                    ...prev,
                    [key]: { loading: true, data: prev[key]?.data ?? null, error: null },
                }));

                try {
                    const endpointFn = endpoints[key];
                    if (!endpointFn) return null;
                    const data = await endpointFn();
                    setStates((prev) => ({
                        ...prev,
                        [key]: { loading: false, data, error: null },
                    }));
                    return data;
                } catch (err) {
                    const errorMessage = formatApiError(err);
                    setStates((prev) => ({
                        ...prev,
                        [key]: {
                            loading: false,
                            data: prev[key]?.data ?? null,
                            error: errorMessage,
                        },
                    }));
                    return null;
                }
            },
        };
    }

    return result;
}
