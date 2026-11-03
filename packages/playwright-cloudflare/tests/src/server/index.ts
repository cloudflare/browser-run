// before everything else
import './underTest';

import { testSuites } from '@cloudflare/browser-test-runtime';
import { forwardToBrowserRun, testListResponse } from '@cloudflare/browser-test-runtime/worker-routes';

import { getBinding } from '../utils';
import { serveAsset } from './assets';

export { TestsServer } from './testsServer';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/v1')) {
      console.log('Forwarding request to binding', url.pathname);
      return await forwardToBrowserRun(request, getBinding(url));
    }
    if (url.pathname === '/')
      return testListResponse(await testSuites(), env);

    if (url.pathname === '/hello-world')
      return new Response('<title>Hello</title>Hello world', {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });

    const bindingName = url.searchParams.get('binding') ?? 'BROWSER';

    if (/\.(spec|test)\.ts$/.test(url.pathname)) {
      const sessionId = url.searchParams.get('sessionId');
      if (!sessionId)
        return new Response('sessionId is required', { status: 400 });
      const id = env.TESTS_SERVER.idFromName(`${bindingName}_${sessionId}`);
      const testsServer = env.TESTS_SERVER.get(id);
      return await testsServer.fetch(request);
    }

    return await serveAsset(request, env.ASSETS);
  }
};
