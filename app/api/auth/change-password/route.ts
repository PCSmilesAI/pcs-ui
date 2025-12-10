import { NextRequest, NextResponse } from 'next/server';
import { verifyPassword, updatePassword, getUserByEmail } from '@/lib/auth/localUserService';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { email, currentPassword, newPassword } = await request.json();
    
    if (!email || !currentPassword || !newPassword) {
      return NextResponse.json(
        { success: false, message: 'Email, current password, and new password are required' },
        { status: 400 }
      );
    }
    
    if (newPassword.length < 6) {
      return NextResponse.json(
        { success: false, message: 'New password must be at least 6 characters' },
        { status: 400 }
      );
    }
    
    console.log(`🔐 [AUTH] Password change request for: ${email}`);
    
    // First verify the current password
    const verifyResult = await verifyPassword(email, currentPassword);
    
    if (!verifyResult.success) {
      console.log(`❌ [AUTH] Current password verification failed for: ${email}`);
      return NextResponse.json(
        { success: false, message: 'Current password is incorrect' },
        { status: 401 }
      );
    }
    
    // Update to new password
    const updateResult = await updatePassword(email, newPassword);
    
    if (!updateResult.success) {
      console.error(`❌ [AUTH] Password update failed for: ${email}`);
      return NextResponse.json(
        { success: false, message: updateResult.error || 'Failed to update password' },
        { status: 500 }
      );
    }
    
    console.log(`✅ [AUTH] Password changed successfully for: ${email}`);
    
    return NextResponse.json({
      success: true,
      message: 'Password updated successfully'
    });
    
  } catch (error: any) {
    console.error('❌ [AUTH] Password change error:', error);
    return NextResponse.json(
      { success: false, message: 'An error occurred while changing password' },
      { status: 500 }
    );
  }
}

