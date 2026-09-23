/** @type {import('next').NextConfig} */
const nextConfig = {
  // Turbopack (default in Next.js 16)
  turbopack: {},

  // Required headers for WASM execution and microphone access on mobile browsers
  // COOP/COEP are needed for SharedArrayBuffer (used by some audio worklets)
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin',
          },
          {
            key: 'Cross-Origin-Embedder-Policy',
            value: 'require-corp',
          },
        ],
      },
      {
        // ggwave.js must be served with permissive CORP header
        // because it is loaded via <script> tag from /public
        source: '/ggwave/:path*',
        headers: [
          {
            key: 'Cross-Origin-Resource-Policy',
            value: 'cross-origin',
          },
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        // Service worker must be served with no-cache so updates propagate
        source: '/sw.js',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=0, must-revalidate',
          },
          {
            key: 'Service-Worker-Allowed',
            value: '/',
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
