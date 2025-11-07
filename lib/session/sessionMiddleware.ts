/**
 * Session Middleware
 * 
 * Manages session cookies and validates session state
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession, createSession, deleteSession } from './sessionStore';

const SESSION_COOKIE_NAME = 'pcs_session_id';
const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: 30 * 24 * 60 * 60, // 30 days
  path: '/',
};

/**
 * Get session from request
 */
export function getSessionFromRequest(req: NextRequest): any | null {
  const sessionId = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!sessionId) return null;

  const session = getSession(sessionId);
  return session;
}

/**
 * Create session cookie
 */
export function createSessionCookie(
  response: NextResponse,
  email: string,
  name: string,
  role?: string
): NextResponse {
  const session = createSession(email, name, role);
  
  response.cookies.set(SESSION_COOKIE_NAME, session.id, SESSION_COOKIE_OPTIONS);
  
  console.log('[SESSION][MIDDLEWARE] Created session cookie:', {
    sessionId: session.id,
    email,
  });

  return response;
}

/**
 * Clear session cookie
 */
export function clearSessionCookie(response: NextResponse): NextResponse {
  const sessionId = response.cookies.get(SESSION_COOKIE_NAME)?.value;
  
  if (sessionId) {
    deleteSession(sessionId);
  }

  response.cookies.set(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  });

  console.log('[SESSION][MIDDLEWARE] Cleared session cookie');

  return response;
}

/**
 * Validate session middleware
 */
export function validateSessionMiddleware(req: NextRequest): NextResponse | null {
  const sessionId = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  
  if (!sessionId) {
    return null; // No session, allow request to proceed
  }

  const session = getSession(sessionId);
  
  if (!session) {
    // Session expired or invalid
    console.warn('[SESSION][MIDDLEWARE] Invalid or expired session:', sessionId);
    return NextResponse.json(
      { error: 'Session expired' },
      { status: 401 }
    );
  }

  return null; // Session valid, allow request to proceed
}

/**
 * Middleware to require valid session
 */
export function requireSessionMiddleware(req: NextRequest): NextResponse | null {
  const sessionId = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  
  if (!sessionId) {
    return NextResponse.json(
      { error: 'Unauthorized - no session' },
      { status: 401 }
    );
  }

  const session = getSession(sessionId);
  
  if (!session) {
    return NextResponse.json(
      { error: 'Unauthorized - session expired' },
      { status: 401 }
    );
  }

  return null; // Session valid
}

/**
 * Middleware to require specific role
 */
export function requireRoleMiddleware(
  req: NextRequest,
  requiredRole: string
): NextResponse | null {
  const sessionId = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  
  if (!sessionId) {
    return NextResponse.json(
      { error: 'Unauthorized - no session' },
      { status: 401 }
    );
  }

  const session = getSession(sessionId);
  
  if (!session) {
    return NextResponse.json(
      { error: 'Unauthorized - session expired' },
      { status: 401 }
    );
  }

  if (session.role !== requiredRole) {
    return NextResponse.json(
      { error: `Forbidden - requires ${requiredRole} role` },
      { status: 403 }
    );
  }

  return null; // Session valid and role matches
}

