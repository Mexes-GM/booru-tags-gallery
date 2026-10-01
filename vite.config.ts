import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';
import { visualizer } from 'rollup-plugin-visualizer';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => ({
  plugins: [
    react({
      jsxRuntime: 'automatic',
      babel: {
        plugins: [
          // Remove console logs in production
          mode === 'production' && ['babel-plugin-transform-remove-console', { exclude: ['error', 'warn'] }]
        ].filter(Boolean)
      },
      // Ensure React runs in development mode during development
      include: /\.(jsx?|tsx?)$/,
      exclude: /node_modules/
    }),
    tailwindcss(),
    // Service worker (Workbox generateSW). Replaces the old hand-written public/sw.js.
    // Output filename stays `sw.js` so existing installs update to it in place.
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: null, // registered manually from src/main.tsx (production, non-localhost only)
      manifest: false, // use the existing public/manifest.json
      filename: 'sw.js',
      devOptions: { enabled: false },
      workbox: {
        // Precache only the app shell. The big /data/*.json files (~30 MB) are
        // runtime-cached below instead of being downloaded at install time.
        globPatterns: ['**/*.{html,js,css,woff2,svg,ico}', 'favicon.png'],
        globIgnores: ['data/**', 'screenshots/**', 'stats.html', '**/*.gz', '**/*.br'],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [
          /^\/api\//,
          /^\/\.netlify\//,
          /^\/_vercel\//,
          /^\/data\//,
          // Real files (robots.txt, sitemap.xml, ...). Kept to known extensions because tag routes can contain dots.
          /\.(?:txt|xml|json|webmanifest|png|ico|svg|js|css)$/,
        ],
        runtimeCaching: [
          {
            // Static data files are not hashed: serve the cached copy instantly and
            // refresh it in the background, so a new deploy is picked up on the next load.
            urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/data/') && url.pathname.endsWith('.json'),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'static-data-v1',
              expiration: { maxEntries: 10 },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            // Danbooru thumbnails/images. Cache name must contain "image": the NSFW
            // filter toggle clears caches whose name includes "image".
            urlPattern: ({ url }) => url.hostname === 'cdn.donmai.us',
            handler: 'CacheFirst',
            options: {
              cacheName: 'danbooru-images',
              expiration: { maxEntries: 300, maxAgeSeconds: 7 * 24 * 60 * 60, purgeOnQuotaError: true },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // Danbooru API JSON (danbooru.donmai.us) is intentionally NOT cached by the SW:
          // the app keeps its own in-memory/localStorage cache and results depend on
          // NSFW filter state, so an SW copy would only duplicate data and serve stale results.
        ],
      },
    }),
    // Bundle analyzer (only in analyze mode)
    mode === 'production' && process.env.ANALYZE && visualizer({
      filename: 'dist/stats.html',
      open: true,
      gzipSize: true,
      brotliSize: true
    })
  ].filter(Boolean),
  server: {
    open: false, // Evitar abrir automáticamente ya que Netlify Dev maneja esto
    fs: {
      strict: false,
      allow: ['..']
    },
    cors: true,
    // Solo configurar proxies si no estamos usando Netlify Dev
    ...(mode === 'development' && !process.env.NETLIFY_DEV && {
      proxy: {
        '/.netlify/functions': {
          target: 'http://localhost:8888',
          changeOrigin: true,
          secure: false,
        },
        '/api': {
          target: 'http://localhost:3000', // vercel dev default
          changeOrigin: true,
          secure: false,
        },
      }
    }),
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify(mode === 'production' ? 'production' : 'development'),
    __DEV__: mode !== 'production',
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src')
    },
    conditions: ['development', 'browser']
  },
  build: {
    target: ['es2020', 'edge88', 'firefox78', 'chrome87', 'safari13.1'],
    minify: mode === 'production' ? 'terser' : false,
    sourcemap: mode === 'development',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
        pure_funcs: ['console.log', 'console.info', 'console.debug', 'console.trace'],
        passes: 2
      },
      mangle: {
        safari10: true
      },
      format: {
        safari10: true
      }
    },
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          search: ['fuse.js'],
          i18n: ['i18next', 'react-i18next', 'i18next-browser-languagedetector'],
          utils: ['axios']
        },
        // Optimizar nombres de archivos para cache
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]'
      }
    },
    copyPublicDir: true,
    chunkSizeWarningLimit: 1000, // Reducido para mejor rendimiento
    // Optimizaciones adicionales
    cssCodeSplit: true,
    assetsInlineLimit: 8192, // Aumentado para incluir más assets pequeños inline
    reportCompressedSize: false // Acelera el build
  },
  publicDir: 'public',
  base: '/'
}));