/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: { appDir: true },
  // Prevent Next from treating src/pages as the legacy Pages Router
  // We only use the App Router wrappers under app/.
  pageExtensions: ['not-used'], // effectively disables pages/*
};

module.exports = nextConfig;
