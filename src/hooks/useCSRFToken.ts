/**
 * React Hook for CSRF Token Management
 * 
 * Provides CSRF token from cookies and automatically includes it in API requests
 * Usage:
 *   const csrfToken = useCSRFToken();
 *   // Include in fetch headers: { 'x-csrf-token': csrfToken }
 */

import { useEffect, useState } from 'react';

const CSRF_COOKIE_NAME = 'csrf-token';
const CSRF_HEADER_NAME = 'x-csrf-token';

/**
 * Get CSRF token from cookies
 */
function getCSRFTokenFromCookie(): string | null {
  if (typeof document === 'undefined') return null;
  
  const cookies = document.cookie.split(';');
  for (const cookie of cookies) {
    const [name, value] = cookie.trim().split('=');
    if (name === CSRF_COOKIE_NAME) {
      return decodeURIComponent(value);
    }
  }
  return null;
}

/**
 * Hook to get and manage CSRF token
 */
export function useCSRFToken(): string | null {
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Get token from cookie on mount
    const csrfToken = getCSRFTokenFromCookie();
    setToken(csrfToken);
    setIsLoading(false);
  }, []);

  return token;
}

/**
 * Hook to make CSRF-protected API calls
 */
export function useCSRFProtectedFetch() {
  const csrfToken = useCSRFToken();

  return async (
    url: string,
    options: RequestInit & { method?: string } = {}
  ): Promise<Response> => {
    const method = options.method || 'GET';
    
    // Only add CSRF token for state-changing requests
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      if (!csrfToken) {
        throw new Error('CSRF token not available');
      }

      const headers = new Headers(options.headers || {});
      headers.set(CSRF_HEADER_NAME, csrfToken);
      
      return fetch(url, {
        ...options,
        method,
        headers,
      });
    }

    return fetch(url, { ...options, method });
  };
}

/**
 * Get headers object with CSRF token for fetch requests
 */
export function getCSRFHeaders(token: string | null): Record<string, string> {
  if (!token) {
    return {};
  }
  
  return {
    [CSRF_HEADER_NAME]: token,
    'Content-Type': 'application/json',
  };
}

/**
 * Wrapper for fetch that automatically includes CSRF token
 */
export async function fetchWithCSRF(
  url: string,
  options: RequestInit & { method?: string } = {}
): Promise<Response> {
  const method = options.method || 'GET';
  
  // Only add CSRF token for state-changing requests
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    const csrfToken = getCSRFTokenFromCookie();
    if (!csrfToken) {
      throw new Error('CSRF token not available');
    }

    const headers = new Headers(options.headers || {});
    headers.set('x-csrf-token', csrfToken);
    
    return fetch(url, {
      ...options,
      method,
      headers,
    });
  }

  return fetch(url, { ...options, method });
}

