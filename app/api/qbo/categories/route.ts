import 'server-only'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import path from 'path'
import fs from 'fs'
import Database from 'better-sqlite3'

type Tokens = {
  access_token: string
  refresh_token: string
  realm_id: string
  expires_at: number // epoch ms (ms, not s)
  token_type?: string
}

const DB_PATH = path.resolve(process.cwd(), 'pcs_ai_data/qbo_tokens.db')

function openDb() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true })
  return new Database(DB_PATH)
}

/* --------- wire these to your SQLite tokenStorage ---------- */
async function getLatestTokens(): Promise<Tokens | null> {
  const db = openDb()
  const row = db
    .prepare(
      'SELECT realm_id, access_token, refresh_token, expires_at FROM qbo_tokens ORDER BY updated_at DESC LIMIT 1'
    )
    .get() as any
  db.close()
  
  if (!row) return null
  
  return {
    access_token: row.access_token,
    refresh_token: row.refresh_token,
    realm_id: row.realm_id,
    expires_at: row.expires_at * 1000, // convert to ms
    token_type: 'Bearer'
  }
}

async function saveTokens(t: Tokens): Promise<void> {
  const db = openDb()
  db.prepare(
    `INSERT OR REPLACE INTO qbo_tokens (realm_id, access_token, refresh_token, expires_at, updated_at)
     VALUES (@realm_id, @access_token, @refresh_token, @expires_at, strftime('%s','now'))`
  ).run({
    realm_id: t.realm_id,
    access_token: t.access_token,
    refresh_token: t.refresh_token,
    expires_at: Math.floor(t.expires_at / 1000), // convert to seconds
  })
  db.close()
}
/* ----------------------------------------------------------- */

const INTUIT_TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer'
const QBO_BASE = 'https://quickbooks.api.intuit.com/v3/company'

function j(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...extraHeaders },
  })
}

async function ensureAccessToken(tokens: Tokens): Promise<Tokens> {
  const aboutToExpire = !tokens.expires_at || Date.now() > tokens.expires_at - 120_000
  if (!aboutToExpire) return tokens

  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: tokens.refresh_token,
  })
  const basic = Buffer.from(
    `${process.env.QBO_CLIENT_ID}:${process.env.QBO_CLIENT_SECRET}`
  ).toString('base64')

  const r = await fetch(INTUIT_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: params,
  })

  const text = await r.text()
  let json: any = {}
  try { json = JSON.parse(text) } catch {}

  if (!r.ok) {
    // Log full error server-side only
    console.error('[QBO][refresh_failed]', r.status, text)
    // Return safe error message to client
    throw j({ error: 'refresh_failed' }, 401)
  }

  const expiresInSec = Number(json.expires_in ?? 3600)
  const updated: Tokens = {
    access_token: json.access_token,
    refresh_token: json.refresh_token ?? tokens.refresh_token,
    realm_id: tokens.realm_id,
    token_type: json.token_type ?? 'Bearer',
    expires_at: Date.now() + expiresInSec * 1000,
  }
  await saveTokens(updated)
  return updated
}

async function qboQuery(tokens: Tokens, sql: string, minor = '65'): Promise<any> {
  const url = `${QBO_BASE}/${tokens.realm_id}/query?query=${encodeURIComponent(sql)}&minorversion=${minor}`
  const doFetch = async (accessToken: string) =>
    fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        'Content-Type': 'application/text',
      },
    })

  let res = await doFetch(tokens.access_token)
  if (res.status === 401) {
    const t = await ensureAccessToken(tokens)
    res = await doFetch(t.access_token)
  }

  const text = await res.text()
  let data: any = {}
  try { data = JSON.parse(text) } catch {}

  if (!res.ok) {
    // Log full error server-side only
    console.error('[QBO][query_failed]', res.status, text.slice(0, 400))
    // Return safe error message to client
    throw j({ error: 'qbo_query_failed', status: res.status }, res.status)
  }
  return data
}

function mapAccounts(data: any) {
  const list = data?.QueryResponse?.Account ?? []
  return list.map((a: any) => ({
    id: a.Id,
    name: a.Name,
    fullName: a.FullyQualifiedName || a.Name,
    type: a.AccountType,
    subtype: a.AccountSubType,
    classification: a.Classification,
  }))
}

export async function GET(req: Request) {
  try {
    const debug = new URL(req.url).searchParams.get('debug') === '1'

    const tokens = await getLatestTokens()
    if (!tokens?.realm_id) {
      return j({ error: 'not_connected', detail: 'No realm_id/tokens found.' }, 401)
    }

    const valid = await ensureAccessToken(tokens)

    // 1) Preferred: AccountType filter (typical expense coding)
    const sql1 = `
      select Id, Name, FullyQualifiedName, AccountType, AccountSubType, Classification
      from Account
      where AccountType in ('Expense','Cost of Goods Sold','Other Expense')
      order by Name
    `.trim()
    let data = await qboQuery(valid, sql1)
    let categories = mapAccounts(data)
    let source = 'Account(AccountType in Expense/COGS/Other Expense)'
    let reason = ''

    // 2) If empty, try Classification (some ledgers expose via Classification)
    if (categories.length === 0) {
      const sql2 = `
        select Id, Name, FullyQualifiedName, AccountType, AccountSubType, Classification
        from Account
        where Classification = 'Expense'
        order by Name
      `.trim()
      data = await qboQuery(valid, sql2)
      categories = mapAccounts(data)
      source = 'Account(Classification=Expense)'
    }

    // 3) If still empty, return ALL Accounts (so we can see something)
    if (categories.length === 0) {
      const sql3 = `
        select Id, Name, FullyQualifiedName, AccountType, AccountSubType, Classification
        from Account
        order by Name
      `.trim()
      data = await qboQuery(valid, sql3)
      categories = mapAccounts(data)
      source = 'Account(all)'
      reason = 'No expense-type accounts matched; showing all accounts.'
    }

    // 4) If really nothing, last resort—Item "Category" (diagnostic only)
    if (categories.length === 0) {
      const sql4 = `
        select Id, Name, Type
        from Item
        where Type = 'Category'
        order by Name
      `.trim()
      data = await qboQuery(valid, sql4)
      const items = data?.QueryResponse?.Item ?? []
      categories = items.map((i: any) => ({ id: i.Id, name: i.Name, type: 'ItemCategory' }))
      source = 'Item(Type=Category)'
      reason = 'No accounts returned; showing Item categories (not used for expense coding).'
    }

    const payload = { categories, source, reason }
    return debug
      ? j({ ok: true, payload, debug: { count: categories.length, ts: Date.now() } })
      : j({ categories, source, reason }, 200, { 'x-qbo-count': String(categories.length) })
  } catch (err: any) {
    if (err instanceof Response) return err
    // Log full error server-side only
    const msg = err?.detail || err?.message || String(err)
    console.error('[QBO][categories] fatal', msg)
    // Return safe error message to client
    return j({ error: 'internal_error' }, 500)
  }
}
