/**
 * CSRF-Protected API Client
 * 
 * Automatically includes CSRF token in all state-changing requests
 * Usage:
 *   const response = await csrfClient.post('/api/invoices/transition', { action: 'approve' });
 */

import { fetchWithCSRF, getCSRFHeaders } from '../../hooks/useCSRFToken';

interface RequestOptions extends RequestInit {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: any;
}

interface APIResponse<T = any> {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
}

/**
 * Get CSRF token from cookies
 */
function getCSRFToken(): string | null {
  if (typeof document === 'undefined') return null;
  
  const cookies = document.cookie.split(';');
  for (const cookie of cookies) {
    const [name, value] = cookie.trim().split('=');
    if (name === 'csrf-token') {
      return decodeURIComponent(value);
    }
  }
  return null;
}

/**
 * Make a CSRF-protected API request
 */
async function request<T = any>(
  url: string,
  options: RequestOptions = {}
): Promise<APIResponse<T>> {
  const method = options.method || 'GET';
  const csrfToken = getCSRFToken();

  const headers = new Headers(options.headers || {});
  headers.set('Content-Type', 'application/json');

  // Add CSRF token for state-changing requests
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && csrfToken) {
    headers.set('x-csrf-token', csrfToken);
  }

  try {
    const response = await fetch(url, {
      ...options,
      method,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    const data = await response.json();

    return {
      ok: response.ok,
      status: response.status,
      data: response.ok ? data : undefined,
      error: !response.ok ? data?.error || 'Request failed' : undefined,
    };
  } catch (error: any) {
    return {
      ok: false,
      status: 0,
      error: error?.message || 'Network error',
    };
  }
}

/**
 * CSRF-protected API client
 */
export const csrfClient = {
  /**
   * GET request
   */
  get: <T = any>(url: string, options?: RequestOptions) =>
    request<T>(url, { ...options, method: 'GET' }),

  /**
   * POST request
   */
  post: <T = any>(url: string, body?: any, options?: RequestOptions) =>
    request<T>(url, { ...options, method: 'POST', body }),

  /**
   * PUT request
   */
  put: <T = any>(url: string, body?: any, options?: RequestOptions) =>
    request<T>(url, { ...options, method: 'PUT', body }),

  /**
   * PATCH request
   */
  patch: <T = any>(url: string, body?: any, options?: RequestOptions) =>
    request<T>(url, { ...options, method: 'PATCH', body }),

  /**
   * DELETE request
   */
  delete: <T = any>(url: string, options?: RequestOptions) =>
    request<T>(url, { ...options, method: 'DELETE' }),
};

/**
 * Hook-compatible version for React components
 */
export function useCSRFClient() {
  return csrfClient;
}

