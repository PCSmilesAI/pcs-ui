import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/currentUser';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = getCurrentUser(req);
  
  if (!user.isAuthenticated) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
  
  return NextResponse.json({
    authenticated: true,
    user: {
      email: user.email,
      name: user.name,
      isAdmin: user.isAdmin,
    }
  });
}
