import { NextResponse } from "next/server";

// Force dynamic rendering
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    QBO_CLIENT_ID: process.env.QBO_CLIENT_ID ? `${process.env.QBO_CLIENT_ID.substring(0, 8)}...` : 'MISSING',
    QBO_REDIRECT_URI: process.env.QBO_REDIRECT_URI || 'MISSING',
    QBO_SCOPES: process.env.QBO_SCOPES || 'MISSING',
    QBO_CLIENT_SECRET: process.env.QBO_CLIENT_SECRET ? 'PRESENT' : 'MISSING',
    QBO_ENV: process.env.QBO_ENV || 'MISSING',
    timestamp: new Date().toISOString()
  });
}
