const path = require('path');
const dotenv = require('dotenv');

// Load environment variables from the shared `env` file so Next.js API routes
// have access to the same credentials used by the dev/production scripts.
dotenv.config({ path: path.resolve(process.cwd(), 'env') });

/** @type {import('next').NextConfig} */
const nextConfig = {
  compress: true,
  productionBrowserSourceMaps: true,
  async headers() {
    return [
      // Static assets - cache forever (safe due to hash-based versioning)
      {
        source: '/_next/static/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
          { key: 'ETag', value: 'W/"static"' },
        ],
      },
      // API routes - never cache
      {
        source: '/api/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate, proxy-revalidate' },
          { key: 'Pragma', value: 'no-cache' },
          { key: 'Expires', value: '0' },
        ],
      },
      // HTML pages and dynamic content - never cache
      {
        source: '/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate, proxy-revalidate' },
          { key: 'Pragma', value: 'no-cache' },
          { key: 'Expires', value: '0' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
