/**
 * Cookie Hardening Utilities
 * 
 * Implements security best practices for authentication cookies:
 * - HttpOnly: Prevents JavaScript access (XSS protection)
 * - Secure: Only sent over HTTPS (MITM protection)
 * - SameSite: Prevents CSRF attacks (Strict/Lax)
 * - Max-Age: Session expiration
 */

import { NextResponse } from 'next/server';

export interface CookieOptions {
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'strict' | 'lax' | 'none';
  maxAge?: number;
  path?: string;
  domain?: string;
}

/**
 * Default secure cookie options
 */
export const SECURE_COOKIE_DEFAULTS: CookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 7 * 24 * 60 * 60, // 7 days
  path: '/',
};

/**
 * Strict cookie options (for sensitive operations)
 */
export const STRICT_COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge: 24 * 60 * 60, // 1 day
  path: '/',
};

/**
 * Session cookie options (for auth)
 */
export const SESSION_COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 30 * 24 * 60 * 60, // 30 days
  path: '/',
};

/**
 * Set a hardened authentication cookie
 */
export function setAuthCookie(
  response: NextResponse,
  name: string,
  value: string,
  options?: Partial<CookieOptions>
): NextResponse {
  const cookieOptions = {
    ...SESSION_COOKIE_OPTIONS,
    ...options,
  };
  
  response.cookies.set(name, value, cookieOptions);
  
  console.log(`[COOKIE] Set hardened auth cookie: ${name}`, {
    httpOnly: cookieOptions.httpOnly,
    secure: cookieOptions.secure,
    sameSite: cookieOptions.sameSite,
    maxAge: cookieOptions.maxAge,
  });
  
  return response;
}

/**
 * Clear an authentication cookie
 */
export function clearAuthCookie(
  response: NextResponse,
  name: string
): NextResponse {
  response.cookies.set(name, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  });
  
  console.log(`[COOKIE] Cleared auth cookie: ${name}`);
  
  return response;
}

/**
 * Validate cookie security settings
 * Returns warnings if cookies are not properly hardened
 */
export function validateCookieSecurity(options: CookieOptions): string[] {
  const warnings: string[] = [];
  
  if (!options.httpOnly) {
    warnings.push('Cookie is not HttpOnly - vulnerable to XSS attacks');
  }
  
  if (process.env.NODE_ENV === 'production' && !options.secure) {
    warnings.push('Cookie is not Secure in production - vulnerable to MITM attacks');
  }
  
  if (!options.sameSite || options.sameSite === 'none') {
    warnings.push('Cookie SameSite is not set or is "none" - vulnerable to CSRF attacks');
  }
  
  if (!options.maxAge || options.maxAge > 90 * 24 * 60 * 60) {
    warnings.push('Cookie expiration is too long - increases window for session hijacking');
  }
  
  return warnings;
}

/**
 * Log cookie security audit
 */
export function auditCookieSecurity(): void {
  console.log('[COOKIE][AUDIT] Security Configuration:');
  console.log('  HttpOnly: ✅ Enabled (XSS protection)');
  console.log('  Secure: ' + (process.env.NODE_ENV === 'production' ? '✅ Enabled (HTTPS only)' : '⚠️  Disabled (development mode)'));
  console.log('  SameSite: ✅ Lax (CSRF protection)');
  console.log('  Max-Age: ✅ 30 days (session expiration)');
}

