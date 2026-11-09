// Runs the suite: upstream's Playwright Test runner here, each of its worker
// processes in the runner Worker at RUNNER_URL (src/runner/index.ts).
//
//   RUNNER_URL=https://playwright-test-runner.rendering.cfdata.org RUN_TOKEN=<token> \
//     node runner/run.mjs [playwright test arguments]
//
// CF_ACCESS_CLIENT_ID and CF_ACCESS_CLIENT_SECRET, when set, are sent for
// Cloudflare Access; BROWSER_BINDING selects the Browser Run binding.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runPlaywright, workerServerInfo } from '@cloudflare/kitebuild-playwright-spec-runner/node';

const runnerDir = path.dirname(fileURLToPath(import.meta.url));
const buildIdFile = path.join(runnerDir, 'dist', 'build-id.txt');
const { RUNNER_URL, RUN_TOKEN, CF_ACCESS_CLIENT_ID, CF_ACCESS_CLIENT_SECRET } = process.env;
// A Worker just deployed, or given a new token, takes a moment to serve everywhere.
const DEPLOY_WAIT_MS = 3 * 60 * 1000;

function fail(message) {
  process.stderr.write(`run: ${message}\n`);
  process.exit(1);
}

if (!RUNNER_URL || !RUN_TOKEN)
  fail('set RUNNER_URL and RUN_TOKEN');
const workerUrl = new URL('/worker', RUNNER_URL).href;
const headers = {
  'Authorization': `Bearer ${RUN_TOKEN}`,
  ...(CF_ACCESS_CLIENT_ID && { 'CF-Access-Client-Id': CF_ACCESS_CLIENT_ID, 'CF-Access-Client-Secret': CF_ACCESS_CLIENT_SECRET }),
};

const build = fs.readFileSync(buildIdFile, 'utf8').trim();
for (const deadline = Date.now() + DEPLOY_WAIT_MS; ;) {
  const served = await workerServerInfo(workerUrl, headers).then(info => info.build, error => error.message);
  if (served === build)
    break;
  if (Date.now() > deadline)
    fail(`${workerUrl} still serves ${served}, not build ${build}`);
  await new Promise(resolve => setTimeout(resolve, 5000));
}

await runPlaywright({
  workerUrl,
  projectRoot: path.join(runnerDir, 'dist', 'node', 'project'),
  buildIdFile,
  headers,
  forwardEnv: ['BROWSER_BINDING'],
  // An isolate runs out of memory after a dozen or so spec files.
  groupsPerIsolate: 4,
  args: process.argv.slice(2),
}).catch(error => fail(error.message));
