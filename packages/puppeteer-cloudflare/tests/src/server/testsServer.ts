import {TestRunner} from '@cloudflare/browser-test-runtime';
import {
  sessionUnusableResult,
  testServerPrefix,
} from '@cloudflare/browser-test-runtime/worker-routes';
import '@workerTests/index';
import type { Browser, Page } from '@cloudflare/puppeteer';
import puppeteer from '@cloudflare/puppeteer';
import {DurableObject} from 'cloudflare:workers';

import {skipTests} from '../skipTests.js';

import {
  setTestState,
  TestServer,
  type TestServerController,
  type TestServerRequest,
  type TestServerResponse,
  type TestServerRoute,
} from './mocha-utils.js';
import {
  getBinding,
  isSkippedError,
  TEST_SERVER_FALLBACK_HEADER,
  TEST_SERVER_ROUTE_HEADER,
  TEST_SERVER_ROUTE_PREFIX,
} from './utils.js';

export interface TestRequestPayload {
  testId: string;
  fullTitle: string;
  timeout: number;
}

const log = console.log.bind(console);

const skipTestsFullTitles = new Set(skipTests);

// The zone serving the test Worker sets its Bot Management cookie on every
// response. Upstream cookie specs expect only the cookies they create.
const ZONE_BOT_MANAGEMENT_COOKIE = '__cf_bm';
const zoneCookieFilterInstalled = Symbol('zoneCookieFilterInstalled');

// Patch the shared Page prototype so pages in contexts that a spec creates
// itself (browser.createBrowserContext()) are covered too.
function ignoreZoneBotManagementCookie(page: Page): void {
  const prototype = Object.getPrototypeOf(page) as Page & {
    [zoneCookieFilterInstalled]?: true;
  };
  if (prototype[zoneCookieFilterInstalled]) {
    return;
  }
  const cookies = prototype.cookies;
  prototype.cookies = async function (this: Page, ...urls: string[]) {
    return (await cookies.apply(this, urls)).filter(cookie => {
      return cookie.name !== ZONE_BOT_MANAGEMENT_COOKIE;
    });
  };
  prototype[zoneCookieFilterInstalled] = true;
}

function parseTrace(trace: string) {
  return Object.fromEntries(trace.split('\n').filter(line => {return line;}).map(line => {
    const [key, value] = line.split('=');
    return [key, value];
  })) as { loc: string, colo: string };
}

interface CdnTrace {
  loc: string;
  colo: string;
}

interface RequestWaiter {
  resolve(request: TestServerRequest): void;
  reject(error: Error): void;
}

interface ServerState {
  csp: Map<string, string>;
  openResponses: Set<WorkerServerResponse>;
  routes: Map<string, TestServerRoute>;
  waiters: Map<string, RequestWaiter[]>;
}

function normalizePath(path: string): string {
  return new URL(path, 'https://test.invalid').pathname;
}

function toBodyChunk(data: unknown): Uint8Array {
  if (data instanceof Uint8Array) {
    return data;
  }
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }
  return new TextEncoder().encode(String(data));
}

// Aborts responses that are still open when a test ends. The browser may still
// be loading a subresource, so answer it instead of throwing out of the Worker.
class TestServerResetError extends Error {
  constructor() {
    super('Test server was reset');
  }
}

class WorkerServerResponse implements TestServerResponse {
  statusCode = 200;

  readonly #headers = new Headers();
  readonly #response: Promise<Response>;
  readonly #remove: () => void;
  #controller?: ReadableStreamDefaultController<Uint8Array>;
  #ended = false;
  #reject!: (error: Error) => void;
  #resolve!: (response: Response) => void;
  #started = false;
  #statusText = '';

