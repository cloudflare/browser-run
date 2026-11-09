// Local only (wrangler dev -c wrangler.check.toml): lists the tests the
// isolates see, for `kitebuild-playwright check-tests`, by running upstream's
// runner in an isolate on the same modules the runner Worker's isolates run.
//
//   POST /list {"args": [...]}: upstream's JSON report of `playwright test --list`.
import { listPlaywrightTests } from '@cloudflare/kitebuild-playwright-spec-runner';

import RUNNER_PAYLOAD from '../../runner/dist/runner-payload.txt';
import WORKER_PAYLOAD from '../../runner/dist/worker-payload.txt';
import { PROJECT_ROOT, project } from './project';

interface CheckEnv {
  LOADER: WorkerLoader;
}

export default {
  async fetch(request: Request, env: CheckEnv): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== '/list' || request.method !== 'POST')
      return new Response('POST /list', { status: 404 });
    const { args = [] } = await request.json<{ args?: string[] }>();
    try {
      return Response.json(await listPlaywrightTests({
        ...project(url.origin),
        loader: env.LOADER,
        payloads: { runner: RUNNER_PAYLOAD, worker: WORKER_PAYLOAD },
        cwd: PROJECT_ROOT,
      }, args));
    } catch (error) {
      return new Response(String((error as Error)?.stack ?? error), { status: 500 });
    }
  },
};
