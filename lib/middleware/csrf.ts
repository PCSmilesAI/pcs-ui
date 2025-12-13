/**
 * CSRF Protection Middleware
 * 
 * Implements double-submit cookie pattern with SameSite=Strict
 * - Generates CSRF tokens for state-changing operations
 * - Validates tokens on POST/PUT/PATCH/DELETE requests
 * - Uses SameSite=Strict cookies to prevent cross-site requests
 * 
 * Security: The double-submit pattern requires:
 * 1. A cookie containing the CSRF token (sent automatically by browser)
 * 2. A header containing the same token (must be set by JavaScript)
 * 3. Both values must match for the request to be valid
 * 
 * This works because an attacker can't read the cookie value (same-origin policy)
 * so they can't set the matching header value even if they can trigger requests.
 */

import { NextRequest, NextResponse } from 'next/server';
import { randomBytes, timingSafeEqual } from 'crypto';

const CSRF_TOKEN_HEADER = 'x-csrf-token';
const CSRF_COOKIE_NAME = 'csrf-token';
const CSRF_COOKIE_OPTIONS = {
  // httpOnly: false - JS needs to read the cookie to send it in the header
  // This is safe because same-origin policy prevents cross-site cookie reading
  httpOnly: false,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  maxAge: 3600, // 1 hour
  path: '/',
};

/**
 * Generate a new CSRF token
 */
export function generateCSRFToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Extract CSRF tokens from request (both header and cookie)
 * For double-submit pattern, we need BOTH values
 */
function extractCSRFTokens(req: NextRequest): { headerToken: string | null; cookieToken: string | null } {
  const headerToken = req.headers.get(CSRF_TOKEN_HEADER);
  const cookieToken = req.cookies.get(CSRF_COOKIE_NAME)?.value || null;
  return { headerToken, cookieToken };
}

/**
 * Timing-safe string comparison to prevent timing attacks
 */
function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  try {
    return timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
  } catch {
    return false;
  }
}

/**
 * Validate CSRF token using double-submit cookie pattern
 * Returns true if valid, false otherwise
 * 
 * Security: Both the cookie and header must be present and must match.
 * This prevents CSRF because an attacker cannot read the cookie value
 * from another origin to set the header.
 */
export function validateCSRFToken(req: NextRequest): boolean {
  // Skip validation for safe methods (idempotent, no side effects)
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return true;
  }
  
  // Extract both tokens
  const { headerToken, cookieToken } = extractCSRFTokens(req);
  
  // Both tokens must be present
  if (!headerToken) {
    console.warn('[CSRF] Missing CSRF token in header (x-csrf-token)');
    return false;
  }
  
  if (!cookieToken) {
    console.warn('[CSRF] Missing CSRF token in cookie');
    return false;
  }
  
  // Tokens must match (use timing-safe comparison)
  if (!safeCompare(headerToken, cookieToken)) {
    console.warn('[CSRF] CSRF token mismatch - possible CSRF attack');
    return false;
  }
  
  // Validate token format (should be 64 hex chars = 32 bytes)
  if (!/^[a-f0-9]{64}$/i.test(headerToken)) {
    console.warn('[CSRF] Invalid CSRF token format');
    return false;
  }
  
  return true;
}

/**
 * Middleware to validate CSRF tokens on state-changing requests
 */
export function csrfMiddleware(req: NextRequest): NextResponse | null {
  // Skip validation for safe methods
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return null;
  }
  
  // Skip validation for exempt paths (webhooks, health checks, etc.)
  const pathname = req.nextUrl.pathname;
  if (isCSRFExempt(pathname)) {
    return null;
  }
  
  // Validate CSRF token
  if (!validateCSRFToken(req)) {
    console.error('[CSRF] CSRF validation failed for:', pathname);
    return NextResponse.json(
      { error: 'CSRF token validation failed' },
      { status: 403 }
    );
  }
  
  return null;
}

/**
 * Add CSRF token to response
 * Sets cookie and returns token for client
 */
export function addCSRFTokenToResponse(
  response: NextResponse,
  token?: string
): NextResponse {
  const csrfToken = token || generateCSRFToken();
  
  response.cookies.set(CSRF_COOKIE_NAME, csrfToken, CSRF_COOKIE_OPTIONS);
  response.headers.set(CSRF_TOKEN_HEADER, csrfToken);
  
  return response;
}

/**
 * Get CSRF token from request (for reading current token)
 */
export function getCSRFToken(req: NextRequest): string | null {
  return req.cookies.get(CSRF_COOKIE_NAME)?.value || null;
}

/**
 * Exempt paths from CSRF validation
 * These are typically webhooks, public endpoints, or auth endpoints
 * where no session/cookie exists yet
 */
export const CSRF_EXEMPT_PATHS = [
  '/api/health',
  '/api/ready',
  '/api/stripe/webhook',
  '/api/qbo/callback',
  '/api/qbo/webhooks',
  '/api/inbox/refresh',
  '/api/invoices/ingest',
  '/api/auth/login',      // Login doesn't have CSRF cookie yet
  '/api/auth/signup',     // Signup doesn't have CSRF cookie yet
];

/**
 * Check if path is exempt from CSRF validation
 */
export function isCSRFExempt(pathname: string): boolean {
  return CSRF_EXEMPT_PATHS.some(p => pathname.startsWith(p));
}

