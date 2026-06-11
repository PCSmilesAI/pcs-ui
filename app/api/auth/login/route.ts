import { NextRequest, NextResponse } from 'next/server';
import { verifyPassword, seedEssentialUsers } from '@/lib/auth/localUserService';
import { createSessionCookie } from '@/lib/session/sessionMiddleware';

export const dynamic = 'force-dynamic';

let seeded = false;

export async function POST(request: NextRequest) {
  try {
    if (!seeded) {
      await seedEssentialUsers();
      seeded = true;
    }
    
    const { email, password } = await request.json();
    
    if (!email || !password) {
      return NextResponse.json(
        { success: false, message: 'Email and password are required' },
        { status: 400 }
      );
    }
    
    console.log(`[AUTH] Login attempt for: ${email}`);
    
    const result = await verifyPassword(email, password);
    
    if (result.success && result.user) {
      const { password_hash, ...safeUser } = result.user;
      
      // Create response with session cookie (httpOnly, signed, server-side)
      const response = NextResponse.json({
        success: true,
        user: {
          name: safeUser.name,
          email: safeUser.email,
          role: safeUser.role,
        }
      });
      
      createSessionCookie(response, safeUser.email, safeUser.name, safeUser.role);
      
      console.log(`[AUTH] Login success for: ${email} (role: ${safeUser.role})`);
      return response;
    }
    
    console.log(`[AUTH] Auth failed for: ${email}`);
    return NextResponse.json(
      { success: false, message: 'Invalid email or password' },
      { status: 401 }
    );
    
  } catch (error: any) {
    console.error('[AUTH] Login error:', error);
    return NextResponse.json(
      { success: false, message: 'An error occurred during login' },
      { status: 500 }
    );
  }
}

