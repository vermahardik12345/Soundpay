import type { Metadata, Viewport } from 'next';
import { Outfit } from 'next/font/google';
import Script from 'next/script';
import './globals.css';

const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-outfit',
  weight: ['300', '400', '500', '600', '700', '800'],
});

export const metadata: Metadata = {
  title: 'SoundPay — Offline Audio Payments',
  description:
    'Peer-to-peer offline payment system using near-ultrasonic audio. Pay anyone without internet, anywhere.',
  keywords: ['offline payment', 'audio payment', 'UPI offline', 'P2P payment', 'ggwave'],
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'SoundPay',
  },
  openGraph: {
    title: 'SoundPay — Offline Audio Payments',
    description: 'Pay anyone without internet using sound waves',
    type: 'website',
  },
};

export const viewport: Viewport = {
  themeColor: '#0f0a1e',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={outfit.variable}>
      <head>
        <link rel="apple-touch-icon" sizes="192x192" href="/icons/icon-192.png" />
        <link rel="apple-touch-icon" sizes="512x512" href="/icons/icon-512.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body className={`${outfit.className} antialiased bg-[#0f0a1e] text-white`}>
        <div className="min-h-screen flex flex-col max-w-md mx-auto relative">
          {children}
        </div>
        {/* Register Service Worker for offline PWA support */}
        <Script id="sw-register" strategy="afterInteractive">
          {`
            if ('serviceWorker' in navigator) {
              window.addEventListener('load', function() {
                navigator.serviceWorker.register('/sw.js', { scope: '/' })
                  .then(function(reg) {
                    console.log('[SoundPay] Service Worker registered:', reg.scope);
                  })
                  .catch(function(err) {
                    console.warn('[SoundPay] SW registration failed:', err);
                  });
              });
            }
          `}
        </Script>
      </body>
    </html>
  );
}
