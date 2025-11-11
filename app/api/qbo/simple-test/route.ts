import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '../../../../lib/auth/currentUser';
import { isAdmin } from '../../../../lib/workflow/rolesStore';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  // SECURITY: Require admin authentication for test endpoint
  const user = getCurrentUser(req);
  const allowed = await isAdmin(user.email);

  if (!allowed) {
    console.warn('[API][QBO][SIMPLE-TEST] Unauthorized access attempt', { userEmail: user.email });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  // Use environment variables instead of hardcoded credentials
  const clientId = process.env.QBO_CLIENT_ID;
  const redirectUri = process.env.QBO_REDIRECT_URI;
  const scopes = process.env.QBO_SCOPES;

  if (!clientId || !redirectUri || !scopes) {
    // Log full error server-side only
    console.error('[QBO][SIMPLE_TEST] Missing QBO configuration');
    // Return safe error message to client
    return NextResponse.json({ error: 'Configuration error' }, { status: 500 });
  }

  // Simple state parameter
  const state = 'simple-test-' + Date.now();

  // Build simple OAuth URL
  const authUrl = `https://oauth.platform.intuit.com/oauth2/v1/authorize?client_id=${clientId}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&access_type=offline&state=${state}`;

  console.log('🔧 Simple OAuth URL:', authUrl);
  console.log('🔧 Redirect URI:', redirectUri);

  return NextResponse.redirect(authUrl, 302);
}



