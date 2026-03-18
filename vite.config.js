import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const pwaBuildId = new Date().toISOString();

export default defineConfig({
  publicDir: 'public',
  define: {
    __PWA_BUILD_ID__: JSON.stringify(pwaBuildId)
  },
  plugins: [
    VitePWA({
      injectRegister: false,
      manifest: false,
      registerType: 'autoUpdate',
      strategies: 'injectManifest',
      injectManifest: {
        rollupFormat: 'es',
        globPatterns: ['**/*.{js,css,html,svg,ico,json}'],
        globIgnores: [
          '**/pdf/**',
          '**/data/all.json',
          '**/assets/background-*.svg',
          '**/assets/grain-*.svg',
          '**/icons/background.svg',
          '**/icons/grain.svg',
          '**/data/background.svg',
          '**/background.svg',
          '**/grain.svg',
          '**/js/jszip.min.js',
          '**/js/pdf-library.js'
        ],
        maximumFileSizeToCacheInBytes: 2 * 1024 * 1024
      }
    })
  ],
  worker: {
    format: 'es'
  },
  resolve: {
    alias: {
      'ssr-window': resolve('js/vendor/ssr-window.js')
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve('index.html'),
        webapp: resolve('webapp.html')
      }
    }
  },
  server: {
    host: '127.0.0.1',
    port: 4175
  },
  preview: {
    host: '127.0.0.1',
    port: 4176
  }
});
