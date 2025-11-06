import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Deprecated: This endpoint now delegates to /api/invoices/transition-db
 * which uses the SQLite database instead of JSON files.
 * Kept for backward compatibility.
 */
export async function POST(req: NextRequest) {
  // Delegate to the database-backed endpoint
  const url = new URL(req.url);
  url.pathname = '/api/invoices/transition-db';

  const newReq = new NextRequest(url, {
    method: req.method,
    headers: req.headers,
    body: req.body,
  });

  // Forward to transition-db
  const response = await fetch(newReq);
  return response;
}
