// Builds what the runner Worker (src/runner/index.ts) loads into Worker Loader
// isolates, under runner/dist/:
//
// - runner-payload.txt, worker-payload.txt: upstream Playwright Test, built by
//   @cloudflare/kitebuild-playwright-spec-runner from the installed `playwright`
//   and @cloudflare/playwright (the client under test).
// - project.json: the config and specs bundled with the aliases of
//   ../vite.config.ts, one entry module per file, and their source maps.
// - tree.json: the virtual project the runner walks: /project/playwright.config.ts,
//   /project/tests/<spec> and /project/smoke/<spec>.
//
// Usage: node runner/build.mjs [spec ...], with specs named as in skipTests.ts
// (page/page-basic.spec.ts, browser-rendering/user-agent.spec.ts).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildRunnerPayload, buildWorkerPayload } from '@cloudflare/kitebuild-playwright-spec-runner/build';
import { build, loadConfigFromFile } from 'vite';

const PROJECT_ROOT = '/project';
const PILOT_SPECS = ['page/page-basic.spec.ts', 'browser-rendering/user-agent.spec.ts'];

const runnerDir = path.dirname(fileURLToPath(import.meta.url));
const testsDir = path.dirname(runnerDir);
const upstreamTestsDir = path.resolve(testsDir, '../../../submodules/playwright/tests');
const cloudflareTestsDir = path.join(testsDir, 'src');
const outDir = path.join(runnerDir, 'dist');
const modulesDir = path.join(outDir, 'modules');
const workerFixtures = path.join(cloudflareTestsDir, 'server/workerFixtures.ts');
const runnerFixtures = path.join(cloudflareTestsDir, 'runner/fixtures.ts');

const specFile = name => {
  const file = [cloudflareTestsDir, upstreamTestsDir].map(dir => path.join(dir, name)).find(fs.existsSync);
  if (!file)
    throw new Error(`no spec ${name} in ${cloudflareTestsDir} or ${upstreamTestsDir}`);
  return file;
};

// Real path -> virtual project path, for every file the runner may load.
const virtualPaths = new Map([[path.join(runnerDir, 'playwright.config.ts'), `${PROJECT_ROOT}/playwright.config.ts`]]);
for (const name of process.argv.length > 2 ? process.argv.slice(2) : PILOT_SPECS)
  virtualPaths.set(specFile(name), `${PROJECT_ROOT}/tests/${name}`);
for (const name of fs.readdirSync(path.join(runnerDir, 'smoke')))
  virtualPaths.set(path.join(runnerDir, 'smoke', name), `${PROJECT_ROOT}/smoke/${name}`);

const packageDir = name => path.join(testsDir, 'node_modules', name);
const runner = await buildRunnerPayload({ playwright: packageDir('playwright') });
const worker = await buildWorkerPayload({ playwright: packageDir('playwright'), cloudflarePlaywright: packageDir('@cloudflare/playwright') });
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'runner-payload.txt'), runner.source);
fs.writeFileSync(path.join(outDir, 'worker-payload.txt'), worker.source);

const { config: base } = await loadConfigFromFile({ command: 'build', mode: 'production' }, path.join(testsDir, 'vite.config.ts'));
const entryNames = new Map([...virtualPaths.keys()].map((file, index) => [`entry-${index}`, file]));
await build({
  configFile: false,
  root: testsDir,
  logLevel: 'warn',
  plugins: [
    {
      // The aliases send `@playwright/test`, `pageTest` and `browserTest` to
      // workerFixtures.ts, and browser-run's own specs import it directly.
      name: 'runner-fixtures',
      enforce: 'pre',
      async resolveId(source, importer, options) {
        if (!importer || importer === runnerFixtures)
          return null;
        const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
        return resolved?.id === workerFixtures ? runnerFixtures : resolved;
      },
    },
    ...base.plugins.filter(plugin => plugin.name === 'resolve-playwright-package-imports'),
  ],
  resolve: {
    alias: [
      { find: '@cloudflare/browser-test-runtime', replacement: path.join(cloudflareTestsDir, 'runner/runtime.ts') },
      ...Object.entries(base.resolve.alias).map(([find, replacement]) => ({ find, replacement })),
    ],
  },
  build: {
    outDir: modulesDir,
    emptyOutDir: true,
    minify: false,
    target: 'esnext',
    sourcemap: true,
    lib: { entry: Object.fromEntries(entryNames), formats: ['es'] },
    rollupOptions: {
      // `playwright/test` is mapped to the payloads by the spec runner.
      external: id => /^(node|cloudflare):/.test(id) || id === 'playwright/test',
      output: { entryFileNames: '[name].js', chunkFileNames: 'chunk-[hash].js' },
    },
  },
});

const project = { modules: {}, entries: {}, maps: {} };
for (const key of fs.readdirSync(modulesDir).filter(name => name.endsWith('.js'))) {
  project.modules[key] = fs.readFileSync(path.join(modulesDir, key), 'utf8');
  const entry = entryNames.get(key.replace(/\.js$/, ''));
  if (entry)
    project.entries[virtualPaths.get(entry)] = key;
  const map = JSON.parse(fs.readFileSync(path.join(modulesDir, `${key}.map`), 'utf8'));
  map.sources = map.sources.map(source => {
    const real = path.resolve(modulesDir, source);
    return virtualPaths.get(real) ?? real;
  });
  delete map.sourcesContent;
  project.maps[key] = JSON.stringify(map);
}
fs.writeFileSync(path.join(outDir, 'project.json'), JSON.stringify(project));

const tree = { roots: [PROJECT_ROOT], nodes: { [PROJECT_ROOT]: { type: 'dir' } } };
for (const [real, file] of virtualPaths) {
  for (let dir = path.posix.dirname(file); dir !== PROJECT_ROOT; dir = path.posix.dirname(dir))
    tree.nodes[dir] = { type: 'dir' };
  const text = fs.readFileSync(real, 'utf8');
  tree.nodes[file] = { type: 'file', size: Buffer.byteLength(text), mtimeMs: 0, text };
}
fs.writeFileSync(path.join(outDir, 'tree.json'), JSON.stringify(tree));

console.log(`runner/dist: playwright ${runner.playwrightVersion}, ${Object.keys(project.entries).length} entries, ${Object.keys(project.modules).length} modules`);
