// Runs upstream Playwright Test against Browser Run: the runner in a Worker
// Loader isolate and each worker process in its own, through
// @cloudflare/kitebuild-playwright-spec-runner. Built by runner/build.mjs.
//
//   POST /run  {"args": ["--project=suite"], "binding": "BROWSER"}
//     streams Playwright's output, ending with "[playwright exited with code N]".
//   anything else: the test server's assets.
import { runPlaywrightPhase, runPlaywrightWorker, type ProjectBundle, type ProjectTree } from '@cloudflare/kitebuild-playwright-spec-runner';

import RUNNER_PAYLOAD from '../../runner/dist/runner-payload.txt';
import WORKER_PAYLOAD from '../../runner/dist/worker-payload.txt';
import PROJECT from '../../runner/dist/project.json';
import TREE from '../../runner/dist/tree.json';
import BUILD from '../../runner/dist/build.json';
import { serveAsset } from '../server/assets';

import type { BrowserBindingName } from '../utils';

interface RunnerEnv {
  LOADER: WorkerLoader;
  ASSETS: Fetcher;
  RUN_TOKEN: string;
  BROWSER: BrowserRun;
  BROWSER_BRAPI_STAGING?: BrowserRun;
  BROWSER_BRAPI_PRODUCTION?: BrowserRun;
}

interface RunRequest {
  args?: string[];
  binding?: BrowserBindingName;
}

const PROJECT_ROOT = '/project';

// Snapshots and assets, base64 in project.json.
const FILES = Object.fromEntries(Object.entries((PROJECT as { files: Record<string, string> }).files).map(([key, base64]) =>
  [key, Uint8Array.from(atob(base64), char => char.charCodeAt(0)).buffer]));
const LOADED_COMPATIBILITY_DATE = '2026-04-04';
const RUN_TIMEOUT_MS = 20 * 60 * 1000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`timed out after ${ms / 1000}s`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

// What the runner and every worker isolate share: the project and a browser.
function project(env: RunnerEnv, origin: string, binding: BrowserBindingName) {
  const browser = env[binding];
  if (!browser)
    throw new Error(`no Browser Run binding ${binding}`);
  const tree = TREE as ProjectTree;
  return {
    loader: env.LOADER,
    compatibilityDate: LOADED_COMPATIBILITY_DATE,
    payloads: { runner: RUNNER_PAYLOAD, worker: WORKER_PAYLOAD },
    tree,
    bundle: { ...(PROJECT as ProjectBundle), files: FILES },
    files: {
      async readFile(file: string) {
        const node = tree.nodes[file];
        if (node?.type !== 'file' || node.text === undefined)
          throw Object.assign(new Error(`ENOENT: no such file, open '${file}'`), { code: 'ENOENT' });
        return new TextEncoder().encode(node.text).buffer as ArrayBuffer;
      },
      // Reporter output (test-results/.last-run.json) is not kept yet.
      writeFile() {},
      mkdir() {},
      remove() {},
    },
    env: { CI: '1', ASSETS_URL: origin, BROWSER_BINDING: binding },
    workerBindings: { BROWSER: browser, [binding]: browser },
  };
}

function run(env: RunnerEnv, origin: string, { args = [], binding = 'BROWSER' }: RunRequest, write: (text: string) => void): Promise<unknown> {
  return runPlaywrightPhase({
    ...project(env, origin, binding),
    phase: 'run',
    argv: ['test', ...args],
    cwd: PROJECT_ROOT,
    stdout: write,
    stderr: write,
  });
}

interface WorkerStart {
  build: string;
  env: Record<string, string>;
  binding?: BrowserBindingName;
}

// One worker process for upstream's runner in Node (runner/node-run.mjs). The
// socket's first frame is {build, env, binding}, then {message} for each IPC
// message; the isolate answers with {message}, {stdio, text} and finally {exit}.
// A runner listing tests from another build would send IDs this one lacks.
async function worker(env: RunnerEnv, origin: string, socket: WebSocket): Promise<void> {
  const inbox: unknown[] = [];
  let waiter: ((items: unknown[] | null) => void) | undefined;
  let closed = false;
  const flush = () => {
    if (!waiter || (!inbox.length && !closed))
      return;
    const resolve = waiter;
    waiter = undefined;
    resolve(inbox.length ? inbox.splice(0) : null);
  };
  let start!: (frame: WorkerStart) => void;
  const started = new Promise<WorkerStart>(resolve => start = resolve);
  let first = true;
  socket.addEventListener('message', event => {
    const frame = JSON.parse(event.data as string);
    if (first) {
      first = false;
      start(frame);
      return;
    }
    inbox.push(frame.message);
    flush();
  });
  socket.addEventListener('close', () => {
    closed = true;
    flush();
  });
  const send = (frame: unknown) => {
    try {
      socket.send(JSON.stringify(frame));
    } catch {}
  };

  let code = 1;
  try {
    const { build, env: processEnv, binding = 'BROWSER' } = await started;
    if (build !== BUILD.id)
      throw new Error(`this Worker was deployed from build ${BUILD.id}, but the runner's tests are from build ${build}; deploy runner/dist again`);
    code = await runPlaywrightWorker(project(env, origin, binding), processEnv, {
      take: () => new Promise(resolve => {
        waiter = resolve;
        flush();
      }),
      output: items => items.forEach(send),
    });
  } catch (error) {
    send({ stdio: 2, text: `${String((error as Error)?.stack ?? error)}\n` });
  }
  send({ exit: code });
  socket.close(1000);
}

export default {
  async fetch(request: Request, env: RunnerEnv, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/build')
      return Response.json(BUILD);
    if (url.pathname === '/worker') {
      // WebSocket clients cannot set headers, so the token is a parameter.
      if (!env.RUN_TOKEN || url.searchParams.get('token') !== env.RUN_TOKEN)
        return new Response('Unauthorized', { status: 401 });
      if (request.headers.get('Upgrade') !== 'websocket')
        return new Response('WebSocket only', { status: 426 });
      const [client, server] = Object.values(new WebSocketPair());
      server.accept();
      ctx.waitUntil(worker(env, url.origin, server));
      return new Response(null, { status: 101, webSocket: client });
    }
    if (url.pathname !== '/run')
      return await serveAsset(request, env.ASSETS);
    if (request.method !== 'POST')
      return new Response('POST /run', { status: 405 });
    if (!env.RUN_TOKEN || request.headers.get('Authorization') !== `Bearer ${env.RUN_TOKEN}`)
      return new Response('Unauthorized', { status: 401 });

    const body = await request.json<RunRequest>();
    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();
    // A caller that disconnects only loses output; the run still finishes.
    const write = (text: string) => void writer.write(encoder.encode(text)).catch(() => {});
    ctx.waitUntil((async () => {
      try {
        const result = await withTimeout(run(env, url.origin, body, write), RUN_TIMEOUT_MS) as { code: number };
        write(`\n[playwright exited with code ${result.code}]\n`);
      } catch (error) {
        write(`\n[playwright run failed: ${String((error as Error)?.stack ?? error)}]\n`);
      } finally {
        await writer.close().catch(() => {});
      }
    })());
    return new Response(readable, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  },
};
