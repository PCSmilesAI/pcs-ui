import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '../../../../lib/auth/currentUser';
import { isAP } from '../../../../lib/workflow/rolesStore';

export const dynamic = 'force-dynamic';

const MECHANIC_BASE_URL = process.env.MECHANIC_BASE_URL || 'http://100.82.172.44:8001';

/**
 * GET /api/ai-mechanic/audit
 * Fetch the AI mechanic audit trail from the Mac Mini mechanic server.
 * Returns list of recent AI mechanic runs with metadata.
 * 
 * Optional query params:
 * - id: Get details for a specific run
 * - limit: Max number of runs to return (default 100)
 */
export async function GET(req: NextRequest) {
  const user = getCurrentUser(req);
  
  // Only admins and AP managers can view audit trail
  const isAuthorized = await isAP(user.email);
  if (!isAuthorized) {
    return NextResponse.json(
      { error: 'Only admins and AP managers can view the AI mechanic audit trail' },
      { status: 403 }
    );
  }

  try {
    const { searchParams } = new URL(req.url);
    const runId = searchParams.get('id');
    const limit = searchParams.get('limit') || '100';

    let endpoint = `${MECHANIC_BASE_URL}/audit`;
    if (runId) {
      endpoint = `${MECHANIC_BASE_URL}/audit/${encodeURIComponent(runId)}`;
    } else {
      endpoint = `${MECHANIC_BASE_URL}/audit?limit=${encodeURIComponent(limit)}`;
    }

    console.log('[AI-MECHANIC][AUDIT]', 'fetching', { endpoint, userEmail: user.email });

    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[AI-MECHANIC][AUDIT]', 'mechanic_error', { status: response.status, error: errorText });
      return NextResponse.json(
        { error: 'Failed to fetch audit trail from mechanic' },
        { status: response.status }
      );
    }

    const data = await response.json();
    console.log('[AI-MECHANIC][AUDIT]', 'success', { 
      runCount: Array.isArray(data) ? data.length : 1,
      userEmail: user.email 
    });

    return NextResponse.json(data);

  } catch (error: any) {
    console.error('[AI-MECHANIC][AUDIT]', 'error', { error: error?.message });
    
    // Check if mechanic is unreachable
    if (error?.code === 'ECONNREFUSED' || error?.cause?.code === 'ECONNREFUSED') {
      return NextResponse.json(
        { error: 'AI Mechanic server is not reachable', detail: 'The Mac Mini mechanic server may be offline' },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to fetch audit trail' },
      { status: 500 }
    );
  }
}

