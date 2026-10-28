import path from 'path';
import fs from 'fs';

import { defineConfig, Plugin } from 'vite';

import { playwrightPathAliases, playwrightVendoredImports, playwrightDir } from '../../browser-test-runtime/utils/vite-playwright.js';

const basedir = __dirname.replace(/\\/g, '/');
const cloudflareSourceTestsDir = path.join(basedir, 'src');
const sourceTestsDir = path.join(basedir, '..', '..', '..', 'submodules', 'playwright', 'tests');
const playwrightPackagesDir = path.join(basedir, '..', '..', '..', 'submodules', 'playwright', 'packages');

// Resolve relative imports like ../../packages/playwright-core/lib/... and
// ../../packages/playwright-core/src/... that appear in upstream playwright tests.
// These paths make sense in the playwright monorepo but need redirecting here.
function resolvePlaywrightPackageImports(): Plugin {
  return {
    name: 'resolve-playwright-package-imports',
    resolveId(id, importer) {
      if (!importer) return null;
      // Match relative paths containing /packages/playwright-core/ or /packages/playwright/
      const match = id.match(/^(\.\.\/)+packages\/(playwright-core|playwright)\/(lib|src|bundles)(.*)/);
      if (!match) return null;
      const [, , pkg, segment, rest] = match;
      // lib/ maps to src/ in the submodule source
      const actualSegment = segment === 'lib' ? 'src' : segment;
      const resolved = path.join(playwrightPackagesDir, pkg, actualSegment + rest);
      // Try with .ts extension if the file doesn't exist as-is
      if (fs.existsSync(resolved)) return resolved;
      if (fs.existsSync(resolved + '.ts')) return resolved + '.ts';
      if (fs.existsSync(resolved + '/index.ts')) return resolved + '/index.ts';
      return null;
    },
  };
}

