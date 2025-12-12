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
    
    // If local auth fails, try Gist as fallback (for legacy users)
    try {
      console.log(`🔄 [AUTH] Trying Gist fallback for: ${email}`);
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
            
            // Sync user to local database for future logins
            const { createUser, getUserByEmail: getLocalUser, updatePassword } = await import('@/lib/auth/localUserService');
            const existingLocal = getLocalUser(email);
            
            if (existingLocal) {
              // User exists locally but password was wrong - sync password from Gist
              await updatePassword(email, password);
              console.log(`🔄 [AUTH] Synced Gist password to local DB: ${email}`);
              
              return NextResponse.json({
                success: true,
                user: {
                  name: existingLocal.name,
                  email: existingLocal.email,
                  role: existingLocal.role
                }
              });
            } else {
              // New user - create in local database
              await createUser(gistUser.email, gistUser.name, password, 'user');
              console.log(`🔄 [AUTH] Created Gist user in local DB: ${email}`);
              
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

