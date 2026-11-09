// Builds the suite for upstream's Playwright Test runner in Node, whose worker
// processes run in Worker Loader isolates behind the runner Worker
// (src/runner/index.ts), under runner/dist/:
//
// - worker-payload.txt: upstream's worker process, built by
//   @cloudflare/kitebuild-playwright-spec-runner from the installed `playwright`
//   and @cloudflare/playwright (the client under test).
// - runner-payload.txt: upstream's runner, for the local check Worker only
//   (src/runner/check.ts), which lists the tests the isolates see.
// - project.json: the config and specs bundled with the aliases of
//   ../vite.config.ts, one entry module per file, and their source maps; and,
//   base64-encoded, the specs' snapshots and the assets they name, which
//   asset() reads at /bundle/assets/<name>.
// - tree.json: the isolates' project: /project/playwright.config.ts,
//   /project/tests/<spec> and /project/smoke/<spec>.
// - build-id.txt: an ID for the above; kitebuild-playwright refuses a Worker
//   deployed from another build.
// - node/project: the config and specs again, laid out like /project, from
//   which the runner in Node lists the tests, with source maps to the specs.
// - sources.json: each /project file's source, relative to runner/dist, for
//   the paths the isolates report (kitebuild-playwright's `sources`).
//
// Usage: node runner/build.mjs [spec ...], with specs named as in skipTests.ts
// (page/page-basic.spec.ts, browser-rendering/user-agent.spec.ts); the whole
// suite (specs.mjs) by default.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildRunnerPayload, buildWorkerPayload, collectProjectFiles } from '@cloudflare/kitebuild-playwright-spec-runner/build';
import { decode, encode } from '@jridgewell/sourcemap-codec';
import { build, loadConfigFromFile } from 'vite';

import { playwrightDir, playwrightVendoredImports } from '../../../browser-test-runtime/utils/vite-playwright.js';

import snapshots from './snapshots.json' with { type: 'json' };
import { assetNames, suiteSpecs } from './specs.mjs';

const PROJECT_ROOT = '/project';

