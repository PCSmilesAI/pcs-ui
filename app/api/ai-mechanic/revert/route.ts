import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '../../../../lib/auth/currentUser';
import { isAP } from '../../../../lib/workflow/rolesStore';
import { validateCSRFToken } from '../../../../lib/middleware/csrf';

export const dynamic = 'force-dynamic';

const MECHANIC_BASE_URL = process.env.MECHANIC_BASE_URL || 'http://100.82.172.44:8001';

/**
 * POST /api/ai-mechanic/revert
 * Revert a specific AI mechanic run by its ID.
 * This calls the mechanic server which performs a git revert.
 * 
 * Body: { runId: number }
 */
export async function POST(req: NextRequest) {
  const user = getCurrentUser(req);
  
  // Only admins and AP managers can revert changes
  const isAuthorized = await isAP(user.email);
  if (!isAuthorized) {
    return NextResponse.json(
      { error: 'Only admins and AP managers can revert AI mechanic changes' },
      { status: 403 }
    );
  }

  // CSRF protection
  const csrfValid = validateCSRFToken(req);
  if (!csrfValid) {
    return NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { runId } = body;

    if (!runId || typeof runId !== 'number') {
      return NextResponse.json(
        { error: 'runId is required and must be a number' },
        { status: 400 }
      );
    }

    const endpoint = `${MECHANIC_BASE_URL}/audit/${runId}/revert`;
    console.log('[AI-MECHANIC][REVERT]', 'reverting', { runId, userEmail: user.email });

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('[AI-MECHANIC][REVERT]', 'mechanic_error', { 
        status: response.status, 
        error: errorData 
      });
      return NextResponse.json(
        { error: errorData?.error || 'Failed to revert change' },
        { status: response.status }
      );
    }

    const data = await response.json();
    console.log('[AI-MECHANIC][REVERT]', 'success', { 
      runId, 
      revertCommit: data?.revert_commit,
      userEmail: user.email 
    });

    return NextResponse.json({
      ok: true,
      message: 'Change reverted successfully',
      revert_commit: data?.revert_commit,
    });

  } catch (error: any) {
    console.error('[AI-MECHANIC][REVERT]', 'error', { error: error?.message });
    
    if (error?.code === 'ECONNREFUSED' || error?.cause?.code === 'ECONNREFUSED') {
      return NextResponse.json(
        { error: 'AI Mechanic server is not reachable' },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to revert change' },
      { status: 500 }
    );
  }
}

