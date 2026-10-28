import { build } from 'vite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const basedir = path.dirname(fileURLToPath(import.meta.url));
const playwrightDir = path.join(basedir, '..', '..', '..', 'submodules', 'playwright');
const jestDir = path.join(basedir, '..', '..', '..', 'submodules', 'jest');
const outDir = path.join(basedir, '../src/bundles');

const bundles = [
  {
    // pngjs needs to bundle browserify-zlib, it throws an error when trying to use workers runtime zlib:
    // Error: Class constructor Inflate cannot be invoked without 'new'
    // It needs to build before other bundles, because they may depend on it
    name: 'pngjs',
    root: path.join(basedir, '../bundles/pngjs'),
    entry: { pngjs: path.join(basedir, '../bundles/pngjs/src/pngjs.ts') },
  },
  {
    // Upstream vendors all npm dependencies of playwright-core through this single barrel.
    name: 'utilsBundleImpl',
    root: playwrightDir,
    entry: { utilsBundleImpl: path.join(playwrightDir, 'packages/playwright-core/src/utilsBundle.ts') },
  },
  {
    // Jest helpers used by playwright's inlined expect library (matchers/expectLibrary.ts).
    // Each entry keeps the original package exports, so imports can be aliased one-to-one.
    name: 'jest',
    root: playwrightDir,
    entry: {
      'jest-matcher-utils': path.join(jestDir, 'packages/jest-matcher-utils/src/index.ts'),
      'jest-message-util': path.join(jestDir, 'packages/jest-message-util/src/index.ts'),
      'jest-expect-utils': path.join(jestDir, 'packages/expect-utils/src/index.ts'),
    },
  },
];

const external = [
  'assert',
  'async_hooks',
  'buffer',
  'child_process',
  'constants',
  'crypto',
  'dns',
  'events',
  'fs',
  'http',
  'http2',
  'https',
  'module',
  'net',
  'os',
  'path',
  'process',
  'stream',
  'string_decoder',
  'tls',
  'url',
  'util',
  'readline',
  // Node.js prefixed modules
  'node:crypto',
  'node:url',
  'node:stream',
  'node:http',
  'node:https',
  'node:http2',
  'node:buffer',
  'node:events',
  'node:async_hooks',
  'node:child_process',
  'node:fs',
  'node:path',
  'node:process',
  'node:util',
  'node:net',
  'node:string_decoder',
  'node:tls',
  'node:os',
  'node:readline',
];

function listNodeModules(root) {
  const nodeModulesDir = path.join(root, 'node_modules');
  return fs.readdirSync(nodeModulesDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .flatMap(dirent => dirent.name.startsWith('@')
      // expand scoped packages (the ones that start with @)
      ? fs.readdirSync(path.join(nodeModulesDir, dirent.name), { withFileTypes: true })
        .filter(subdirent => subdirent.isDirectory())
        .map(subdirent => `${dirent.name}/${subdirent.name}`)
      : [dirent.name]);
}

// we'll use jest packages source code instead of npm packages
const jestPackages = Object.fromEntries(fs.readdirSync(path.join(jestDir, 'packages'), { withFileTypes: true })
  .filter(dirent => dirent.isDirectory() &&
    fs.existsSync(path.join(jestDir, 'packages', dirent.name, 'package.json')) &&
    fs.existsSync(path.join(jestDir, 'packages', dirent.name, 'src', 'index.ts')))
  .map(dirent => [
    JSON.parse(fs.readFileSync(path.join(jestDir, 'packages', dirent.name, 'package.json'), 'utf-8')).name,
    path.join(jestDir, 'packages', dirent.name, 'src', 'index.ts')
  ]));

(async () => {
  for (const { name, root, entry } of bundles) {
    // jest sources live outside the root, so their npm dependencies must resolve from the root node_modules
    const nodeModulesLibs = name === 'jest' ? listNodeModules(root).filter(lib => !(lib in jestPackages)) : [];

    await build({
      root,
      configFile: false,
      // Jest is source input here, not a separately installed project.
      esbuild: { tsconfigRaw: {} },
      resolve: {
        dedupe: nodeModulesLibs,
        alias: {
          'node:events': 'events',
          'node:child_process': 'child_process',
          'node:path': 'path',
          'node:fs': 'fs',
          'node:process': 'process',
          'node:string_decoder': 'string_decoder',

          // jest npm package is commonjs,
          ...jestPackages,

          'commander': path.join(basedir, '../src/mocks/commander'),
          'socks-proxy-agent': path.join(basedir, '../src/mocks/socksProxyAgent'),
          'open': path.join(basedir, '../src/mocks/open'),
          // optional native macOS dependency of chokidar
          'fsevents': path.join(basedir, '../src/mocks/empty'),
          // same replacement upstream uses when bundling utilsBundle (utils/build/build.js)
          'raw-body': path.join(playwrightDir, 'utils/build/raw-body.ts'),

          ...(name === 'pngjs' ? { 'zlib': 'browserify-zlib' } :
          { 'pngjs': path.join(outDir, 'pngjs.js') }),
        },
      },
      build: {
        emptyOutDir: false,
        minify: false,
        // prevents __defProp, __defNormalProp, __publicField in compiled code
        target: 'esnext',
        lib: {
          name,
          entry,
          formats: ['es'],
        },
        rollupOptions: {
          external: [
            /^node:/,
            ...(name === 'pngjs' ? external
              : [...external, 'zlib', 'pngjs'])
          ],
          output: {
            dir: outDir,
            entryFileNames: '[name].js',
            chunkFileNames: `${name}-[name].js`,
          },
        },
        commonjsOptions: {
          transformMixedEsModules: true,
          extensions: ['.ts', '.js'],
          include: [
            ...Object.values(entry),
            path.join(root, './src/**/*'),
            path.join(root, './node_modules/**/*'),
          ],
        }
      },
    });
  }
})();
