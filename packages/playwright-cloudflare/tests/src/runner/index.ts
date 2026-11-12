// The runner Worker: each worker process of upstream's Playwright Test runner,
// which runs in Node with kitebuild-playwright, in a Worker Loader isolate of
// its own, against Browser Run. Built by runner/build.mjs.
//
//   /worker: servePlaywrightWorker, with `Authorization: Bearer <RUN_TOKEN>`.
//   /browser/v1/*: Browser Run, with the same token, for runner/run.mjs to
//     acquire and close the sessions it lends to the worker processes.
//   anything else: the test server's assets.
import { forwardToBrowserRun } from '@cloudflare/browser-test-runtime/worker-routes';
import { servePlaywrightWorker } from '@cloudflare/kitebuild-playwright-spec-runner';
import { WorkerEntrypoint } from 'cloudflare:workers';

import WORKER_PAYLOAD from '../../runner/dist/worker-payload.txt';
import { serveAsset } from '../server/assets';
import { BUILD, project } from './project';

import type { BrowserBindingName } from '../utils';

interface RunnerEnv {
  LOADER: WorkerLoader;
  ASSETS: Fetcher;
  RUN_TOKEN: string;
  BROWSER: BrowserRun;
  BROWSER_BRAPI_STAGING?: BrowserRun;
  BROWSER_BRAPI_PRODUCTION?: BrowserRun;
}

// The isolates' fetch(). A request from an isolate to this Worker's own
// hostnames does not reach it, so they are answered here, as the browser's are.
export class Outbound extends WorkerEntrypoint<RunnerEnv, { hosts: string[] }> {
  async fetch(request: Request): Promise<Response> {
    if (this.ctx.props.hosts.includes(new URL(request.url).host))
      return await serveAsset(request, this.env.ASSETS);
    return await fetch(request);
  }
}

export default {
  async fetch(request: Request, env: RunnerEnv, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const browserRun = url.pathname.startsWith('/browser/v1/');
    if (url.pathname !== '/worker' && !browserRun)
      return await serveAsset(request, env.ASSETS);
    if (!env.RUN_TOKEN || request.headers.get('Authorization') !== `Bearer ${env.RUN_TOKEN}`)
      return new Response('Unauthorized', { status: 401 });
    if (browserRun) {
      const binding = env[(url.searchParams.get('binding') ?? 'BROWSER') as BrowserBindingName];
      if (!binding)
        return new Response(`no Browser Run binding ${url.searchParams.get('binding')}`, { status: 400 });
      url.pathname = url.pathname.slice('/browser'.length);
      return await forwardToBrowserRun(new Request(url, request), binding);
    }
    return servePlaywrightWorker(request, ctx, {
      ...project(url.origin),
      build: BUILD,
      loader: env.LOADER,
      payload: WORKER_PAYLOAD,
      // The second origin is CROSS_PROCESS_PREFIX in src/server/workerFixtures.ts.
      workerOutbound: ctx.exports.Outbound({ props: { hosts: [url.host, url.host.replace(/^([^.]+)\./, '$1-cross-origin.')] } }),
      // kitebuild-playwright --forward-env BROWSER_BINDING selects the binding.
      workerBindings: processEnv => {
        const binding = (processEnv.BROWSER_BINDING ?? 'BROWSER') as BrowserBindingName;
        const browser = env[binding];
        if (!browser)
          throw new Error(`no Browser Run binding ${binding}`);
        return { BROWSER: browser, [binding]: browser };
      },
    });
  },
};
