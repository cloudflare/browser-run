import path from 'path';

import picomatch from 'picomatch';
import { defineConfig } from 'vite';

const baseDir = __dirname.replace(/\\/g, '/');
const browserTestRuntime = path.resolve(__dirname, '../browser-test-runtime');

// Path mappings: glob pattern → target (first match wins)
// Use **/ prefix to match anywhere in absolute paths
const pathMappings = [
  { glob: '**/packages/browser-test-runtime/src/bundles/**', target: 'bundles' },
  { glob: '**/packages/browser-test-runtime/src/mocks/**', target: 'playwright-cloudflare/mocks' },
  { glob: '**/packages/playwright-cloudflare/src/bundles/**', target: 'bundles' },
  { glob: '**/packages/playwright-cloudflare/src/**', target: 'playwright-cloudflare' },
  { glob: '**/packages/playwright-cloudflare/*.json', target: 'playwright-cloudflare' },
  { glob: '**/submodules/playwright/packages/playwright-core/src/**', target: 'playwright-core' },
  { glob: '**/submodules/playwright/packages/playwright-core/*.json', target: 'playwright-core' },
  { glob: '**/submodules/playwright/packages/playwright/src/**', target: 'playwright' },
  { glob: '**/submodules/playwright/packages/playwright/*.json', target: 'playwright' },
];

// Pre-compile globs to regexes (capture: true creates capture groups for **/*)
const compiledMappings = pathMappings.map(({ glob, target }) => ({
  regex: picomatch.makeRe(glob, { capture: true, dot: true }),
  target,
}));

const rootEntryPoints = ['index.ts', 'test.ts', 'internal.ts'];

function remapOutputPath(facadeModuleId?: string): string {
  if (!facadeModuleId) return '[name].js';

  const id = facadeModuleId.replace(/\\/g, '/');

  // Entry points stay at root
  for (const entry of rootEntryPoints) {
    if (id.endsWith(`/src/${entry}`)) {
      return entry.replace(/\.ts$/, '.js');
    }
  }

  // Apply path mappings (first match wins)
  // match[1] = leading **/ prefix, match[2] = trailing **/* capture
  for (const { regex, target } of compiledMappings) {
    const match = id.match(regex);
    if (!match) continue;

    const [captured, query] = match[2].split('?');
    const sourcePath = id.split('?')[0];
    let outputPath = `${target}/${captured}`;
    if (sourcePath.endsWith('.json'))
      outputPath = `${outputPath.replace(/\.json$/, '')}.json.js`;
    else if (sourcePath.endsWith('.ts'))
      outputPath = outputPath.replace(/\.ts$/, '.js');
    if (!query)
      return outputPath;
    return outputPath.replace(/\.js$/, `-${query.replace(/[^a-zA-Z0-9_-]/g, '-')}.js`);
  }

  return '[name].js';
}

