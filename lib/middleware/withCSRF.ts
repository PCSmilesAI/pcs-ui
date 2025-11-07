/**
 * Higher-order function to wrap API routes with CSRF protection
 * 
 * Usage:
 * export const POST = withCSRF(async (req) => {
 *   // Your handler code
 * });
 */

import { NextRequest, NextResponse } from 'next/server';
import { csrfMiddleware, isCSRFExempt, addCSRFTokenToResponse } from './csrf';

type Handler = (req: NextRequest) => Promise<NextResponse>;

/**
 * Wrap an API handler with CSRF protection
 */
export function withCSRF(handler: Handler): Handler {
  return async (req: NextRequest) => {
    // Check if path is exempt from CSRF validation
    if (isCSRFExempt(req.nextUrl.pathname)) {
      return handler(req);
    }
    
    // Validate CSRF token for state-changing requests
    const csrfError = csrfMiddleware(req);
    if (csrfError) {
      return csrfError;
    }
    
    // Call the handler
    const response = await handler(req);
    
    // Add CSRF token to response for next request
    return addCSRFTokenToResponse(response);
  };
}

/**
 * Wrap multiple handlers (GET, POST, etc.)
 */
export function withCSRFHandlers(handlers: Record<string, Handler>): Record<string, Handler> {
  const wrapped: Record<string, Handler> = {};
  
  for (const [method, handler] of Object.entries(handlers)) {
    wrapped[method] = withCSRF(handler);
  }
  
  return wrapped;
}

