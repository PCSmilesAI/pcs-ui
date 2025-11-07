import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '../../../../lib/auth/currentUser'
import { isAdmin } from '../../../../lib/workflow/rolesStore'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  // SECURITY: Require admin authentication for debug endpoint
  const user = getCurrentUser(req)
  const allowed = await isAdmin(user.email)

  if (!allowed) {
    console.warn('[API][QBO][ENV] Unauthorized access attempt', { userEmail: user.email })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const {
    QBO_CLIENT_ID,
    QBO_CLIENT_SECRET,
    QBO_REDIRECT_URI,
    QBO_SCOPES,
    QBO_STATE_SECRET,
    QBO_ENV,
    NEXT_PUBLIC_APP_URL
  } = process.env as Record<string, string | undefined>

  const present = {
    QBO_CLIENT_ID: !!QBO_CLIENT_ID,
    QBO_CLIENT_SECRET: !!QBO_CLIENT_SECRET,
    QBO_REDIRECT_URI: !!QBO_REDIRECT_URI,
    QBO_SCOPES: !!QBO_SCOPES,
    QBO_STATE_SECRET: !!QBO_STATE_SECRET,
    QBO_ENV: !!QBO_ENV,
    NEXT_PUBLIC_APP_URL: !!NEXT_PUBLIC_APP_URL
  }

  const missing = Object.entries(present)
    .filter(([, ok]) => !ok)
    .map(([k]) => k)

  return NextResponse.json({ ok: missing.length === 0, present, missing })
}



