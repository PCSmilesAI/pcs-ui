import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  // Redirect to the OAuth auth endpoint
  const url = new URL(request.url);
  const baseUrl = url.origin;
  
  return NextResponse.redirect(`${baseUrl}/api/qbo/auth`, 302);
}



