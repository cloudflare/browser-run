import {crossProcessPrefix} from '@cloudflare/browser-test-runtime/worker-routes';
import puppeteer from '@cloudflare/puppeteer';
import type {Browser, BrowserContext, Cookie, Page} from '@cloudflare/puppeteer';
import expect from 'expect';

import {Skipped} from './utils.js';

export interface TestServerRequest {
  headers: Record<string, string>;
  method: string;
  postBody: Promise<string>;
  socket: {
    destroy(): void;
    getProtocol(): string;
  };
}

export interface TestServerResponse {
  statusCode: number;
  setHeader(name: string, value: string | string[]): void;
  writeHead(
    statusCode: number,
    statusMessageOrHeaders?: string | Record<string, string | string[]>,
    headers?: Record<string, string | string[]>,
  ): void;
  write(data: unknown, callback?: () => void): boolean;
  end(data?: unknown, callback?: () => void): void;
}

export type TestServerRoute = (
  request: TestServerRequest,
  response: TestServerResponse,
) => unknown;

export interface TestServerController {
  reset(server: string): void;
  setCSP(server: string, path: string, value: string): void;
  setRoute(server: string, path: string, handler: TestServerRoute): void;
  waitForRequest(server: string, path: string): Promise<TestServerRequest>;
}

export class TestServer {
  PREFIX: string;
  CROSS_PROCESS_PREFIX: string;
  EMPTY_PAGE: string;

  readonly #controller: TestServerController;
  readonly #server: string;

  constructor(
    assetsUrl: string,
    server: string,
    controller: TestServerController,
  ) {
    this.#controller = controller;
    this.#server = server;
    this.PREFIX = assetsUrl;
    this.CROSS_PROCESS_PREFIX = crossProcessPrefix(this.PREFIX);
    this.EMPTY_PAGE = `${assetsUrl}/empty.html`;
  }

  get PORT(): never {
    throw new Skipped('TestServer.port is not supported in this environment');
  }

  enableHTTPCache(): never {
    throw new Skipped('TestServer.enableHTTPCache is not supported in this environment');
  }

  setAuth(): never {
    throw new Skipped('TestServer.setAuth is not supported in this environment');
  }

  enableGzip(): never {
    throw new Skipped('TestServer.enableGzip is not supported in this environment');
  }

  setCSP(path: string, value: string): void {
    this.#controller.setCSP(this.#server, path, value);
  }

  async stop(): Promise<never> {
    throw new Skipped('TestServer.stop is not supported in this environment');
  }

  setRoute(path: string, handler: TestServerRoute): void {
    this.#controller.setRoute(this.#server, path, handler);
  }

  setRedirect(path: string, location: string): void {
    this.setRoute(path, (_request, response) => {
      response.writeHead(302, {location});
      response.end();
    });
  }

  waitForRequest(path: string): Promise<TestServerRequest> {
    return this.#controller.waitForRequest(this.#server, path);
  }

  reset(): void {
    this.#controller.reset(this.#server);
  }

  serveFile(): never {
    throw new Skipped('TestServer.serveFile is not supported in this environment');
  }
}

interface TestState {
  browser: Browser;
  context: BrowserContext;
  defaultBrowserOptions: {protocol: 'cdp'};
  page: Page;
  puppeteer: typeof puppeteer;
  server: TestServer;
  httpsServer: TestServer;
  isFirefox: false;
  isChrome: true;
  isHeadless: true;
}

export function setTestState(testState: TestState | undefined): void {
  (globalThis as any)._testState = testState;
}

export function getTestState(): TestState {
  if (!(globalThis as any)._testState) {
    throw new Error('Test state is not set');
  }
  return (globalThis as any)._testState;
}

export function setupTestBrowserHooks(): void {
  // do nothing
}

export function setupSeparateTestBrowserHooks(
  launchOptions: Record<string, unknown> = {},
): TestState {
  return new Proxy({} as TestState, {
    get(_target, property: keyof TestState) {
      if (Object.keys(launchOptions).length > 0) {
        throw new Skipped(
          'custom browser launch options are not supported in this environment',
        );
      }
      return getTestState()[property];
    },
  });
}

export const isHeadless = true;

declare module 'expect' {
  interface Matchers<R> {
    atLeastOneToContain(expected: string[]): R;
  }
}

expect.extend({
  atLeastOneToContain: (actual: string, expected: string[]) => {
    const pass = expected.some(value => {
      return actual.includes(value);
    });
    return {
      pass,
      message: () => {
        return `"${actual}" didn't contain any of the strings ${JSON.stringify(expected)}`;
      },
    };
  },
});

export interface PuppeteerTestState {
  context: BrowserContext;
  page: Page;
  server: TestServer;
  httpsServer: TestServer;
}

export const mochaHooks: Record<string, unknown> = {};

export const createTimeout = <T>(
  n: number,
  value?: T
): Promise<T | undefined> => {
  return new Promise(resolve => {
    return setTimeout(() => { return resolve(value); }, n);
  });
};

export function launch(): never {
  throw new Skipped('Skipped because launch is not supported in this environment');
}

export const expectCookieEquals = async (
  cookies: Cookie[],
  expectedCookies: Array<Partial<Cookie>>
): Promise<void> => {
  expect(cookies).toHaveLength(expectedCookies.length);
  for (let i = 0; i < cookies.length; i++) {
    expect(cookies[i]).toMatchObject(expectedCookies[i]!);
  }
};

export const shortWaitForArrayToHaveAtLeastNElements = async (
  data: unknown[],
  minLength: number,
  attempts = 3,
  timeout = 50
): Promise<void> => {
  for (let i = 0; i < attempts; i++) {
    if (data.length >= minLength) {
      break;
    }
    await new Promise(resolve => {
      return setTimeout(resolve, timeout);
    });
  }
};