  constructor(remove: () => void) {
    this.#remove = remove;
    this.#response = new Promise<Response>((resolve, reject) => {
      this.#resolve = resolve;
      this.#reject = reject;
    });
  }

  setHeader(name: string, value: string | string[]): void {
    this.#assertWritableHeaders();
    this.#headers.delete(name);
    for (const item of Array.isArray(value) ? value : [value]) {
      this.#headers.append(name, item);
    }
  }

  writeHead(
    statusCode: number,
    statusMessageOrHeaders?: string | Record<string, string | string[]>,
    headers?: Record<string, string | string[]>,
  ): void {
    this.statusCode = statusCode;
    if (typeof statusMessageOrHeaders === 'string') {
      this.#statusText = statusMessageOrHeaders;
    } else if (statusMessageOrHeaders) {
      headers = statusMessageOrHeaders;
    }
    for (const [name, value] of Object.entries(headers ?? {})) {
      this.setHeader(name, value);
    }
    this.#start();
  }

  write(data: unknown, callback?: () => void): boolean {
    this.#start();
    this.#controller!.enqueue(toBodyChunk(data));
    callback?.();
    return true;
  }

  end(data?: unknown, callback?: () => void): void {
    if (this.#ended) {
      callback?.();
      return;
    }
    this.#ended = true;
    if (!this.#started && (data === undefined || this.statusCode === 204)) {
      this.#started = true;
      this.#resolve(
        new Response(null, {
          status: this.statusCode,
          statusText: this.#statusText,
          headers: this.#headers,
        }),
      );
    } else {
      this.#start();
      if (data !== undefined) {
        this.#controller!.enqueue(toBodyChunk(data));
      }
      this.#controller!.close();
    }
    this.#remove();
    callback?.();
  }

  abort(error: Error): void {
    if (this.#ended) {
      return;
    }
    this.#ended = true;
    if (this.#started) {
      this.#controller!.error(error);
    } else {
      this.#reject(error);
    }
    this.#remove();
  }

  response(): Promise<Response> {
    return this.#response;
  }

  #assertWritableHeaders(): void {
    if (this.#started) {
      throw new Error('Headers were already sent');
    }
  }

  #start(): void {
    if (this.#started) {
      return;
    }
    this.#started = true;
    const stream = new ReadableStream<Uint8Array>({
      start: controller => {
        this.#controller = controller;
      },
    });
    this.#resolve(
      new Response(stream, {
        status: this.statusCode,
        statusText: this.#statusText,
        headers: this.#headers,
      }),
    );
  }
}

// Consecutive tests reuse one Browser Run session. Browser Run can reject a new
// connection until it has released the previous test's connection.
async function connectWhenSessionIsFree(
  binding: Parameters<typeof puppeteer.connect>[0],
  sessionId: string,
  // Stays within the proxy's 60s test timeout on top of the 45s test run.
  timeout = 10000,
): Promise<Browser> {
  const deadline = Date.now() + timeout;
  for (let attempt = 1; ; attempt++) {
    try {
      return await puppeteer.connect(binding, sessionId);
    } catch (error) {
      // Only a busy session (409) or an error without an HTTP status can
      // recover. A missing or dead browser (for example 410) will not.
      const status = /code: (\d{3})/.exec(String(error))?.[1];
      if (Date.now() >= deadline || (status && status !== '409')) {
        throw error;
      }
      log(`Session ${sessionId} not free yet (attempt ${attempt}): ${error}`);
      await new Promise(resolve => {
        return setTimeout(resolve, 500 * Math.min(attempt, 4));
      });
    }
  }
}

// Report a session that the Worker cannot use as a failed test with the real
// Browser Run error; the proxy then acquires a new session for the retry.
function sessionUnusableResponse(
  testId: string,
  timeout: number,
  sessionId: string,
  error: unknown,
): Response {
  const result = sessionUnusableResult({testId, timeout, sessionId, error});
  log(`❌ ${result.errors[0]?.message}`);
  return Response.json(result);
}

export class TestsServer extends DurableObject<Env> {
  private cdnTraces!: {
    worker: CdnTrace;
    browser: CdnTrace;
  };
  readonly #servers = new Map<string, ServerState>();