function setTestFilePlugin() {
  return {
    name: 'transform-file',
    transform(src, id) {
      const testPath = [sourceTestsDir, cloudflareSourceTestsDir].map(dir => path.relative(dir, id).replace(/\\/g, '/'))
          .find(p => !p.startsWith('..'));
      if (/\.(spec|test)\.ts$/.test(id)) {
        return {
          code: [
            `import { setCurrentTestFile } from '@cloudflare/browser-test-runtime';setCurrentTestFile(${JSON.stringify(testPath)});`,
            src,
            'setCurrentTestFile(undefined);',
          ].join('\n'),
          map: null, // provide source map if available
        };
      }
    },
  } satisfies Plugin;
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    setTestFilePlugin(),
    resolvePlaywrightPackageImports(),
    // npm dependencies of upstream sources come from the utilsBundle exports of @cloudflare/playwright/internal
    playwrightVendoredImports({
      target: '@cloudflare/playwright/internal',
      external: true,
      include: [path.join(playwrightDir, 'packages'), sourceTestsDir],
    }),
  ],
  root: sourceTestsDir,
  resolve: {
    alias: [
      // upstream tests import parts of playwright-core through this barrel
      { find: /^(\.\.\/)+packages\/playwright-core\/lib\/coreBundle$/, replacement: path.resolve(basedir, './src/server/coreBundle') },
      ...Object.entries({
      // https://workers-nodejs-compat-matrix.pages.dev/
      'async_hooks': 'node:async_hooks',
      'assert': 'node:assert',
      'buffer': 'node:buffer',
      'child_process': 'node:child_process',
      'constants': 'node:constants',
      'crypto': 'node:crypto',
      'dns': 'node:dns',
      'domain': 'node:domain',
      'events': 'node:events',
      'fs': 'node:fs',
      'http': 'node:http',
      'http2': 'node:http2',
      'https': 'node:https',
      'inspector': 'node:inspector',
      'module': 'node:module',
      'net': 'node:net',
      'os': 'node:os',
      'path': 'node:path',
      'querystring': 'node:querystring',
      'process': 'node:process',
      'readline': 'node:readline',
      'stream': 'node:stream',
      'string_decoder': 'node:string_decoder',
      'tls': 'node:tls',
      'url': 'node:url',
      'util': 'node:util',
      'vm': 'node:vm',
      'zlib': 'node:zlib',

      '@workerTests': sourceTestsDir,
      '@cloudflareTests': path.resolve(basedir, './src'),

      '../config/browserTest': path.resolve(basedir, './src/server/workerFixtures'),
      '../page/pageTest': path.resolve(basedir, './src/server/workerFixtures'),
      '../../page/pageTest': path.resolve(basedir, './src/server/workerFixtures'),
      './pageTest': path.resolve(basedir, './src/server/workerFixtures'),
      'tests/page/pageTest': path.resolve(basedir, './src/server/workerFixtures'),
      'tests': sourceTestsDir,

      '../../zipBundle': '@cloudflare/playwright/internal',
      '../../utilsBundle': '@cloudflare/playwright/internal',
      'playwright-core/lib/utilsBundle': '@cloudflare/playwright/internal',
      'playwright-core/lib/utils': '@cloudflare/playwright/internal',

      '../../packages/playwright-core/lib': path.resolve(basedir, '../../../submodules/playwright/packages/playwright-core/src'),
      '../../../packages/playwright-core/lib': path.resolve(basedir, '../../../submodules/playwright/packages/playwright-core/src'),
      'packages/playwright-core/lib': path.resolve(basedir, '../../../submodules/playwright/packages/playwright-core/src'),
      'playwright': '@cloudflare/playwright',
      'playwright-core': '@cloudflare/playwright',
      '@playwright/test': path.resolve(basedir, './src/server/workerFixtures'),
      }).map(([find, replacement]) => ({ find, replacement })),
      ...playwrightPathAliases,
    ],
  },
  build: {
    emptyOutDir: false,
    minify: false,
    // prevents __defProp, __defNormalProp, __publicField in compiled code
    target: 'esnext',
    lib: {
      name: 'tests',
      entry: path.join(basedir, './workerTests/index.ts'),
      formats: ['es'],
    },
    terserOptions: {
      format: {
        // we need to ensure no comments are preserved
        comments: false
      }
    },
    rollupOptions: {
      output: {
        preserveModules: true,
        dir: path.join(basedir, 'workerTests'),
        preserveModulesRoot: sourceTestsDir,
        entryFileNames: (chunkInfo) => {
          // Check if this is a cloudflare test (outside sourceTestsDir)
          if (chunkInfo.facadeModuleId?.startsWith(cloudflareSourceTestsDir)) {
            // Extract the relative path from the cloudflare tests src dir
            const relativePath = path.relative(cloudflareSourceTestsDir, chunkInfo.facadeModuleId);
            return relativePath.replace(/\.ts$/, '.js');
          }
          // Handle the entry point (workerTests/index.ts) - keep it at root
          if (chunkInfo.facadeModuleId?.endsWith('/workerTests/index.ts')) {
            return 'index.js';
          }
          return '[name].js';
        },
        chunkFileNames: '[name].js',
      },
      external: [
        'node:async_hooks',
        'node:assert',
        'node:buffer',
        'node:child_process',
        'node:constants',
        'node:crypto',
        'node:dns',
        'node:domain',
        'node:events',
        'node:fs',
        'node:http',
        'node:http2',
        'node:https',
        'node:inspector',
        'node:module',
        'node:net',
        'node:os',
        'node:path',
        'node:querystring',
        'node:process',
        'node:readline',
        'node:stream',
        'node:string_decoder',
        'node:timers',
        'node:tls',
        'node:url',
        'node:util',
        'node:vm',
        'node:zlib',

        'cloudflare:workers',
        '@cloudflare/browser-test-runtime',
        /^@cloudflare\/playwright.*/,
        /^chromium-bidi\/.*/,
      ]
    },
    commonjsOptions: {
      transformMixedEsModules: true,
      extensions: ['.ts', '.js'],
      include: [
        path.resolve(basedir, '../../../submodules/playwright/packages/**/*'),
        path.resolve(basedir, '../../../submodules/playwright/tests/**/*'),
        /node_modules/,
      ],
    },
  },
});
