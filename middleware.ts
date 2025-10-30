import { NextRequest, NextResponse } from 'next/server';

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)', '/next/:path*'],
};

export function middleware(req: NextRequest) {
  const url = new URL(req.url);

  // 1) Canonical host: redirect www -> apex
  if (url.hostname === 'www.pcsmilesai.com') {
    url.hostname = 'pcsmilesai.com';
    return NextResponse.redirect(url, 301); // Changed to 301 (permanent) to avoid browser caching issues
  }

  // 2) Defensive path fix: /next/... -> /_next/...
  if (url.pathname.startsWith('/next/')) {
    url.pathname = '/_' + url.pathname.slice(1);
    return NextResponse.redirect(url, 301); // Changed to 301 for consistency
  }

  return NextResponse.next();
}


