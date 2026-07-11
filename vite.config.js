import { resolve } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { defineConfig, transformWithEsbuild } from 'vite';
import { visualizer } from 'rollup-plugin-visualizer';
import { VitePWA } from 'vite-plugin-pwa';
import { fingerprintPaths } from './scripts/content-fingerprint.mjs';

const PWA_BUILD_INPUTS = Object.freeze([
  '.generated-public',
  'css',
  'index.html',
  'js',
  'manifest.json',
  'package-lock.json',
  'package.json',
  'src',
  'sw.js',
  'vite.config.js',
  'webapp.html'
]);

const CLASSIC_RUNTIME_ASSETS = Object.freeze([
  'js/vendor/daub.js',
  'js/legacy/shared.js',
  'js/legacy/index.js',
  'js/legacy/character.js',
  'js/legacy/inventory.js',
  'js/legacy/notes.js',
  'js/legacy/traits.js',
  'js/legacy/post.js'
]);

function minifyClassicRuntimeAssets() {
  return {
    name: 'minify-classic-runtime-assets',
    apply: 'build',
    enforce: 'post',
    async writeBundle(outputOptions) {
      const outputDirectory = resolve(outputOptions.dir || 'dist');

      await Promise.all(CLASSIC_RUNTIME_ASSETS.map(async relativePath => {
        const outputPath = resolve(outputDirectory, relativePath);
        let source;
        try {
          source = await readFile(outputPath, 'utf8');
        } catch (error) {
          if (error?.code === 'ENOENT') {
            this.warn(`Classic runtime asset was not copied: ${relativePath}`);
            return;
          }
          throw error;
        }

        const result = await transformWithEsbuild(source, outputPath, {
          charset: 'utf8',
          legalComments: 'none',
          minify: true,
          sourcemap: false,
          target: 'es2020'
        });
        await writeFile(outputPath, result.code, 'utf8');
      }));
    }
  };
}

function normalizeBuildId(value) {
  return String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

async function resolvePwaBuildId() {
  const requested = normalizeBuildId(process.env.PWA_BUILD_ID || process.env.GITHUB_SHA);
  if (requested) return requested;
  return (await fingerprintPaths(PWA_BUILD_INPUTS)).slice(0, 40);
}

export default defineConfig(async ({ mode }) => {
  const enableBundleAnalysis = mode === 'analyze';
  const pwaBuildId = await resolvePwaBuildId();

  return {
    publicDir: '.generated-public',
    define: {
      __PWA_BUILD_ID__: JSON.stringify(pwaBuildId)
    },
    plugins: [
      VitePWA({
        injectRegister: false,
        manifest: false,
        registerType: 'autoUpdate',
        strategies: 'injectManifest',
        srcDir: '.',
        filename: 'sw.js',
        injectManifest: {
          rollupFormat: 'es',
          globPatterns: ['**/*.{js,css,html,svg,png,json}'],
          globIgnores: [
            '**/pdf/**',
            '**/data/*.json',
            '**/data/all.json',
            '**/icons/background.svg',
            '**/icons/grain.svg',
            '**/icons/icon_DA',
            '**/data/background.svg',
            '**/background.svg',
            '**/grain.svg',
            '**/js/jszip.min.js'
          ],
          maximumFileSizeToCacheInBytes: 2 * 1024 * 1024
        }
      }),
      minifyClassicRuntimeAssets(),
      ...(enableBundleAnalysis
        ? [
            visualizer({
              filename: 'dist/bundle-analysis.html',
              template: 'treemap',
              gzipSize: true,
              brotliSize: true,
              open: false
            })
          ]
        : [])
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
  };
});
