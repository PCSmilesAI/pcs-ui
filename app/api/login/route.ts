import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'

const COOKIE_NAME = 'pcs_session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const email = (body?.email || '').toString().trim()

    // hard guard: this bypass only works when explicitly enabled
    if (process.env.DEV_LOGIN_BYPASS !== 'true') {
      return NextResponse.json({ ok: false, error: 'Login disabled' }, { status: 403 })
    }
    if (!email) {
      return NextResponse.json({ ok: false, error: 'Missing email' }, { status: 400 })
    }

    // sign a short token (15 min) using an existing secret (reuse QBO_STATE_SECRET)
    const secret = process.env.QBO_STATE_SECRET || 'change-me'
    const token = jwt.sign({ sub: email }, secret, { expiresIn: '15m' })

    const res = NextResponse.json({ ok: true, user: { email } })
    // httpOnly session cookie for server middleware or API usage
    res.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
      path: '/',
      maxAge: 60 * 15,
    })
    return res
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'unknown' }, { status: 500 })
  }
}
