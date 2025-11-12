/**
 * Cache Control Middleware
 * 
 * Ensures proper cache headers are set on all responses to prevent
 * users from seeing stale code or bugs that were fixed weeks ago.
 * 
 * Strategy:
 * - Static assets (/_next/static/*): Cache forever (safe due to hash-based versioning)
 * - HTML pages: Never cache (always fetch fresh)
 * - API responses: Never cache (always fetch fresh)
 * - Dynamic content: Never cache (always fetch fresh)
 */

import { NextResponse } from 'next/server';

export interface CacheControlOptions {
  maxAge?: number;
  sMaxAge?: number;
  staleWhileRevalidate?: number;
  staleIfError?: number;
  public?: boolean;
  private?: boolean;
  immutable?: boolean;
  noStore?: boolean;
  noCache?: boolean;
  mustRevalidate?: boolean;
}

/**
 * Build Cache-Control header value
 */
export function buildCacheControlHeader(options: CacheControlOptions): string {
  const parts: string[] = [];

  if (options.noStore) {
    parts.push('no-store');
  }
  if (options.noCache) {
    parts.push('no-cache');
  }
  if (options.mustRevalidate) {
    parts.push('must-revalidate');
  }
  if (options.public) {
    parts.push('public');
  }
  if (options.private) {
    parts.push('private');
  }
  if (options.maxAge !== undefined) {
    parts.push(`max-age=${options.maxAge}`);
  }
  if (options.sMaxAge !== undefined) {
    parts.push(`s-maxage=${options.sMaxAge}`);
  }
  if (options.staleWhileRevalidate !== undefined) {
    parts.push(`stale-while-revalidate=${options.staleWhileRevalidate}`);
  }
  if (options.staleIfError !== undefined) {
    parts.push(`stale-if-error=${options.staleIfError}`);
  }
  if (options.immutable) {
    parts.push('immutable');
  }

  return parts.join(', ');
}

/**
 * Set cache control headers on response
 */
export function setCacheControl(
  response: NextResponse,
  options: CacheControlOptions
): NextResponse {
  const cacheControl = buildCacheControlHeader(options);
  response.headers.set('Cache-Control', cacheControl);

  // Add Pragma header for HTTP/1.0 compatibility
  if (options.noStore || options.noCache) {
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('Expires', '0');
  }

  // Add version header for debugging
  const buildTime = process.env.BUILD_TIME || new Date().toISOString();
  response.headers.set('X-Build-Time', buildTime);

  return response;
}

/**
 * Preset: Never cache (for HTML pages and API responses)
 */
export function neverCache(response: NextResponse): NextResponse {
  return setCacheControl(response, {
    noStore: true,
    noCache: true,
    mustRevalidate: true,
  });
}

/**
 * Preset: Cache forever (for static assets with hash-based versioning)
 */
export function cacheForever(response: NextResponse): NextResponse {
  return setCacheControl(response, {
    public: true,
    maxAge: 31536000, // 1 year
    immutable: true,
  });
}

/**
 * Preset: Cache for short period (for images and fonts)
 */
export function cacheShort(response: NextResponse, seconds: number = 3600): NextResponse {
  return setCacheControl(response, {
    public: true,
    maxAge: seconds,
  });
}

/**
 * Preset: Cache with revalidation (for semi-dynamic content)
 */
export function cacheWithRevalidation(
  response: NextResponse,
  maxAge: number = 60,
  staleWhileRevalidate: number = 86400
): NextResponse {
  return setCacheControl(response, {
    public: true,
    maxAge,
    staleWhileRevalidate,
  });
}

/**
 * Get cache control strategy based on path
 */
export function getCacheStrategy(pathname: string): CacheControlOptions {
  // Static assets - cache forever
  if (pathname.startsWith('/_next/static/')) {
    return {
      public: true,
      maxAge: 31536000,
      immutable: true,
    };
  }

  // Images - cache for 1 day
  if (pathname.match(/\.(jpg|jpeg|png|gif|webp|svg|ico)$/i)) {
    return {
      public: true,
      maxAge: 86400,
    };
  }

  // Fonts - cache for 1 year
  if (pathname.match(/\.(woff|woff2|ttf|otf|eot)$/i)) {
    return {
      public: true,
      maxAge: 31536000,
      immutable: true,
    };
  }

  // API routes - never cache
  if (pathname.startsWith('/api/')) {
    return {
      noStore: true,
      noCache: true,
      mustRevalidate: true,
    };
  }

  // HTML pages - never cache
  return {
    noStore: true,
    noCache: true,
    mustRevalidate: true,
  };
}

/**
 * Apply cache control based on path
 */
export function applyCacheControl(response: NextResponse, pathname: string): NextResponse {
  const strategy = getCacheStrategy(pathname);
  return setCacheControl(response, strategy);
}

/**
 * Middleware to apply cache control to all responses
 */
export function cacheControlMiddleware(pathname: string, response: NextResponse): NextResponse {
  return applyCacheControl(response, pathname);
}