  readonly #testServerController: TestServerController = {
    reset: server => {
      this.#resetServer(server);
    },
    setCSP: (server, path, value) => {
      this.#server(server).csp.set(normalizePath(path), value);
    },
    setRoute: (server, path, handler) => {
      this.#server(server).routes.set(normalizePath(path), handler);
    },
    waitForRequest: (server, path) => {
      return new Promise<TestServerRequest>((resolve, reject) => {
        const state = this.#server(server);
        const normalizedPath = normalizePath(path);
        const waiters = state.waiters.get(normalizedPath) ?? [];
        waiters.push({resolve, reject});
        state.waiters.set(normalizedPath, waiters);
      });
    },
  };

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith(TEST_SERVER_ROUTE_PREFIX)) {
      return await this.#handleTestServerRequest(request, url);
    }
    const file = url.pathname;
    const sessionId = url.searchParams.get('sessionId');
    if (!sessionId) {
      return new Response('sessionId is required', {status: 400});
    }
    const timeout =
      parseInt(url.searchParams.get('timeout') ?? '10', 10) * 1000;
    const {testId, fullTitle} = (await request.json()) as TestRequestPayload;
    const assetsUrl = testServerPrefix(url);
    const routeId = this.ctx.id.toString();
    const {env} = this;
    const retry = parseInt(url.searchParams.get('retry') ?? '0', 10);
    const binding = url.searchParams.get('binding') ?? 'BROWSER';
    const testRunner = new TestRunner(
      {env, sessionId, assetsUrl, retry, binding},
      {timeout},
    );
    if (skipTestsFullTitles.has(fullTitle)) {
      log(`🚫 Skipping ${fullTitle}`);
      return Response.json({
        testId,
        status: 'skipped',
        errors: [
          {
            type: 'skip',
            description: `Test skipped because it is in the skipTests list`,
          }
        ],
        annotations: [],
        duration: 0,
        hasNonRetriableError: false,
        timeout,
        expectedStatus: 'skipped',
      });
    }

    log(`🧪 Running ${fullTitle}`);

    // TODO __dirname is used to access local files, mabe we can polyfill that too?
    (globalThis as any).__dirname = '';

    const browserBinding = getBinding(url);
    let browser: Browser;
    let worker: CdnTrace;
    let container: CdnTrace;
    let browserVersion: string;
    try {
      browser = await connectWhenSessionIsFree(browserBinding, sessionId);
    } catch (error) {
      return sessionUnusableResponse(testId, timeout, sessionId, error);
    }
    try {
      ({worker, browser: container} = await this.getCdnTraces(browser, sessionId));
      browserVersion = await browser.version();
    } catch (error) {
      await browser.disconnect().catch(() => {});
      return sessionUnusableResponse(testId, timeout, sessionId, error);
    }
    try {
      const context = await browser.createBrowserContext();
      const newPage = context.newPage.bind(context);
      context.newPage = async () => {
        const newTestPage = await newPage();
        const setExtraHTTPHeaders =
          newTestPage.setExtraHTTPHeaders.bind(newTestPage);
        newTestPage.setExtraHTTPHeaders = async headers => {
          await setExtraHTTPHeaders({
            ...headers,
            [TEST_SERVER_ROUTE_HEADER]: routeId,
          });
        };
        await newTestPage.setExtraHTTPHeaders({
          [TEST_SERVER_ROUTE_HEADER]: routeId,
        });
        ignoreZoneBotManagementCookie(newTestPage);
        return newTestPage;
      };
      const page = await context.newPage();
      this.#resetServer('http');
      setTestState({
        browser,
        context,
        defaultBrowserOptions: {protocol: 'cdp'},
        page,
        puppeteer,
        server: new TestServer(
          assetsUrl,
          'http',
          this.#testServerController,
        ),
        httpsServer: new TestServer(
          assetsUrl,
          'http',
          this.#testServerController,
        ),
        isFirefox: false,
        isChrome: true,
        isHeadless: true,
      });

      const result = await testRunner.runTest(file, testId);

      if (
        result.status === 'failed' &&
        result.errors.length > 0 &&
        result.errors.every(isSkippedError)
      ) {
        const description = result.errors.find(isSkippedError)?.message;
        result.status = 'skipped';
        result.expectedStatus = 'skipped';
        result.errors = [];
        result.annotations.push({
          type: 'skip',
          description,
        });
      }

      result.annotations.push({
        type: 'browser version',
        description: browserVersion,
      }, {
        type: 'session id',
        description: sessionId,
      }, {
        type: 'worker colo',
        description: worker.colo,
      }, {
        type: 'browser colo',
        description: container.colo,
      });
      
      if (!['passed', 'skipped'].includes(result.status)) {
        log(
          `❌ ${fullTitle} failed with status ${result.status}${result.errors.length ? `: ${result.errors[0].message}` : ''}`,
        );
      }
      return Response.json(result);
    } finally {
      setTestState(undefined);
      this.#resetServer('http');
      this.#resetServer('https');
      await browser.disconnect();
    }
  }

  async #handleTestServerRequest(request: Request, url: URL): Promise<Response> {
    const route = url.pathname
      .slice(TEST_SERVER_ROUTE_PREFIX.length)
      .match(/^[^/]+\/(http|https)(\/.*)?$/);
    if (!route) {
      return new Response('Invalid test server route', {status: 400});
    }

    const server = route[1]!;
    const path = route[2] || '/';
    const state = this.#server(server);
    const waiters = state.waiters.get(path);
    const hasWaiter = (waiters?.length ?? 0) > 0;
    const handler = state.routes.get(path);
    const csp = state.csp.get(path);
    if (!handler && !hasWaiter && !csp && !path.startsWith('/cached/')) {
      return new Response(null, {
        status: 204,
        headers: {[TEST_SERVER_FALLBACK_HEADER]: '1'},
      });
    }

    const contentLength = Number(request.headers.get('content-length') ?? '0');
    if (contentLength > 1024 * 1024) {
      return new Response('Test server request body is too large', {status: 413});
    }
    const assetRequest = request.clone();
    let body = '';
    if ((handler || hasWaiter) && request.body) {
      const chunks: Uint8Array[] = [];
      const reader = request.body.getReader();
      let totalLength = 0;
      while (true) {
        const {done, value} = await reader.read();
        if (done) {
          break;
        }
        totalLength += value.byteLength;
        if (totalLength > 1024 * 1024) {
          await reader.cancel();
          return new Response('Test server request body is too large', {
            status: 413,
          });
        }
        chunks.push(value);
      }
      const bytes = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      body = new TextDecoder().decode(bytes);
    }
    const waiter = waiters?.shift();
    let response!: WorkerServerResponse;
    const testRequest: TestServerRequest = {
      headers: Object.fromEntries(request.headers),
      method: request.method,
      postBody: Promise.resolve(body),
      socket: {
        destroy: () => {
          response.abort(new Error('Test server socket destroyed'));
        },
        getProtocol: () => {
          return 'TLSv1.3';
        },
      },
    };

    waiter?.resolve(testRequest);
    if (waiters?.length === 0) {
      state.waiters.delete(path);
    }

    if (handler) {
      response = new WorkerServerResponse(() => {
        state.openResponses.delete(response);
      });
      state.openResponses.add(response);
      try {
        await handler(testRequest, response);
      } catch (error) {
        response.abort(
          error instanceof Error ? error : new Error(String(error)),
        );
      }
      try {
        return await response.response();
      } catch (error) {
        if (error instanceof TestServerResetError) {
          return new Response(error.message, {status: 503});
        }
        throw error;
      }
    }

    if (path.startsWith('/cached/') && request.headers.has('if-modified-since')) {
      return new Response(null, {status: 304});
    }

    const assetUrl = new URL(url.origin);
    assetUrl.pathname = path === '/index.html' ? '/empty' : path;
    if (assetUrl.pathname.endsWith('.html')) {
      assetUrl.pathname = assetUrl.pathname.slice(0, -'.html'.length);
    }
    const assetResponse =
      (await this.env.ASSETS?.fetch(new Request(assetUrl, {
        method: assetRequest.method,
        headers: assetRequest.headers,
        body: assetRequest.method === 'GET' || assetRequest.method === 'HEAD' ? undefined : assetRequest.body,
        redirect: assetRequest.redirect,
      }))) ??
      new Response('Not found', {status: 404});
    const headers = new Headers(assetResponse.headers);
    if (path.startsWith('/cached/')) {
      headers.set('Cache-Control', 'public, max-age=31536000');
      headers.set('Last-Modified', new Date(0).toUTCString());
    } else {
      headers.set('Cache-Control', 'no-cache, no-store');
    }
    if (csp) {
      headers.set('Content-Security-Policy', csp);
    }
    return new Response(assetResponse.body, {
      status: assetResponse.status,
      statusText: assetResponse.statusText,
      headers,
    });
  }

  #server(server: string): ServerState {
    let state = this.#servers.get(server);
    if (!state) {
      state = {
        csp: new Map(),
        openResponses: new Set(),
        routes: new Map(),
        waiters: new Map(),
      };
      this.#servers.set(server, state);
    }
    return state;
  }

  #resetServer(server: string): void {
    const state = this.#server(server);
    const error = new TestServerResetError();
    for (const response of state.openResponses) {
      response.abort(error);
    }
    for (const waiters of state.waiters.values()) {
      for (const waiter of waiters) {
        waiter.reject(error);
      }
    }
    state.csp.clear();
    state.openResponses.clear();
    state.routes.clear();
    state.waiters.clear();
  }

  private async getCdnTraces(browser: Browser, sessionId: string) {
    if (!this.cdnTraces) {
      try {
        const worker = parseTrace(await fetch('https://1.1.1.1/cdn-cgi/trace').then(resp => {
          return resp.text();
        }));
        const context = await browser.createBrowserContext();
        const page = await context.newPage();
        const browserCdnTrace = parseTrace(await page.goto('https://1.1.1.1/cdn-cgi/trace').then(resp => {
          return resp!.text();
        }));
        await page.close();
        await context.close();
    
        // eslint-disable-next-line no-console
        console.log(`ℹ️ Session ID: ${sessionId}, Worker: ${worker.colo}, Browser: ${browserCdnTrace.colo}`);
    
        this.cdnTraces = { worker, browser: browserCdnTrace };
      } catch {
        // CDN trace not available locally, use fallback
        this.cdnTraces = {
          worker: { loc: 'local', colo: 'local' },
          browser: { loc: 'local', colo: 'local' },
        };
      }
    }

    return this.cdnTraces;
  }
}
