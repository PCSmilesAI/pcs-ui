import { NextRequest, NextResponse } from 'next/server';
import { createUser, getUserByEmail, seedEssentialUsers } from '@/lib/auth/localUserService';

export const dynamic = 'force-dynamic';

// Ensure essential users are seeded
let seeded = false;

export async function POST(request: NextRequest) {
  try {
    // Seed essential users on first signup attempt
    if (!seeded) {
      await seedEssentialUsers();
      seeded = true;
    }
    
    const { name, email, password, adminCode } = await request.json();
    
    if (!name || !email || !password) {
      return NextResponse.json(
        { success: false, message: 'Name, email, and password are required' },
        { status: 400 }
      );
    }
    
    // Check if user already exists
    const existing = getUserByEmail(email);
    if (existing) {
      return NextResponse.json(
        { success: false, message: 'Email already registered' },
        { status: 400 }
      );
    }
    
    // Determine role based on admin code (from environment, never hardcoded)
    let role = 'user';
    const adminSecret = process.env.ADMIN_SIGNUP_CODE;
    const apSecret = process.env.AP_SIGNUP_CODE;
    if (adminSecret && adminCode === adminSecret) {
      role = 'admin';
    } else if (apSecret && adminCode === apSecret) {
      role = 'ap_manager';
    }
    
    // Create user in local database
    const result = await createUser(email, name, password, role);
    
    if (!result.success) {
      return NextResponse.json(
        { success: false, message: result.error || 'Failed to create account' },
        { status: 400 }
      );
    }
    
    console.log(`✅ [AUTH] New user created: ${email} (${name}) - Role: ${role}`);
    
    // NOTE: Gist user sync removed — it exposed credentials publicly.
    
    return NextResponse.json({
      success: true,
      user: {
        name: result.user?.name,
        email: result.user?.email,
        role: result.user?.role
      }
    });
    
  } catch (error: any) {
    console.error('❌ [AUTH] Signup error:', error);
    return NextResponse.json(
      { success: false, message: 'An error occurred during signup' },
      { status: 500 }
    );
  }
}

