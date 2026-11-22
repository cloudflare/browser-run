// before everything else
import './underTest';

import { testSuites } from '@cloudflare/browser-test-runtime';
import {
  acquireWithTestServerRoutes,
  forwardToBrowserRun,
  isAcquireRequest,
  isLocalDev,
  routeTestServerFetches,
  serveTestAsset,
  testListResponse,
} from '@cloudflare/browser-test-runtime/worker-routes';
import { acquire } from '@cloudflare/playwright';
import { env } from 'cloudflare:workers';

import { getBinding } from '../utils';

export { TestsServer } from './testsServer';

routeTestServerFetches({ fetch: (input, init) => env.TEST_ASSETS.fetch(input, init) });

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // The browser loads test pages from the test server hostnames, and Browser
    // Run routes them to the test assets Worker.
    if (isAcquireRequest(request) && !isLocalDev(url))
      return await acquireWithTestServerRoutes(acquire, getBinding(url), env.TEST_ASSETS);

    if (url.pathname.startsWith('/v1')) {
      console.log('Forwarding request to binding', url.pathname);
      return await forwardToBrowserRun(request, getBinding(url));
    }
    if (url.pathname === '/')
      return testListResponse(await testSuites(), env);

    const bindingName = url.searchParams.get('binding') ?? 'BROWSER';

    if (/\.(spec|test)\.ts$/.test(url.pathname)) {
      const sessionId = url.searchParams.get('sessionId');
      if (!sessionId)
        return new Response('sessionId is required', { status: 400 });
      const id = env.TESTS_SERVER.idFromName(`${bindingName}_${sessionId}`);
      const testsServer = env.TESTS_SERVER.get(id);
      return await testsServer.fetch(request);
    }

    return await serveTestAsset(request, env.ASSETS);
  }
};
