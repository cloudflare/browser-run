import path from 'path';

import picomatch from 'picomatch';
import { defineConfig } from 'vite';

import packageJson from './package.json' with { type: 'json' };

const baseDir = __dirname.replace(/\\/g, '/');

// Path mappings: glob pattern → target (first match wins)
// Use **/ prefix to match anywhere in absolute paths
const pathMappings = [
  { glob: '**/packages/puppeteer-cloudflare/src/**', target: 'puppeteer-cloudflare' },
  { glob: '**/submodules/puppeteer/packages/puppeteer-core/lib/puppeteer/**', target: 'puppeteer-core' },
  { glob: '**/submodules/puppeteer/packages/puppeteer-core/lib/third_party/**', target: 'puppeteer-core/third_party' },
  { glob: '**/submodules/puppeteer/packages/puppeteer-core/node_modules/**', target: 'puppeteer-core/node_modules' },
];

// Pre-compile globs to regexes (capture: true creates capture groups for **/*)
const compiledMappings = pathMappings.map(({ glob, target }) => ({
  regex: picomatch.makeRe(glob, { capture: true, dot: true }),
  target,
}));

const rootEntryPoints = ['index.ts'];

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

    const captured = match[2];
    return `${target}/${captured}`.replace(/\.ts$/, '.js');
  }

  return '[name].js';
}

// Stub out injected/ modules that have browser-only top-level side effects
// (e.g. MutationObserver) which crash the Workers runtime.
// These modules are only meant to run inside browser pages, not in Workers.
function stubInjectedModules() {
  return {
    name: 'stub-injected-modules',
    load(id: string) {
      if (id.includes('/injected/TextContent')) {
        return 'export function createTextContent() { throw new Error("Not available in Workers"); }\nexport function isSuitableNodeForTextMatching() { return false; }';
      }
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [stubInjectedModules()],
  resolve: {
    alias: [
      ...Object.entries({
        // Node built-ins compat
        'async_hooks': 'node:async_hooks',
        'assert': 'node:assert',
        'buffer': 'node:buffer',
        'crypto': 'node:crypto',
        'events': 'node:events',
        'fs': 'node:fs',
        'http': 'node:http',
        'https': 'node:https',
        'net': 'node:net',
        'os': 'node:os',
        'path': 'node:path',
        'stream': 'node:stream',
        'url': 'node:url',
        'util': 'node:util',
        'zlib': 'node:zlib',
      }).map(([key, value]) => ({ find: key, replacement: value })),

      // Rewrite puppeteer-core/lib imports to pre-compiled ESM output
      // The TypeScript is pre-compiled with `tsc` to handle decorators correctly
      {
        find: /^puppeteer-core\/lib\/esm\/puppeteer\/(.+)\.js$/,
        replacement: path.resolve(baseDir, '../../submodules/puppeteer/packages/puppeteer-core/lib/puppeteer/$1.js'),
      },
      {
        find: /^puppeteer-core\/lib\/(.+)\.js$/,
        replacement: path.resolve(baseDir, '../../submodules/puppeteer/packages/puppeteer-core/lib/puppeteer/$1.js'),
      },
      {
        find: /^puppeteer-core\/lib\//,
        replacement: path.resolve(baseDir, '../../submodules/puppeteer/packages/puppeteer-core/lib/puppeteer/'),
      },
    ],
  },
  define: {
    '__dirname': `'${baseDir}'`,
    __CLOUDFLARE_PUPPETEER_VERSION__: JSON.stringify(packageJson.version),
  },
  build: {
    assetsInlineLimit: 0,
    minify: false,
    target: 'esnext',
    lib: {
      name: '@cloudflare/puppeteer',
      entry: [
        path.resolve(baseDir, 'src/index.ts'),
      ],
    },
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
        'node:buffer',
        'node:crypto',
        'node:events',
        'node:fs/promises',
        'node:fs',
        'node:http',
        'node:https',
        'node:net',
        'node:os',
        'node:path',
        'node:stream',
        'node:url',
        'node:util',
        'node:zlib',
        'debug',
        'cloudflare:workers',
        /^chromium-bidi\/.*/,
        /^devtools-protocol\/.*/,
      ],
    },
  },
});
