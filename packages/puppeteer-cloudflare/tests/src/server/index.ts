// Must run before Playwright reads PWTEST_UNDER_TEST during module initialization.
import './underTest.js';

import {testSuites} from '@cloudflare/browser-test-runtime';
import {
  acquireWithTestServerRoutes,
  forwardToBrowserRun,
  isAcquireRequest,
  isLocalDev,
  testListResponse,
} from '@cloudflare/browser-test-runtime/worker-routes';
import {acquire} from '@cloudflare/puppeteer';

import type {TestsServer} from './testsServer.js';
import {
  getBinding,
  TEST_SERVER_FALLBACK_HEADER,
  TEST_SERVER_ROUTE_HEADER,
  TEST_SERVER_ROUTE_PREFIX,
} from './utils.js';

export {TestsServer} from './testsServer';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // The browser loads test pages from the test server hostnames, and Browser
    // Run routes them back to this Worker.
    if (isAcquireRequest(request) && !isLocalDev(url)) {
      return await acquireWithTestServerRoutes(
        acquire,
        getBinding(url),
        env.SELF,
      );
    }
    if (url.pathname.startsWith('/v1')) {
      return await forwardToBrowserRun(request, getBinding(url));
    }
    if (url.pathname === '/') {
      return testListResponse(await testSuites(), env);
    }

    const bindingName = url.searchParams.get('binding') ?? 'BROWSER';

    if (url.pathname.startsWith(TEST_SERVER_ROUTE_PREFIX)) {
      const route = url.pathname
        .slice(TEST_SERVER_ROUTE_PREFIX.length)
        .match(/^([^/]+)\/(?:http|https)(?:\/|$)/);
      if (!route) {
        return new Response('Invalid test server route', {status: 400});
      }
      const id = env.TESTS_SERVER.idFromString(decodeURIComponent(route[1]!));
      const testsServer = env.TESTS_SERVER.get(
        id,
      ) as DurableObjectStub<TestsServer>;
      return await testsServer.fetch(request);
    }

    if (/\.(spec|test)\.ts$/.test(url.pathname)) {
      const sessionId = url.searchParams.get('sessionId');
      if (!sessionId) {
        return new Response('sessionId is required', {status: 400});
      }
      const id = env.TESTS_SERVER.idFromName(`${bindingName}_${sessionId}`);
      const testsServer = env.TESTS_SERVER.get(
        id,
      ) as DurableObjectStub<TestsServer>;
      return await testsServer.fetch(request);
    }

    const testServerRoute = request.headers.get(TEST_SERVER_ROUTE_HEADER);
    if (testServerRoute) {
      const id = env.TESTS_SERVER.idFromString(testServerRoute);
      const testsServer = env.TESTS_SERVER.get(
        id,
      ) as DurableObjectStub<TestsServer>;
      const targetUrl = new URL(request.url);
      targetUrl.pathname = `${TEST_SERVER_ROUTE_PREFIX}${encodeURIComponent(testServerRoute)}/http${url.pathname}`;
      const response = await testsServer.fetch(new Request(targetUrl, request));
      if (!response.headers.has(TEST_SERVER_FALLBACK_HEADER)) {
        return response;
      }
    }

    if (url.pathname === '/index.html') {
      // let's use empty.html for index.html
      request = new Request(request.url.replace(/\/index\.html$/, '/empty'));
    } else if (url.pathname.endsWith('.html')) {
      // assets serve html files without .html extension
      request = new Request(
        request.url.substring(0, request.url.length - '.html'.length),
      );
    }

    return (
      (await env.ASSETS?.fetch(request)) ??
      new Response('Not found', {status: 404})
    );
  },
};