const require = createRequire(import.meta.url);
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
for (const name of process.argv.length > 2 ? process.argv.slice(2) : suiteSpecs({ upstreamTestsDir, cloudflareTestsDir }))
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
const plugins = [
  {
    // The aliases send `@playwright/test`, `pageTest` and `browserTest` to
    // workerFixtures.ts, and browser-run's own specs import it directly.
    // `@cloudflare/playwright`, which the aliases also give `playwright` and
    // `playwright-core`, is the worker payload's client in the isolates: a
    // copy here would be a second client, and its code and source maps
    // would fill every isolate.
    name: 'runner-fixtures',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      if (source === '@cloudflare/playwright')
        return { id: source, external: true };
      if (!importer || importer === runnerFixtures)
        return null;
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
      return resolved?.id === workerFixtures ? runnerFixtures : resolved;
    },
  },
  ...base.plugins.filter(plugin => plugin.name === 'resolve-playwright-package-imports'),
];
// Upstream's sources and tests import their npm dependencies and its
// utilsBundle barrel, which ../vite.config.ts rewrites to
// @cloudflare/playwright/internal, there external; both builds below bundle it.
const internal = require.resolve('@cloudflare/playwright/internal');
const vendoredImports = target => playwrightVendoredImports({ target, include: [path.join(playwrightDir, 'packages'), upstreamTestsDir] });
const resolve = {
  alias: [
    { find: '@cloudflare/browser-test-runtime', replacement: path.join(cloudflareTestsDir, 'runner/runtime.ts') },
    ...base.resolve.alias,
  ],
};
await build({
  configFile: false,
  root: testsDir,
  logLevel: 'warn',
  plugins: [...plugins, vendoredImports(internal)],
  resolve,
  build: {
    outDir: modulesDir,
    commonjsOptions: base.build.commonjsOptions,
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

// The same config and specs for upstream's runner in Node, which only lists
// their tests: at runner/dist/node/project/<path> for each
// /project/<path>, so test IDs agree with the isolates', and with what exists
// only in a Worker stubbed.
const nodeStub = '\0node-stub:';
await build({
  configFile: false,
  root: testsDir,
  logLevel: 'warn',
  plugins: [
    {
      name: 'node-stubs',
      enforce: 'pre',
      // @cloudflare/playwright/internal, utilities that upstream's modules
      // call as they load, runs in Node as it is.
      resolveId: source => /^(cloudflare:|@cloudflare\/playwright(\/test)?$)/.test(source) ? { id: nodeStub + source, syntheticNamedExports: true } : null,
      load: id => id.startsWith(nodeStub) ? `
const stub = name => new Proxy(function () {}, {
  // Playwright reads a function fixture's parameters from toString() and
  // caches them on it under a symbol.
  get: (target, key) => key === 'then' || typeof key === 'symbol' ? target[key] : key === 'toString' ? () => 'function () {}' : stub(name + '.' + key),
  apply: () => { throw new Error(name + ' is only available in a Worker, not while Node lists tests'); },
  construct: () => { throw new Error(name + ' is only available in a Worker, not while Node lists tests'); },
});
export default stub(${JSON.stringify(id.slice(nodeStub.length))});
` : null,
    },
    ...plugins,
    vendoredImports(internal),
  ],
  resolve,
  build: {
    outDir: path.join(outDir, 'node', 'project'),
    commonjsOptions: base.build.commonjsOptions,
    emptyOutDir: true,
    minify: false,
    target: 'node22',
    // So that upstream gives test locations in the specs themselves.
    sourcemap: true,
    lib: { entry: Object.fromEntries([...virtualPaths].map(([real, file]) => [path.posix.relative(PROJECT_ROOT, file), real])), formats: ['cjs'] },
    rollupOptions: {
      external: id => /^node:/.test(id) || id === 'playwright/test',
      output: { entryFileNames: '[name]', chunkFileNames: 'chunks/[name]-[hash].cjs' },
    },
  },
});

// An isolate parses a module's whole map the first time a stack frame in it is
// mapped, and keeps it: the chunk holding @cloudflare/playwright/internal
// alone took 45 MiB of the isolate's 128. Only the specs and their helpers are
// kept, which is where reported locations point; frames in library code keep
// the bundle's own.
const reportedSource = source => [upstreamTestsDir, cloudflareTestsDir, runnerDir].some(dir => source.startsWith(dir + path.sep)) || source.startsWith(`${PROJECT_ROOT}/`);
function reportedMappings(map) {
  const sources = [];
  const index = map.sources.map(source => reportedSource(source) ? sources.push(source) - 1 : -1);
  // Where a dropped run follows a kept segment on a line, an unmapped column
  // ends it, so a frame there is not given that segment's source. Names are
  // dropped too; stack mapping does not use them.
  const lines = decode(map.mappings).map(line => {
    const kept = [];
    for (const [column, source, sourceLine, sourceColumn] of line) {
      if (source !== undefined && index[source] >= 0)
        kept.push([column, index[source], sourceLine, sourceColumn]);
      else if (kept.length && kept.at(-1).length > 1)
        kept.push([column]);
    }
    return kept;
  });
  return { ...map, sources, names: [], mappings: encode(lines) };
}

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
  project.maps[key] = JSON.stringify(reportedMappings(map));
}
const specs = [...virtualPaths].filter(([, file]) => file.startsWith(`${PROJECT_ROOT}/tests/`));
const assets = assetNames(specs.map(([real]) => real), path.join(upstreamTestsDir, 'assets'));
const binary = collectProjectFiles({
  snapshots: {
    snapshotPathTemplate: snapshots.snapshotPathTemplate,
    testDir: `${PROJECT_ROOT}/tests`,
    testFiles: specs.map(([, file]) => file),
    // A spec directory is browser-run's own (src/) or upstream's.
    resolve: dir => {
      const relative = path.posix.relative(`${PROJECT_ROOT}/tests`, dir);
      return [cloudflareTestsDir, upstreamTestsDir].map(root => path.join(root, relative)).find(fs.existsSync);
    },
  },
  // A name may be a directory, such as axe-core/implicit-role.
  assets: [{ dir: upstreamTestsDir, include: assets.flatMap(name => [`assets/${name}`, `assets/${name}/**`]) }],
});
project.files = Object.fromEntries(Object.entries(binary.files).map(([key, bytes]) => [key, Buffer.from(bytes).toString('base64')]));
fs.writeFileSync(path.join(outDir, 'project.json'), JSON.stringify(project));

const tree = { roots: [PROJECT_ROOT], nodes: { [PROJECT_ROOT]: { type: 'dir' }, ...binary.nodes } };
for (const [real, file] of virtualPaths) {
  for (let dir = path.posix.dirname(file); dir !== PROJECT_ROOT; dir = path.posix.dirname(dir))
    tree.nodes[dir] = { type: 'dir' };
  const text = fs.readFileSync(real, 'utf8');
  tree.nodes[file] = { type: 'file', size: Buffer.byteLength(text), mtimeMs: 0, text };
}
fs.writeFileSync(path.join(outDir, 'tree.json'), JSON.stringify(tree));
// The isolates map their stack frames to /project with the specs' own lines.
fs.writeFileSync(path.join(outDir, 'sources.json'), JSON.stringify(Object.fromEntries([...virtualPaths].map(([real, file]) => [file, path.relative(outDir, real)]))));

// What the Worker deploys from this build. A Worker deployed from another
// need not have the test IDs the Node copy lists.
const buildId = createHash('sha256');
for (const name of ['worker-payload.txt', 'project.json', 'tree.json'])
  buildId.update(fs.readFileSync(path.join(outDir, name)));
fs.writeFileSync(path.join(outDir, 'build-id.txt'), buildId.digest('hex').slice(0, 16));

const fileBytes = Object.values(binary.files).reduce((total, bytes) => total + bytes.byteLength, 0);
console.log(`runner/dist: playwright ${runner.playwrightVersion}, ${specs.length} specs, ${Object.keys(project.modules).length} modules, ${Object.keys(binary.files).length} files (${(fileBytes / 1024).toFixed(0)} KiB)`);
