// Runs upstream Playwright Test in Node, with each worker process in a Worker
// Loader isolate behind the runner Worker's /worker route (src/runner/index.ts).
//
//   WORKER_URL=https://<runner worker> RUN_TOKEN=<token> node runner/node-run.mjs [binding=<name>] [playwright test args]
//
// Node lists the tests from runner/dist/node/project, which runner/build.mjs
// lays out like the isolates' /project, so the two agree on paths and test
// IDs. Paths in IPC messages are rewritten between the two roots.
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import Module, { createRequire } from 'node:module';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const runnerDir = path.dirname(fileURLToPath(import.meta.url));
const nodeRoot = path.join(runnerDir, 'dist', 'node', 'project');
const PROJECT_ROOT = '/project';

const { WORKER_URL, RUN_TOKEN } = process.env;
if (!WORKER_URL || !RUN_TOKEN)
  throw new Error('node-run: set WORKER_URL and RUN_TOKEN');
// The Worker must be deployed from this build: Node lists the tests from its
// copy, and the isolates run them by ID from theirs.
const { id: build } = JSON.parse(fs.readFileSync(path.join(runnerDir, 'dist', 'build.json'), 'utf8'));
const deployed = await fetch(new URL('/build', WORKER_URL)).then(response => response.ok ? response.json() : { id: `HTTP ${response.status}` });
if (deployed.id !== build) {
  process.stderr.write(`node-run: ${WORKER_URL} is deployed from build ${deployed.id}, but runner/dist is build ${build}; deploy runner/dist again\n`);
  process.exit(1);
}

let args = process.argv.slice(2);
const binding = args.find(arg => arg.startsWith('binding='))?.slice('binding='.length) ?? 'BROWSER';
args = args.filter(arg => !arg.startsWith('binding='));

// Upstream forks every worker process from ProcessHost.startRunner. Only that
// module gets the remote fork, and only the code it was written against.
const playwrightDir = path.dirname(require.resolve('playwright/package.json'));
const processHost = path.join(playwrightDir, 'lib', 'runner', 'processHost.js');
if (!fs.readFileSync(processHost, 'utf8').includes('import_child_process.default.fork(require.resolve("../common/process"), {'))
  throw new Error(`node-run: ${processHost} no longer forks ../common/process as expected`);
const processEntry = path.join(playwrightDir, 'lib', 'common', 'process.js');

const toIsolate = text => text.replaceAll(nodeRoot, PROJECT_ROOT);
const toNode = text => text.replaceAll(`"${PROJECT_ROOT}"`, JSON.stringify(nodeRoot)).replaceAll(`${PROJECT_ROOT}/`, `${nodeRoot}/`);

function remoteFork(modulePath, options) {
  if (modulePath !== processEntry)
    throw new Error(`node-run: unexpected fork of ${modulePath}`);
  // Only what the runner adds for this process, not Node's own environment.
  const env = Object.fromEntries(Object.entries(options.env).filter(([key, value]) => process.env[key] !== value));
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  if (options.stdio[1] !== 'pipe')
    child.stdout.pipe(process.stdout);
  if (options.stdio[2] !== 'pipe')
    child.stderr.pipe(process.stderr);

  const socket = new WebSocket(`${WORKER_URL.replace(/^http/, 'ws')}/worker?token=${encodeURIComponent(RUN_TOKEN)}`);
  const pending = [JSON.stringify({ build, env, binding })];
  let exited = false;
  const exit = code => {
    if (exited)
      return;
    exited = true;
    child.stdout.end();
    child.stderr.end();
    child.emit('exit', code, null);
  };
  socket.addEventListener('open', () => pending.splice(0).forEach(frame => socket.send(frame)));
  socket.addEventListener('message', ({ data }) => {
    const frame = JSON.parse(toNode(String(data)));
    if ('message' in frame)
      child.emit('message', frame.message);
    else if ('stdio' in frame)
      (frame.stdio === 1 ? child.stdout : child.stderr).write(frame.text);
    else if ('exit' in frame)
      exit(frame.exit);
  });
  socket.addEventListener('error', event => process.stderr.write(`node-run: worker socket: ${event.message ?? event.type}\n`));
  socket.addEventListener('close', () => exit(1));

  child.send = message => {
    if (message.method === '__init__') {
      if (!message.params.runnerScript.endsWith(path.join('worker', 'workerMain.js')))
        throw new Error(`node-run: only worker processes run in isolates, not ${message.params.runnerScript}`);
      // Node's compilation cache describes the files Node compiled, in its own
      // temporary directory; the isolate maps its modules itself.
      message.params.runnerParams.config.compilationCache = { sourceMaps: [], memoryCache: [], fileDependencies: [], externalDependencies: [] };
    }
    const frame = toIsolate(JSON.stringify({ message }));
    if (socket.readyState === WebSocket.OPEN)
      socket.send(frame);
    else
      pending.push(frame);
    return true;
  };
  child.kill = () => socket.close();
  return child;
}

const childProcess = require('node:child_process');
const load = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === 'child_process' && parent?.filename === processHost)
    return { ...childProcess, fork: remoteFork };
  return load.call(this, request, parent, isMain);
};

const { program } = require('playwright/lib/program');
program.parse([process.argv[0], 'playwright', 'test', '-c', path.join(nodeRoot, 'playwright.config.ts'), ...args]);
