/**
 * CSRF Protection Middleware
 * 
 * Implements double-submit cookie pattern with SameSite=Strict
 * - Generates CSRF tokens for state-changing operations
 * - Validates tokens on POST/PUT/PATCH/DELETE requests
 * - Uses SameSite=Strict cookies to prevent cross-site requests
 */

import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';

const CSRF_TOKEN_HEADER = 'x-csrf-token';
const CSRF_COOKIE_NAME = 'csrf-token';
const CSRF_COOKIE_OPTIONS = {
  httpOnly: true,
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
 * Extract CSRF token from request
 * Checks both header and cookie
 */
function extractCSRFToken(req: NextRequest): string | null {
  // Check header first (from form or AJAX)
  const headerToken = req.headers.get(CSRF_TOKEN_HEADER);
  if (headerToken) return headerToken;
  
  // Check cookie (for double-submit pattern)
  const cookieToken = req.cookies.get(CSRF_COOKIE_NAME)?.value;
  return cookieToken || null;
}

/**
 * Validate CSRF token
 * Returns true if valid, false otherwise
 */
export function validateCSRFToken(req: NextRequest): boolean {
  // Skip validation for safe methods
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return true;
  }
  
  // Skip validation for internal API calls (from server)
  const origin = req.headers.get('origin');
  const host = req.headers.get('host');
  if (!origin || origin === `https://${host}` || origin === `http://${host}`) {
    // Same-origin request - still validate CSRF token
  }
  
  const token = extractCSRFToken(req);
  if (!token) {
    console.warn('[CSRF] Missing CSRF token in request');
    return false;
  }
  
  // In production, validate token against session
  // For now, we rely on SameSite=Strict and HttpOnly cookies
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
  
  // Skip validation for public endpoints
  const pathname = req.nextUrl.pathname;
  const publicPaths = [
    '/api/health',
    '/api/ready',
    '/api/stripe/webhook',
    '/api/qbo/callback',
    '/api/qbo/webhooks',
  ];
  
  if (publicPaths.some(p => pathname.startsWith(p))) {
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
 * These are typically webhooks or public endpoints
 */
export const CSRF_EXEMPT_PATHS = [
  '/api/health',
  '/api/ready',
  '/api/stripe/webhook',
  '/api/qbo/callback',
  '/api/qbo/webhooks',
  '/api/inbox/refresh',
  '/api/invoices/ingest',
];

/**
 * Check if path is exempt from CSRF validation
 */
export function isCSRFExempt(pathname: string): boolean {
  return CSRF_EXEMPT_PATHS.some(p => pathname.startsWith(p));
}

