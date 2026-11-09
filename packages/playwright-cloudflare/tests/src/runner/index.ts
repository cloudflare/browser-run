// The runner Worker: each worker process of upstream's Playwright Test runner,
// which runs in Node with kitebuild-playwright, in a Worker Loader isolate of
// its own, against Browser Run. Built by runner/build.mjs.
//
//   /worker: servePlaywrightWorker, with `Authorization: Bearer <RUN_TOKEN>`.
//   anything else: the test server's assets.
import { servePlaywrightWorker } from '@cloudflare/kitebuild-playwright-spec-runner';

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

export default {
  async fetch(request: Request, env: RunnerEnv, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== '/worker')
      return await serveAsset(request, env.ASSETS);
    if (!env.RUN_TOKEN || request.headers.get('Authorization') !== `Bearer ${env.RUN_TOKEN}`)
      return new Response('Unauthorized', { status: 401 });
    return servePlaywrightWorker(request, ctx, {
      ...project(url.origin),
      build: BUILD,
      loader: env.LOADER,
      payload: WORKER_PAYLOAD,
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
