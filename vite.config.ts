import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';
import { visualizer } from 'rollup-plugin-visualizer';
import compression from 'vite-plugin-compression';
// import { viteImagemin } from 'vite-plugin-imagemin';

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
    // Gzip compression for production only
    mode === 'production' && compression({
      algorithm: 'gzip',
      ext: '.gz'
    }),
    // Brotli compression for production only
    mode === 'production' && compression({
      algorithm: 'brotliCompress',
      ext: '.br'
    }),
    // Optimización de imágenes (deshabilitada temporalmente)
    // process.env.NODE_ENV === 'production' && viteImagemin({
    //   gifsicle: { optimizationLevel: 7 },
    //   mozjpeg: { quality: 85 },
    //   pngquant: {
    //     quality: [0.65, 0.8]
    //   },
    //   svgo: {
    //     plugins: [
    //       { name: 'removeViewBox', active: false }
    //     ]
    //   }
    // }),
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
          ui: ['react-window', 'react-infinite-scroll-component'],
          search: ['fuse.js'],
          i18n: ['i18next', 'react-i18next', 'i18next-browser-languagedetector'],
          utils: ['axios', 'papaparse']
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