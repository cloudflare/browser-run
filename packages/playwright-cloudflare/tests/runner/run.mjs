// Runs the suite: upstream's Playwright Test runner here, each of its worker
// processes in the runner Worker at RUNNER_URL (src/runner/index.ts).
//
//   RUNNER_URL=https://playwright-test-runner.rendering.cfdata.org RUN_TOKEN=<token> \
//     node runner/run.mjs [playwright test arguments]
//
// CF_ACCESS_CLIENT_ID and CF_ACCESS_CLIENT_SECRET, when set, are sent for
// Cloudflare Access; BROWSER_BINDING selects the Browser Run binding.
//
// Each test group runs in a fresh isolate, but the browser outlives it: this
// script acquires one Browser Run session per parallel worker slot, lends them
// to the worker processes in BROWSER_SESSION_IDS (src/runner/fixtures.ts), and
// closes them once Playwright exits. Upstream exits the process itself when it
// reports, so Playwright runs in a child process of this one.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readSources, runPlaywright, workerServerInfo } from '@cloudflare/kitebuild-playwright-spec-runner/node';

const runnerDir = path.dirname(fileURLToPath(import.meta.url));
const buildIdFile = path.join(runnerDir, 'dist', 'build-id.txt');
const { RUNNER_URL, RUN_TOKEN, CF_ACCESS_CLIENT_ID, CF_ACCESS_CLIENT_SECRET, BROWSER_BINDING = 'BROWSER' } = process.env;
// A Worker just deployed, or given a new token, takes a moment to serve everywhere.
const DEPLOY_WAIT_MS = 3 * 60 * 1000;
// playwright.config.ts's `workers`, when the arguments do not set it.
const CONFIG_WORKERS = 6;
// Browser Run's longest idle time: between two worker processes of a slot the
// session has no client.
const KEEP_ALIVE_MS = 10 * 60 * 1000;
const PLAYWRIGHT_CHILD = 'KITEBUILD_PLAYWRIGHT_CHILD';

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
const args = process.argv.slice(2);

if (process.env[PLAYWRIGHT_CHILD]) {
  await runPlaywright({
    workerUrl,
    projectRoot: path.join(runnerDir, 'dist', 'node', 'project'),
    buildIdFile,
    headers,
    // KITEBUILD_PLAYWRIGHT_TMP_REPORT: each worker reports its isolate's /tmp as each test begins.
    forwardEnv: ['BROWSER_BINDING', 'BROWSER_SESSION_IDS', 'KITEBUILD_PLAYWRIGHT_TMP_REPORT'],
    // A full-page screenshot comparison can leave more than half an isolate's
    // memory charged until it is collected, and a long-lived isolate need not
    // collect in time. With the config's fullyParallel each independent test
    // is a group: three tests per isolate was as safe as one for the screenshot
    // specs and spent less time starting isolates; four saved little more.
    groupsPerIsolate: 3,
    // Errors and steps the isolates report name the specs, not Node's bundles.
    sources: readSources(path.join(runnerDir, 'dist', 'sources.json')),
    args,
  }).catch(error => fail(error.message));
} else {
  await waitForBuild();
  const sessionIds = [];
  let child;
  const forward = signal => child?.kill(signal);
  process.on('SIGINT', forward);
  process.on('SIGTERM', forward);
  let code = 1;
  try {
    for (let i = workerCount(args); i > 0; i--)
      sessionIds.push(await acquireSession());
    child = spawn(process.execPath, [fileURLToPath(import.meta.url), ...args], {
      stdio: 'inherit',
      env: { ...process.env, [PLAYWRIGHT_CHILD]: '1', BROWSER_SESSION_IDS: sessionIds.join(',') },
    });
    code = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (exitCode, signal) => resolve(exitCode ?? (signal ? 1 : 0)));
    });
  } catch (error) {
    process.stderr.write(`run: ${error.message}\n`);
  } finally {
    await Promise.all(sessionIds.map(closeSession));
  }
  process.exit(code);
}

// Until a few answers in a row come from this build with this token: for a
// while after a deploy, some requests still reach the previous version.
async function waitForBuild() {
  const SETTLED_ANSWERS = 3;
  const build = fs.readFileSync(buildIdFile, 'utf8').trim();
  for (let settled = 0, deadline = Date.now() + DEPLOY_WAIT_MS; ;) {
    const served = await workerServerInfo(workerUrl, headers).then(info => info.build, error => error.message);
    settled = served === build ? settled + 1 : 0;
    if (settled === SETTLED_ANSWERS)
      return;
    if (Date.now() > deadline)
      fail(`${workerUrl} still serves ${served}, not build ${build}`);
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
}

// How many worker processes Playwright runs at once: `--workers`/`-j`, or the config's.
function workerCount(argv) {
  let value;
  for (let i = 0; i < argv.length; i++) {
    const match = /^(?:--workers|-j)(?:=(.*))?$/.exec(argv[i]);
    if (match)
      value = match[1] ?? argv[++i];
  }
  if (value === undefined)
    return CONFIG_WORKERS;
  if (!/^[1-9][0-9]*$/.test(value))
    fail(`--workers must be a number of workers here, not ${JSON.stringify(value)}: each one is lent a browser session`);
  return Number(value);
}

function browserUrl(pathname) {
  const url = new URL(`/browser/v1/devtools/browser${pathname}`, RUNNER_URL);
  url.searchParams.set('binding', BROWSER_BINDING);
  return url;
}

async function acquireSession() {
  const url = browserUrl('');
  url.searchParams.set('keep_alive', String(KEEP_ALIVE_MS));
  const response = await fetch(url, { method: 'POST', headers, signal: AbortSignal.timeout(60_000) });
  const body = await response.text();
  if (!response.ok)
    throw new Error(`acquiring a browser session answered ${response.status}: ${body.slice(0, 200)}`);
  const { sessionId } = JSON.parse(body);
  if (!sessionId)
    throw new Error(`acquiring a browser session answered without a sessionId: ${body.slice(0, 200)}`);
  await waitForSession(sessionId);
  return sessionId;
}

// A just-acquired session can take a moment to accept connections.
async function waitForSession(sessionId) {
  const url = new URL(`/browser/v1/devtools/session/${sessionId}`, RUNNER_URL);
  url.searchParams.set('binding', BROWSER_BINDING);
  for (let attempt = 0; attempt < 10; attempt++) {
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) });
    await response.body?.cancel();
    if (response.ok)
      return;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error(`browser session ${sessionId} was acquired but did not become available`);
}

// Best effort: a session nobody closes ends after KEEP_ALIVE_MS without a client.
async function closeSession(sessionId) {
  const url = browserUrl(`/${sessionId}`);
  url.protocol = url.protocol.replace('http', 'ws');
  await new Promise(resolve => {
    const socket = new WebSocket(url, { headers });
    const timer = setTimeout(() => socket.close(), 15_000);
    socket.addEventListener('open', () => socket.send(JSON.stringify({ id: 1, method: 'Browser.close', params: {} })));
    socket.addEventListener('message', ({ data }) => {
      if (JSON.parse(data).id === 1)
        socket.close();
    });
    socket.addEventListener('error', () => {
      process.stderr.write(`run: could not close browser session ${sessionId}; it ends when idle\n`);
    });
    socket.addEventListener('close', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}
