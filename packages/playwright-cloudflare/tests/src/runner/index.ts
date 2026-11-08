// Runs upstream Playwright Test against Browser Run: the runner in a Worker
// Loader isolate and each worker process in its own, through
// @cloudflare/kitebuild-playwright-spec-runner. Built by runner/build.mjs.
//
//   POST /run  {"args": ["--project=suite"], "binding": "BROWSER"}
//     streams Playwright's output, ending with "[playwright exited with code N]".
//   anything else: the test server's assets.
import { runPlaywrightPhase, type ProjectBundle, type ProjectTree } from '@cloudflare/kitebuild-playwright-spec-runner';

import RUNNER_PAYLOAD from '../../runner/dist/runner-payload.txt';
import WORKER_PAYLOAD from '../../runner/dist/worker-payload.txt';
import PROJECT from '../../runner/dist/project.json';
import TREE from '../../runner/dist/tree.json';
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

function run(env: RunnerEnv, origin: string, { args = [], binding = 'BROWSER' }: RunRequest, write: (text: string) => void): Promise<unknown> {
  const browser = env[binding];
  if (!browser)
    throw new Error(`no Browser Run binding ${binding}`);
  const tree = TREE as ProjectTree;
  return runPlaywrightPhase({
    loader: env.LOADER,
    compatibilityDate: LOADED_COMPATIBILITY_DATE,
    payloads: { runner: RUNNER_PAYLOAD, worker: WORKER_PAYLOAD },
    phase: 'run',
    tree,
    bundle: { ...(PROJECT as ProjectBundle), files: FILES },
    files: {
      async readFile(file) {
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
    argv: ['test', ...args],
    cwd: PROJECT_ROOT,
    env: { CI: '1', ASSETS_URL: origin, BROWSER_BINDING: binding },
    workerBindings: { BROWSER: browser, [binding]: browser },
    stdout: write,
    stderr: write,
  });
}

export default {
  async fetch(request: Request, env: RunnerEnv, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
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
