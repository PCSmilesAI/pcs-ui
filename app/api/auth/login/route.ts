import { NextRequest, NextResponse } from 'next/server';
import { verifyPassword, getUserByEmail, seedEssentialUsers } from '@/lib/auth/localUserService';

export const dynamic = 'force-dynamic';

// Ensure essential users are seeded on first request
let seeded = false;

export async function POST(request: NextRequest) {
  try {
    // Seed essential users on first login attempt (ensures McKay/Braxton always exist)
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
    
    console.log(`🔐 [AUTH] Login attempt for: ${email}`);
    
    // Try local database first
    const result = await verifyPassword(email, password);
    
    if (result.success && result.user) {
      // Return user info (without password hash)
      const { password_hash, ...safeUser } = result.user;
      return NextResponse.json({
        success: true,
        user: {
          name: safeUser.name,
          email: safeUser.email,
          role: safeUser.role,
        }
      });
    }
    
    // Check if user exists in local DB - if so, local DB is source of truth
    const localUser = getUserByEmail(email);
    
    if (localUser) {
      // User exists locally - DO NOT fall back to Gist
      // This prevents Gist from overwriting password changes made in local DB
      console.log(`❌ [AUTH] Local auth failed for existing user: ${email}`);
      return NextResponse.json(
        { success: false, message: 'Invalid email or password' },
        { status: 401 }
      );
    }
    
    // User doesn't exist locally - try Gist as fallback (for migration only)
    try {
      console.log(`🔄 [AUTH] User not in local DB, trying Gist for: ${email}`);
      const gistResponse = await fetch(`${request.nextUrl.origin}/api/gist-users`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store'
      });
      
      if (gistResponse.ok) {
        const gistUsers = await gistResponse.json();
        const bcrypt = (await import('bcryptjs')).default;
        
        const gistUser = gistUsers.find((u: any) => 
          u.email?.toLowerCase() === email.toLowerCase()
        );
        
        if (gistUser) {
          // Check if password is hashed or plaintext
          let isValid = false;
          if (gistUser.password.startsWith('$2')) {
            // Hashed password
            isValid = await bcrypt.compare(password, gistUser.password);
          } else {
            // Plaintext password (legacy)
            isValid = gistUser.password === password;
          }
          
          if (isValid) {
            console.log(`✅ [AUTH] Gist login successful for: ${email}`);
            
            // Create user in local database (one-time migration)
            const { createUser } = await import('@/lib/auth/localUserService');
            await createUser(gistUser.email, gistUser.name, password, 'user');
            console.log(`🔄 [AUTH] Migrated Gist user to local DB: ${email}`);
            
            return NextResponse.json({
              success: true,
              user: {
                name: gistUser.name,
                email: gistUser.email,
                role: 'user'
              }
            });
          }
        }
      }
    } catch (gistError: any) {
      console.warn(`⚠️ [AUTH] Gist fallback failed: ${gistError.message}`);
    }
    
    // Both local and Gist auth failed
    return NextResponse.json(
      { success: false, message: 'Invalid email or password' },
      { status: 401 }
    );
    
  } catch (error: any) {
    console.error('❌ [AUTH] Login error:', error);
    return NextResponse.json(
      { success: false, message: 'An error occurred during login' },
      { status: 500 }
    );
  }
}

