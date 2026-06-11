import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session/sessionMiddleware';
import { deleteSession } from '@/lib/session/sessionStore';

export const dynamic = 'force-dynamic';

const SESSION_COOKIE_NAME = 'pcs_session_id';

export async function POST(request: NextRequest) {
  const session = getSessionFromRequest(request);
  
  if (session) {
    deleteSession(session.id);
    console.log(`[AUTH] Logout for: ${session.email}`);
  }
  
  const response = NextResponse.json({ success: true });
  response.cookies.set(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  });
  
  return response;
}
