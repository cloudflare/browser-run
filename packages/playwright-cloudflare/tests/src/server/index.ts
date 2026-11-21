// before everything else
import './underTest';

import { testSuites } from '@cloudflare/browser-test-runtime';
import {
  acquireWithTestServerRoutes,
  forwardToBrowserRun,
  isAcquireRequest,
  isLocalDev,
  testListResponse,
} from '@cloudflare/browser-test-runtime/worker-routes';
import { acquire } from '@cloudflare/playwright';

import { getBinding } from '../utils';

export { TestsServer } from './testsServer';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // The browser loads test pages from the test server hostnames, and Browser
    // Run routes them back to this Worker.
    if (isAcquireRequest(request) && !isLocalDev(url))
      return await acquireWithTestServerRoutes(acquire, getBinding(url), env.SELF);

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

    if (url.pathname === '/index.html')
      // let's use empty.html for index.html
      request = new Request(request.url.replace(/\/index\.html$/, '/empty'));
    else if (url.pathname.endsWith('.html'))
      // assets serve html files without .html extension
      request = new Request(request.url.substring(0, request.url.length - '.html'.length));

    let response = await env.ASSETS?.fetch(request);
    if (!response)
      return new Response('Not found', { status: 404 });
    // Like the upstream test server, give missing files a body. Chromium shows
    // its own error page instead of an empty 4xx response.
    if (response.status === 404 && request.method !== 'HEAD')
      response = new Response(`File not found: ${new URL(request.url).pathname}`, { status: 404, headers: { 'Content-Type': 'text/plain' } });

    const headers = new Headers(response.headers);
    headers.set('Cache-Control', 'no-cache, no-store');
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }
};
