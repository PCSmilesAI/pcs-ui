import type { NextRequest } from 'next/server';
import { getSessionFromRequest } from '../session/sessionMiddleware';
import { isAdmin as checkIsAdmin } from '../workflow/rolesStore';

export interface CurrentUser {
  email: string;
  name: string;
  isAdmin: boolean;
  isAuthenticated: boolean;
}

/**
 * Get the current user from the server-side session.
 * Identity is derived from a signed httpOnly session cookie looked up in the DB.
 * Falls back to the legacy `pcs_user`/`loggedInUser` cookie ONLY during transition
 * (will be removed once all clients re-login).
 */
export function getCurrentUser(req: NextRequest): CurrentUser {
  // Primary: server-validated session
  const session = getSessionFromRequest(req);
  if (session) {
    const normalisedEmail = session.email.trim().toLowerCase();
    let admin = false;
    try {
      // checkIsAdmin is async in some paths; use sync check against roles
      admin = session.role === 'admin';
    } catch (_) {}
    
    return {
      email: normalisedEmail,
      name: session.name || normalisedEmail,
      isAdmin: admin,
      isAuthenticated: true,
    };
  }

  // Legacy fallback: trust the old cookie during transition period.
  // This allows existing logged-in users to keep working until they re-login.
  // Once all users have re-logged, remove this block.
  const legacyCookie = req.cookies.get('pcs_user')?.value || req.cookies.get('loggedInUser')?.value;
  if (legacyCookie) {
    try {
      const parsed = JSON.parse(legacyCookie);
      if (parsed && typeof parsed.email === 'string') {
        const normalisedEmail = parsed.email.trim().toLowerCase();
        return {
          email: normalisedEmail,
          name: parsed.name || normalisedEmail,
          isAdmin: false, // Legacy cookie users are NOT treated as admin
          isAuthenticated: true,
        };
      }
    } catch (_) {}
  }

  // No valid session
  return {
    email: '',
    name: 'anonymous',
    isAdmin: false,
    isAuthenticated: false,
  };
}