// https://vitejs.dev/config/
export default defineConfig({

  resolve: {
    alias: {
      'playwright-core/lib': path.resolve(__dirname, '../../submodules/playwright/packages/playwright-core/src'),
      'playwright/lib': path.resolve(__dirname, '../../submodules/playwright/packages/playwright/src'),
      'playwright-core': path.resolve(__dirname, './src/index'),

      // https://workers-nodejs-compat-matrix.pages.dev/
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

      // bundles
      './utilsBundleImpl': path.resolve(__dirname, '../browser-test-runtime/src/bundles/utilsBundleImpl'),
      './zipBundleImpl': path.resolve(__dirname, '../browser-test-runtime/src/bundles/zipBundleImpl'),
      './mcpBundleImpl': path.resolve(__dirname, '../browser-test-runtime/src/bundles/mcpBundleImpl'),
      './expectBundleImpl': path.resolve(__dirname, '../browser-test-runtime/src/bundles/expectBundleImpl'),
      'pngjs': path.resolve(__dirname, '../browser-test-runtime/src/bundles/pngjs'),

      "child_process": path.resolve(browserTestRuntime, './src/mocks/childProcess'),
      "node:child_process": path.resolve(browserTestRuntime, './src/mocks/childProcess'),
      "readline": path.resolve(browserTestRuntime, './src/mocks/readline'),
      "node:readline": path.resolve(browserTestRuntime, './src/mocks/readline'),
      "inspector": path.resolve(browserTestRuntime, './src/mocks/inspector'),
      "node:inspector": path.resolve(browserTestRuntime, './src/mocks/inspector'),

      // replace playwright transport with cloudflare workers transport
      './transport': path.resolve(__dirname, './src/cloudflare/webSocketTransport'),
      '../transport': path.resolve(__dirname, './src/cloudflare/webSocketTransport'),

      // cloudflare-specific modules added by patch
      '@playwright-cloudflare': path.resolve(__dirname, './src'),

      // It's not needed and this way we don't need to build and import utilsBundleImpl and babelBundleImpl
      './transform': path.resolve(__dirname, './src/mocks/transform'),
      '../transform/transform': path.resolve(__dirname, './src/mocks/transform'),

      '../transform/compilationCache': path.resolve(browserTestRuntime, './src/mocks/compilationCache'),
      '../common/testLoader': path.resolve(__dirname, './src/mocks/testLoader'),
      '../common/esmLoaderHost': path.resolve(browserTestRuntime, './src/mocks/esmLoaderHost'),
      './esmLoaderHost': path.resolve(browserTestRuntime, './src/mocks/esmLoaderHost'),

      // IMPORTANT `require('../playwright')` in `recorderApp.ts` causes a circular dependency,
      // so we need to mock it (it's not needed, it's related with recorder).
      '../playwright': path.resolve(browserTestRuntime, './src/mocks/empty'),
      './bidiOverCdp': path.resolve(browserTestRuntime, './src/mocks/empty'),
      'electron/index.js': path.resolve(browserTestRuntime, './src/mocks/empty'),
    },
  },
  define: {
    '__dirname': `'${baseDir}'`,
  },
  build: {
    assetsInlineLimit: 0,
    // skip code obfuscation
    minify: false,
    lib: {
      name: '@cloudflare/playwright',
      entry: [
        path.resolve(__dirname, './src/index.ts'),
        path.resolve(__dirname, './src/test.ts'),
        path.resolve(__dirname, './src/internal.ts')
      ],
    },
    // prevents __defProp, __defNormalProp, __publicField in compiled code
    target: 'esnext',
    rollupOptions: {
      output: [{
        format: 'es',
        dir: 'lib',
        preserveModules: true,
        entryFileNames: (chunkInfo) => remapOutputPath(chunkInfo.facadeModuleId!),
        chunkFileNames: (chunkInfo) => remapOutputPath(chunkInfo.facadeModuleId!),
        exports: 'named',
      }],
      external: [
        'node:async_hooks',
        'node:assert',
        'node:browser',
        'node:buffer',
        'node:constants',
        'node:crypto',
        'node:dns',
        'node:events',
        'node:fs',
        'node:http',
        'node:http2',
        'node:https',
        'node:module',
        'node:net',
        'node:os',
        'node:path',
        'node:process',
        'node:stream',
        'node:string_decoder',
        'node:timers',
        'node:tls',
        'node:url',
        'node:util',
        'node:zlib',
        'cloudflare:workers',
      ]
    },
    commonjsOptions: {
      transformMixedEsModules: true,
      extensions: ['.ts', '.js'],
      exclude: [
        path.resolve(__dirname, '../../submodules/playwright/packages/playwright-core/src/cli/**/*.ts'),
      ],
      include: [
        path.resolve(__dirname, '../../submodules/playwright/packages/playwright-core/src/**/*'),
        path.resolve(__dirname, '../../submodules/playwright/packages/playwright/src/**/*'),
        /node_modules/,
      ],
    }
  },
});
