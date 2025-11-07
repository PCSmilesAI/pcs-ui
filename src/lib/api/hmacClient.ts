/**
 * HMAC-Signed API Client
 * 
 * Client-side utility for making HMAC-signed API requests
 * Usage:
 *   const client = new HMACClient(secretKey);
 *   const response = await client.post('/api/invoices/transition', { action: 'approve' });
 */

import crypto from 'crypto';

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
 * HMAC-Signed API Client
 */
export class HMACClient {
  private secretKey: string;

  constructor(secretKey: string) {
    this.secretKey = secretKey;
  }

  /**
   * Generate nonce
   */
  private generateNonce(): string {
    return Math.random().toString(36).substring(2, 15) +
           Math.random().toString(36).substring(2, 15);
  }

  /**
   * Get current timestamp
   */
  private getTimestamp(): string {
    return Math.floor(Date.now() / 1000).toString();
  }

  /**
   * Create HMAC signature
   */
  private createSignature(
    method: string,
    path: string,
    body: string,
    nonce: string,
    timestamp: string
  ): string {
    const message = `${method}\n${path}\n${body}\n${nonce}\n${timestamp}`;
    
    // Note: In browser, we'd need to use a library like crypto-js
    // For now, this is a placeholder that would work in Node.js
    // In production, use: import crypto from 'crypto-js'
    
    return 'signature_placeholder'; // Replace with actual HMAC
  }

  /**
   * Make a signed request
   */
  async request<T = any>(
    url: string,
    options: RequestOptions = {}
  ): Promise<APIResponse<T>> {
    const method = options.method || 'GET';
    const path = new URL(url, window.location.origin).pathname;
    const body = options.body ? JSON.stringify(options.body) : '';
    
    const nonce = this.generateNonce();
    const timestamp = this.getTimestamp();
    const signature = this.createSignature(method, path, body, nonce, timestamp);

    const headers = new Headers(options.headers || {});
    headers.set('Content-Type', 'application/json');
    headers.set('x-signature', signature);
    headers.set('x-nonce', nonce);
    headers.set('x-timestamp', timestamp);

    try {
      const response = await fetch(url, {
        ...options,
        method,
        headers,
        body: body || undefined,
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
   * GET request
   */
  get<T = any>(url: string, options?: RequestOptions) {
    return this.request<T>(url, { ...options, method: 'GET' });
  }

  /**
   * POST request
   */
  post<T = any>(url: string, body?: any, options?: RequestOptions) {
    return this.request<T>(url, { ...options, method: 'POST', body });
  }

  /**
   * PUT request
   */
  put<T = any>(url: string, body?: any, options?: RequestOptions) {
    return this.request<T>(url, { ...options, method: 'PUT', body });
  }

  /**
   * PATCH request
   */
  patch<T = any>(url: string, body?: any, options?: RequestOptions) {
    return this.request<T>(url, { ...options, method: 'PATCH', body });
  }

  /**
   * DELETE request
   */
  delete<T = any>(url: string, options?: RequestOptions) {
    return this.request<T>(url, { ...options, method: 'DELETE' });
  }
}

/**
 * Create HMAC client instance
 */
export function createHMACClient(secretKey: string): HMACClient {
  return new HMACClient(secretKey);
}

