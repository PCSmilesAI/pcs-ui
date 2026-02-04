import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '../../../../lib/auth/currentUser';
import { updateUserRole, getUserByEmail } from '../../../../lib/auth/localUserService';
import { isAdmin } from '../../../../lib/workflow/rolesStore';

export const dynamic = 'force-dynamic';

/**
 * Update a user's role
 * POST /api/auth/update-role
 * Body: { email: string, role: string }
 * 
 * Only admins can update user roles.
 * Valid roles: 'admin', 'ap_manager', 'office_manager', 'user', 'employee'
 */
export async function POST(req: NextRequest) {
  const currentUser = getCurrentUser(req);
  
  // Only admins can update roles
  const isCurrentUserAdmin = await isAdmin(currentUser.email);
  if (!isCurrentUserAdmin) {
    return NextResponse.json({ error: 'Unauthorized - only admins can update user roles' }, { status: 403 });
  }
  
  try {
    const body = await req.json();
    const { email, role } = body;
    
    if (!email || !role) {
      return NextResponse.json({ error: 'Missing email or role' }, { status: 400 });
    }
    
    // Validate role
    const validRoles = ['admin', 'ap_manager', 'office_manager', 'user', 'employee'];
    if (!validRoles.includes(role)) {
      return NextResponse.json({ 
        error: `Invalid role. Must be one of: ${validRoles.join(', ')}` 
      }, { status: 400 });
    }
    
    // Check if user exists
    const user = getUserByEmail(email);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    
    // Update role
    const result = updateUserRole(email, role);
    
    if (result.success) {
      // Get updated user
      const updatedUser = getUserByEmail(email);
      return NextResponse.json({ 
        ok: true, 
        message: `Role updated successfully`,
        user: {
          email: updatedUser?.email,
          name: updatedUser?.name,
          role: updatedUser?.role,
        }
      });
    } else {
      return NextResponse.json({ error: result.error || 'Failed to update role' }, { status: 500 });
    }
  } catch (error: any) {
    console.error('[API][UPDATE-ROLE]', 'error', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

/**
 * Get a user's current role
 * GET /api/auth/update-role?email=user@example.com
 */
export async function GET(req: NextRequest) {
  const currentUser = getCurrentUser(req);
  
  // Only admins can view roles
  const isCurrentUserAdmin = await isAdmin(currentUser.email);
  if (!isCurrentUserAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }
  
  const email = req.nextUrl.searchParams.get('email');
  if (!email) {
    return NextResponse.json({ error: 'Missing email parameter' }, { status: 400 });
  }
  
  const user = getUserByEmail(email);
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }
  
  return NextResponse.json({
    ok: true,
    user: {
      email: user.email,
      name: user.name,
      role: user.role,
    }
  });
}
