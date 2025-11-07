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

  // 3) Create response with security headers
  const response = NextResponse.next();

  // SECURITY: Prevent MIME type sniffing
  response.headers.set('X-Content-Type-Options', 'nosniff');

  // SECURITY: Prevent clickjacking attacks
  response.headers.set('X-Frame-Options', 'DENY');

  // SECURITY: Enable XSS protection in older browsers
  response.headers.set('X-XSS-Protection', '1; mode=block');

  // SECURITY: Enforce HTTPS
  response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');

  // SECURITY: Referrer policy
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  // SECURITY: Permissions policy (formerly Feature-Policy)
  response.headers.set('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');

  return response;
}


