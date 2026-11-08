// Checks that upstream's runner in Node and the isolates see the same tests.
// Node lists them from runner/dist/node/project, where what exists only in a
// Worker is stubbed; the runner isolate lists them from the modules the worker
// isolates run. A spec whose top level behaves differently against a stub, or
// in another environment, would otherwise send IDs the isolates lack, or skip
// differently.
//
//   WORKER_URL=https://<runner worker> RUN_TOKEN=<token> node runner/check-tests.mjs
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const runnerDir = path.dirname(fileURLToPath(import.meta.url));
const { WORKER_URL, RUN_TOKEN } = process.env;
if (!WORKER_URL || !RUN_TOKEN)
  throw new Error('check-tests: set WORKER_URL and RUN_TOKEN');

// The JSON reporter's object: a test ID per spec, its expected status per project.
function tests(report, where) {
  if (report.errors.length)
    throw new Error(`check-tests: ${where} could not load the tests:\n${report.errors.map(error => error.message).join('\n')}`);
  const found = new Map();
  const walk = (suite, titles) => {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests)
        found.set(`${test.projectId} ${spec.id}`, { title: [...titles, spec.title].join(' > '), expectedStatus: test.expectedStatus });
    }
    for (const child of suite.suites ?? [])
      walk(child, [...titles, child.title]);
  };
  for (const file of report.suites)
    walk(file, [file.title]);
  return found;
}

const playwrightCli = path.join(path.dirname(require.resolve('playwright/package.json')), 'cli.js');
const listed = spawnSync(process.execPath, [playwrightCli, 'test', '--list', '--reporter=json', '-c', path.join(runnerDir, 'dist', 'node', 'project', 'playwright.config.ts')], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
if (listed.status !== 0)
  throw new Error(`check-tests: listing in Node failed:\n${listed.stderr}${listed.stdout}`);
const inNode = tests(JSON.parse(listed.stdout), 'Node');

const response = await fetch(new URL('/run', WORKER_URL), {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${RUN_TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ args: ['--list', '--reporter=json'] }),
});
const output = await response.text();
if (!response.ok || !output.includes('[playwright exited with code 0]'))
  throw new Error(`check-tests: listing in the runner isolate failed (${response.status}):\n${output}`);
const inIsolates = tests(JSON.parse(output.slice(output.indexOf('{'), output.lastIndexOf('}') + 1)), 'the runner isolate');

const differences = [];
for (const [key, test] of inNode) {
  const other = inIsolates.get(key);
  if (!other)
    differences.push(`only in Node: ${test.title}`);
  else if (other.expectedStatus !== test.expectedStatus)
    differences.push(`expected ${test.expectedStatus} in Node but ${other.expectedStatus} in the isolates: ${test.title}`);
}
for (const [key, test] of inIsolates) {
  if (!inNode.has(key))
    differences.push(`only in the isolates: ${test.title}`);
}
if (differences.length) {
  process.stderr.write(`check-tests: Node and the isolates see different tests (${differences.length}):\n${differences.slice(0, 50).map(line => `  ${line}`).join('\n')}\n`);
  process.exit(1);
}
console.log(`check-tests: ${inNode.size} tests, the same in Node and the isolates`);
