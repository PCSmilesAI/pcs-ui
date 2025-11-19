import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '../../../lib/auth/currentUser';
import { getAllClinics } from '../../../lib/invoices/coding-template-service';

export const dynamic = 'force-dynamic';

/**
 * GET /api/clinics
 * 
 * List all clinic locations.
 * Accessible to all authenticated users.
 */
export async function GET(req: NextRequest) {
  const user = getCurrentUser(req);

  try {
    const clinics = getAllClinics();

    return NextResponse.json({
      ok: true,
      clinics
    });
  } catch (error: any) {
    console.error('[API][CLINICS]', 'GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

