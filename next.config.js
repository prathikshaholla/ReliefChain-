/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Keep native/server-only DB drivers out of the client bundle
  serverExternalPackages: ['pg', 'mongodb', 'bcryptjs'],
};

module.exports = nextConfig;
