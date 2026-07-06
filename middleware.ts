import { NextRequest, NextResponse } from 'next/server';

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
    '/next/:path*',
  ],
};

const PUBLIC_API_PREFIXES = [
  '/api/auth/',
  '/api/qbo/callback',
  '/api/qbo/webhooks',
  '/api/invoices/cron-verify-payments',
  '/api/invoices/gpt-ingest',
  '/api/gpt-classify',
  '/api/other-documents',
  '/api/vendors/onboard-link',
  '/api/vendors/ach-info',
  '/api/db/init',
];

function isPublicApiRoute(pathname: string): boolean {
  return PUBLIC_API_PREFIXES.some(prefix => pathname.startsWith(prefix));
}

export function middleware(req: NextRequest) {
  const url = new URL(req.url);

  // 1) Canonical host: redirect www -> apex
  if (url.hostname === 'www.pcsmilesai.com') {
    url.hostname = 'pcsmilesai.com';
    return NextResponse.redirect(url, 301);
  }

  // 2) Defensive path fix: /next/... -> /_next/...
  if (url.pathname.startsWith('/next/')) {
    url.pathname = '/_' + url.pathname.slice(1);
    return NextResponse.redirect(url, 301);
  }

  // 3) API route auth gate: require session cookie on protected routes
  if (url.pathname.startsWith('/api/') && !isPublicApiRoute(url.pathname)) {
    const sessionCookie = req.cookies.get('pcs_session_id')?.value;
    if (!sessionCookie) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }

  // 4) CSRF: issue token cookie if not present (soft mode — log-only, no blocking)
  const existingCsrf = req.cookies.get('csrf-token')?.value;
  const needsCsrfCookie = !existingCsrf;

  // Log CSRF violations on mutations (soft mode: warn only, don't block)
  if (url.pathname.startsWith('/api/') && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    const headerToken = req.headers.get('x-csrf-token');
    if (!headerToken || headerToken !== existingCsrf) {
      console.warn('[CSRF][SOFT]', 'missing_or_mismatched_token', {
        path: url.pathname,
        method: req.method,
        hasHeader: !!headerToken,
        hasCookie: !!existingCsrf,
      });
    }
  }

  // 5) Create response with security headers
  const response = NextResponse.next();

  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'SAMEORIGIN');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');

  // Issue CSRF cookie if missing
  if (needsCsrfCookie) {
    const token = Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map(b => b.toString(16).padStart(2, '0')).join('');
    response.cookies.set('csrf-token', token, {
      httpOnly: false,
      secure: url.protocol === 'https:',
      sameSite: 'strict',
      maxAge: 86400,
      path: '/',
    });
  }

  return response;
}
