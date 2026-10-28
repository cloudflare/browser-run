import path from 'path';

import {defineConfig} from 'vite';

import {
  playwrightBundleAliases,
  playwrightCoreBundleAlias,
  playwrightModuleMocks,
  playwrightPathAliases,
  playwrightVendoredImports,
} from './utils/vite-playwright.js';

const mocks = path.resolve(__dirname, './src/mocks');

const aliases = {
  'playwright-core/lib': path.resolve(
    __dirname,
    '../../submodules/playwright/packages/playwright-core/src',
  ),
  'playwright/lib': path.resolve(
    __dirname,
    '../../submodules/playwright/packages/playwright/src',
  ),
  'playwright-core': path.resolve(
    __dirname,
    './src/mocks/playwrightCore',
  ),
  'async_hooks': 'node:async_hooks',
  'assert': 'node:assert',
  'buffer': 'node:buffer',
  'constants': 'node:constants',
  'crypto': 'node:crypto',
  'dns': 'node:dns',
  'events': 'node:events',
  'fs': 'node:fs',
  'http': 'node:http',
  'http2': 'node:http2',
  'https': 'node:https',
  'module': 'node:module',
  'net': 'node:net',
  'os': 'node:os',
  'path': 'node:path',
  'process': 'node:process',
  'stream': 'node:stream',
  'string_decoder': 'node:string_decoder',
  'tls': 'node:tls',
  'url': 'node:url',
  'util': 'node:util',
  'zlib': 'node:zlib',
  'child_process': path.resolve(
    __dirname,
    './src/mocks/childProcess',
  ),
  'node:child_process': path.resolve(
    __dirname,
    './src/mocks/childProcess',
  ),
  'readline': path.resolve(__dirname, './src/mocks/readline'),
  'node:readline': path.resolve(
    __dirname,
    './src/mocks/readline',
  ),
  'inspector': path.resolve(__dirname, './src/mocks/inspector'),
  'node:inspector': path.resolve(
    __dirname,
    './src/mocks/inspector',
  ),
  './transport': path.resolve(
    __dirname,
    './src/cloudflare/webSocketTransport',
  ),
  '../transport': path.resolve(
    __dirname,
    './src/cloudflare/webSocketTransport',
  ),
  '@playwright-cloudflare': path.resolve(__dirname, './src'),
  // IMPORTANT `require('../playwright')` in `recorderApp.ts` causes a circular dependency,
  // so we need to mock it (it's not needed, it's related with recorder).
  '../playwright': path.resolve(__dirname, './src/mocks/empty'),
  'electron/index.js': path.resolve(
    __dirname,
    './src/mocks/empty',
  ),
};

export default defineConfig({
  plugins: [
    playwrightModuleMocks({
      'playwright/src/common/testLoader': `${mocks}/testLoader.ts`,
      'playwright/src/transform/transform': `${mocks}/transform.ts`,
      'playwright/src/transform/compilationCache': `${mocks}/compilationCache.ts`,
      'playwright-core/src/server/bidi/bidiOverCdp': `${mocks}/empty.ts`,
    }),
    playwrightVendoredImports(),
  ],
  resolve: {
    alias: [
      playwrightCoreBundleAlias,
      ...Object.entries(aliases).map(([find, replacement]) => ({
        find,
        replacement,
      })),
      ...playwrightPathAliases,
      ...playwrightBundleAliases,
    ],
  },
  define: {
    __dirname: JSON.stringify('/'),
  },
  build: {
    minify: false,
    target: 'esnext',
    lib: {
      name: '@cloudflare/browser-test-runtime',
      entry: [path.resolve(__dirname, './src/index.ts')],
      formats: ['es'],
    },
    rollupOptions: {
      output: {
        format: 'es',
        dir: 'lib',
        entryFileNames: 'index.js',
        exports: 'named',
      },
      external: [
        /^node:/,
        'cloudflare:workers',
      ],
    },
    commonjsOptions: {
      transformMixedEsModules: true,
      extensions: ['.ts', '.js'],
      include: [
        path.resolve(
          __dirname,
          '../../submodules/playwright/packages/playwright-core/src/**/*',
        ),
        path.resolve(
          __dirname,
          '../../submodules/playwright/packages/playwright/src/**/*',
        ),
        path.resolve(
          __dirname,
          '../../submodules/playwright/packages/utils/**/*',
        ),
        path.resolve(
          __dirname,
          '../../submodules/playwright/packages/isomorphic/**/*',
        ),
        path.resolve(
          __dirname,
          '../../submodules/playwright/packages/protocol/src/**/*',
        ),
        /node_modules/,
      ],
    },
  },
});
