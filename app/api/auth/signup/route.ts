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
    
    // Determine role based on admin code
    let role = 'user';
    if (adminCode === 'PCSADMIN2024') {
      role = 'admin';
    } else if (adminCode === 'PCSAP2024') {
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
    
    // Also try to sync to Gist (best effort, don't fail if this fails)
    try {
      const gistResponse = await fetch(`${request.nextUrl.origin}/api/gist-users`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store'
      });
      
      if (gistResponse.ok) {
        const gistUsers = await gistResponse.json();
        const bcrypt = (await import('bcryptjs')).default;
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Add new user to Gist
        gistUsers.push({ name, email, password: hashedPassword });
        
        // Try to update Gist
        await fetch(`${request.nextUrl.origin}/api/update-gist`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ users: gistUsers })
        });
        console.log(`🔄 [AUTH] Synced new user to Gist: ${email}`);
      }
    } catch (gistError: any) {
      console.warn(`⚠️ [AUTH] Failed to sync to Gist (user saved locally): ${gistError.message}`);
    }
    
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

