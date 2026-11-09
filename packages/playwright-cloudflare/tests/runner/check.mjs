// Checks that the runner in Node and the isolates see the same tests: lists
// them from runner/dist/node/project here, and from the isolates' modules in
// the check Worker (src/runner/check.ts) under a local wrangler dev. Needs no
// Cloudflare account.
//
//   node runner/check.mjs [playwright test arguments, such as --project=suite]
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkTests } from '@cloudflare/kitebuild-playwright-spec-runner/node';

const runnerDir = path.dirname(fileURLToPath(import.meta.url));
const testsDir = path.dirname(runnerDir);
const START_TIMEOUT_MS = 2 * 60 * 1000;

const port = await new Promise(resolve => {
  const server = createServer().listen(0, '127.0.0.1', () => {
    const { port } = server.address();
    server.close(() => resolve(port));
  });
});
const dev = spawn('npx', ['wrangler', 'dev', '-c', 'wrangler.check.toml', '--ip', '127.0.0.1', '--port', String(port), '--show-interactive-dev-session=false'], {
  cwd: testsDir,
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: true,
});
let devOutput = '';
dev.stdout.on('data', text => devOutput += text);
dev.stderr.on('data', text => devOutput += text);
const stop = () => {
  try {
    process.kill(-dev.pid, 'SIGTERM');
  } catch {}
};

let code = 1;
try {
  const url = `http://127.0.0.1:${port}/list`;
  for (const deadline = Date.now() + START_TIMEOUT_MS; ;) {
    if (dev.exitCode !== null)
      throw new Error(`wrangler dev exited:\n${devOutput}`);
    if (await fetch(url).then(() => true, () => false))
      break;
    if (Date.now() > deadline)
      throw new Error(`wrangler dev did not start:\n${devOutput}`);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  const { tests, differences } = await checkTests({ listUrl: url, projectRoot: path.join(runnerDir, 'dist', 'node', 'project'), args: process.argv.slice(2) });
  if (differences.length) {
    process.stderr.write(`check: Node and the isolates see different tests (${differences.length}):\n${differences.slice(0, 50).map(line => `  ${line}\n`).join('')}`);
  } else {
    console.log(`check: ${tests} tests, the same in Node and the isolates`);
    code = 0;
  }
} catch (error) {
  process.stderr.write(`check: ${error.message}\n`);
} finally {
  stop();
}
process.exit(code);
