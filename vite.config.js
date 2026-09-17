import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  // Subdirectory base for Synology Web Station deployment under /investimentos/.
  // Change to '/' if you later serve the app from the root of a virtual host or nginx.
  base: '/investimentos/',

  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'pwa-icon-192.png', 'pwa-icon-512.png'],
      manifest: {
        name: 'InvestTracker — Portfolio Dashboard',
        short_name: 'InvestTracker',
        description: 'Dashboard pessoal de gestão de investimentos',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/investimentos/',
        start_url: '/investimentos/',

        icons: [
          {
            src: 'pwa-icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: 'pwa-icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        // On every new deploy, the new SW takes over immediately without
        // waiting for all existing tabs to close — prevents users getting
        // stuck on a stale cached version without realising it.
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,

        // Cache Google Fonts
        runtimeCaching: [
          {
            urlPattern: /^\/api\/.*/i,
            // API calls go through our local proxy — always fetch live, no SW caching
            handler: 'NetworkOnly',
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gstatic-fonts-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],

  // ─── Dev server proxy ──────────────────────────────────────────────────────
  // Forwards /api/* and /health to the Node proxy server (port 3001) so the
  // browser sees same-origin requests — no CORS needed, matches prod nginx setup.
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: false,
      },
      '/health': {
        target: 'http://localhost:3001',
        changeOrigin: false,
      },
    },
  },
})

