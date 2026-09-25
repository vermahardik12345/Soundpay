/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  images: {
    unoptimized: true,
  },
  // Disable trailing slash for clean Capacitor asset paths
  trailingSlash: true,
};

module.exports = nextConfig;
