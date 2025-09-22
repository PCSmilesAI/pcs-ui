import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
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



