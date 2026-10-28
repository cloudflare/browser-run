import fs from 'fs';

import {
  _baseTest,
  currentTestContext,
  expect as baseExpect,
  mergeTests,
  runWithExpectApiListener,
} from '@cloudflare/browser-test-runtime';
import playwright, { connect } from '@cloudflare/playwright';
import { env } from 'cloudflare:workers';

import type { BrowserBindingName } from '../utils';
import type { TestInfo, ScreenshotMode, VideoMode } from '../../../types/test';
import type { BrowserContextOptions, Browser, BrowserType, BrowserContext, Page, Frame, PageScreenshotOptions, Locator, ViewportSize, Playwright, APIRequestContext, BrowserWorker } from '@cloudflare/playwright/test';

export {mergeTests};
export const selectors = playwright.selectors;

export type BoundingBox = NonNullable<Awaited<ReturnType<Locator['boundingBox']>>>;

type CdnTrace = { loc: string; colo: string; };

// The zone serving the test Worker sets its Bot Management cookie on every
// response. Upstream cookie specs expect only the cookies they create.
const ZONE_BOT_MANAGEMENT_COOKIE = '__cf_bm';

function ignoreZoneBotManagementCookie(context: BrowserContext) {
  const cookies = context.cookies.bind(context);
  context.cookies = async urls => (await cookies(urls)).filter(cookie => cookie.name !== ZONE_BOT_MANAGEMENT_COOKIE);
}

export type WorkersWorkerFixtures = {
  env: Env;
  sessionId: string;
  bindingName: BrowserBindingName;
  binding: BrowserWorker;
  cdnTraces: {
    worker?: CdnTrace;
    browser?: CdnTrace;
  };
};

export type PlatformWorkerFixtures = {
  platform: 'win32' | 'darwin' | 'linux';
  isWindows: boolean;
  isMac: boolean;
  isLinux: boolean;
  macVersion: number;
};

export const platformTest = _baseTest.extend<{}, PlatformWorkerFixtures>({
  platform: ['linux', { scope: 'worker' }],
  isWindows: [({ platform }, run) => run(platform === 'win32'), { scope: 'worker' }],
  isMac: [({ platform }, run) => run(platform === 'darwin'), { scope: 'worker' }],
  isLinux: [({ platform }, run) => run(platform === 'linux'), { scope: 'worker' }],
  macVersion: [0, { scope: 'worker' }],
});

export interface PlaywrightWorkerArgs {
  toImplInWorkerScope: (rpcObject?: any) => any;
  playwright: Playwright;
  browser: Browser;
}

export type PageTestFixtures = {
  contextOptions: BrowserContextOptions
  context: BrowserContext;
  page: Page;
  request: APIRequestContext;
};

class TestServer {
  private _testInfo: TestInfo;
  readonly PREFIX: string;
  readonly CROSS_PROCESS_PREFIX: string;
  readonly EMPTY_PAGE: string;
  readonly HELLO_WORLD: string;
  readonly HOSTNAME: string;

  constructor(testInfo: TestInfo, assetsUrl: string) {
    this._testInfo = testInfo;
    this.PREFIX = assetsUrl;
    this.CROSS_PROCESS_PREFIX = this.PREFIX.replace(/\:\/\/([^.]+)\./, '://$1-cross-origin.');
    this.EMPTY_PAGE = `${this.PREFIX}/empty.html`;
    this.HELLO_WORLD = `${this.PREFIX}/hello-world`;
    this.HOSTNAME = new URL(this.PREFIX).hostname;
  }

  get PORT() {
    return Number(new URL(this.PREFIX).port);
  }

  onceWebSocketConnection() {
    this._testInfo.skip(true, 'onceWebSocketConnection not supported, skipping');
  }

  setAuth() {
    this._testInfo.skip(true, 'setAuth not supported, skipping');
  }

  setRoute() {
    this._testInfo.skip(true, 'setRoute not supported, skipping');
  }

  setContent() {
    this._testInfo.skip(true, 'setContent not supported, skipping');
  }

  waitForRequest() {
    this._testInfo.skip(true, 'waitForRequest not supported, skipping');
  }

  waitForUpgrade() {
    this._testInfo.skip(true, 'waitForUpgrade not supported, skipping');
  }

  waitForWebSocket() {
    this._testInfo.skip(true, 'waitForWebSocket not supported, skipping');
  }

  waitForWebSocketConnectionRequest() {
    this._testInfo.skip(true, 'waitForWebSocketConnectionRequest not supported, skipping');
  }

  enableGzip() {
    this._testInfo.skip(true, 'enableGzip not supported, skipping');
  }

  setRedirect() {
    this._testInfo.skip(true, 'setRedirect not supported, skipping');
  }

  setCSP() {
    this._testInfo.skip(true, 'setCSP not supported, skipping');
  }

  sendOnWebSocketConnection() {
    this._testInfo.skip(true, 'sendOnWebSocketConnection not supported, skipping');
  }

  setExtraHeaders() {
    this._testInfo.skip(true, 'setExtraHeaders not supported, skipping');
  }
}

export type ServerFixtures = {
  server: TestServer;
  httpsServer: TestServer;
  proxyServer: never;
  asset: (p: string) => string;
  loopback?: never;
  socksPort: number;
};

export type PageWorkerFixtures = {
  headless: boolean;
  channel: string;
  screenshot: ScreenshotMode | { mode: ScreenshotMode } & Pick<PageScreenshotOptions, 'fullPage' | 'omitBackground'>;
  // we can't use trace fixture because plawyright triggers trace start/stop automatically if that fixture is available
  // and for some reason it causes a timeout, so we implement a simplified version of trace fixture here
  // See: https://github.com/microsoft/playwright/blob/v1.51.1/packages/playwright/src/worker/workerMain.ts#L342
  traceMode: 'off' | 'on' | 'retain-on-failure' | 'on-first-retry' | 'retain-on-first-failure' | 'on-all-retries';
  // the official trace fixture must be set to off
  trace: 'off';
  video: VideoMode | { mode: VideoMode, size: ViewportSize };
  browserName: 'chromium';
  browserVersion: string;
  browserMajorVersion: number;
  isAndroid: boolean;
  isElectron: boolean;
  isWebView2: boolean;
  electronMajorVersion: number;
};

export type BrowserTestWorkerFixtures = PageWorkerFixtures & {
  browserVersion: string;
  defaultSameSiteCookieValue: string;
  allowsThirdParty: boolean;
  browserMajorVersion: number;
  browserType: BrowserType;
  isAndroid: boolean;
  isElectron: boolean;
  isHeadlessShell: boolean;
  isFrozenWebkit: boolean;
  nodeVersion: { major: number, minor: number, patch: number };
  isBidi: boolean;
};

type BrowserTestTestFixtures = {
  hasTouch: boolean;
  _combinedContextOptions: BrowserContextOptions;
  _setupArtifacts: void;
  contextFactory: (options?: BrowserContextOptions) => Promise<BrowserContext>;
  launchPersistent: () => never;
  startRemoteServer: () => never;
  createUserDataDir: () => Promise<string>;

  _annotations: void;
};

export type TestModeName = 'default' | 'driver' | 'service' | 'service2';

export type TestModeWorkerOptions = {
  mode: TestModeName;
};

export type TestModeTestFixtures = {
  toImpl: (rpcObject?: any) => any;
};

function parseTrace(trace: string) {
  const { loc, colo } = Object.fromEntries(trace.split('\n').filter(line => line).map(line => {
    const [key, value] = line.split('=');
    return [key, value];
  })) as { loc?: string, colo?: string };
  return loc && colo ? { loc, colo } : undefined;
}

export const test = platformTest.extend<PageTestFixtures & ServerFixtures & TestModeTestFixtures & BrowserTestTestFixtures, WorkersWorkerFixtures & PlaywrightWorkerArgs & BrowserTestWorkerFixtures & PageWorkerFixtures & TestModeWorkerOptions>({
  headless: [true, { scope: 'worker' }],
  channel: ['stable', { scope: 'worker' }],
  screenshot: ['off', { scope: 'worker' }],
  traceMode: ['on-first-retry', { scope: 'worker' }],
  trace: ['off', { scope: 'worker' }],
  video: ['off', { scope: 'worker' }],
  browserName: ['chromium', { scope: 'worker' }],

  hasTouch: [false, { option: true }],
  _combinedContextOptions: async ({ hasTouch }, run) => {
    await run({
      hasTouch,
    });
  },

  env: [env, { scope: 'worker' }],

  sessionId: [async ({}, run) => {
    await run(currentTestContext().sessionId);
  }, { scope: 'worker' }],

  bindingName: [async ({}, run) => {
    await run(currentTestContext().binding);
  }, { scope: 'worker' }],

  binding: [async ({ env, bindingName }, run) => {
    await run(env[bindingName]);
  }, { scope: 'worker' }],

  cdnTraces: [async ({ sessionId, browser }, run, workerInfo) => {
    const worker = parseTrace(await fetch('https://1.1.1.1/cdn-cgi/trace').then(resp => resp.text()).catch(() => ''));
    const context = await browser.newContext();
    const page = await context.newPage();
    const browserCdnTrace = parseTrace(await page.goto('https://1.1.1.1/cdn-cgi/trace').then(resp => resp!.text()).catch(() => ''));
    await page.close();
    await context.close();

    // eslint-disable-next-line no-console
    console.log(`ℹ️ Session ID: ${sessionId}, Worker: ${worker ? worker.colo : 'N/A'}, Browser: ${browserCdnTrace ? browserCdnTrace.colo : 'N/A'}`);

    await run({ worker, browser: browserCdnTrace });
  }, { scope: 'worker' }],

  browserVersion: [async ({ browser }, run) => {
    await run(browser.version());
  }, { scope: 'worker' }],

  defaultSameSiteCookieValue: ['Lax', { scope: 'worker' }],

  allowsThirdParty: [false, { scope: 'worker' }],

  browserMajorVersion: [async ({ browserVersion }, run) => {
    await run(Number(browserVersion.split('.')[0]));
  }, { scope: 'worker' }],

  isAndroid: [false, { scope: 'worker' }],
  isElectron: [false, { scope: 'worker' }],
  isWebView2: [false, { scope: 'worker' }],
  electronMajorVersion: [0, { scope: 'worker' }],
  isHeadlessShell: [false, { scope: 'worker' }],
  isFrozenWebkit: [false, { scope: 'worker' }],
  nodeVersion: [{ major: 20, minor: 0, patch: 0 }, { scope: 'worker' }],
  isBidi: [false, { scope: 'worker' }],

  browserType: [async ({ playwright, browserName, }, run) => {
    await run(playwright[browserName]);
  }, { scope: 'worker' }],

  playwright: [async ({}, run) => run(playwright), { scope: 'worker' }],

  browser: [async ({ binding, sessionId }, run) => {
    const browser = await connect(binding, sessionId);
    await run(browser);
    await browser.close();
  }, { scope: 'worker' }],

  contextOptions: async ({ _combinedContextOptions }, run) => {
    await run(_combinedContextOptions);
  },

  context: async ({ contextFactory, _combinedContextOptions, traceMode }, run, testInfo) => {
    const context = await contextFactory(_combinedContextOptions);
    const traceStarted = traceMode === 'on' ||
      (traceMode === 'retain-on-failure' && testInfo.retry === 0) ||
      (traceMode === 'on-first-retry' && testInfo.retry === 1) ||
      (traceMode === 'on-all-retries' && testInfo.retry > 0);
    if (traceStarted)
      await context.tracing.start({ screenshots: true, snapshots: true });

    await run(context);

    const failed = testInfo.status !== testInfo.expectedStatus;
    let keepTrace = false;
    if (traceStarted) {
      switch (traceMode) {
        case 'on':
          keepTrace = true;
          break;
        case 'on-first-retry':
          keepTrace = testInfo.retry === 1;
          break;
        case 'on-all-retries':
          keepTrace = testInfo.retry > 0;
          break;
        case 'retain-on-failure':
          keepTrace = failed;
          break;
      }
    }

    if (testInfo.status !== 'skipped' && keepTrace) {
      const tracePath = testInfo.outputPath('trace.zip');
      await context.tracing.stop({ path: tracePath });
      testInfo.attachments.push({ name: 'trace', path: tracePath, contentType: 'application/zip' });
    } else if (traceStarted) {
      // stop and discard trace
      await context.tracing.stop();
    }
  },

  page: async ({ context }, run) => {
    const page = await context.newPage();
    await run(page);
    await page.close();
  },

  request: async ({}, run, testInfo) => {
    testInfo.skip(true, 'request not supported, skipping');
  },

  server: async ({}, run, testInfo) => {
    const assetsUrl = currentTestContext().assetsUrl;
    await run(new TestServer(testInfo, assetsUrl));
  },

  httpsServer: async ({ server }, run, testInfo) => {
    await run(server);
  },

  proxyServer: async ({}, run, testInfo) => {
    testInfo.skip(true, 'proxyServer not supported, skipping');
  },

  asset: async ({}, run) => {
    await run((p: string) => `/bundle/assets/${p}`);
  },

  mode: ['service', { scope: 'worker', option: true }],

  toImpl: async ({}, use) => {
    await use(obj => obj._connection.toImpl(obj));
  },

  loopback: async ({}, run, testInfo) => {
    testInfo.skip(true, 'assets not supported, skipping');
  },

  socksPort: async ({}, run, testInfo) => {
    testInfo.skip(true, 'socksPort not supported, skipping');
  },

  contextFactory: async ({ browser, asset }, run) => {
    const contexts: BrowserContext[] = [];
    await run(async options => {
      const context = await browser.newContext(options);
      ignoreZoneBotManagementCookie(context);
      contexts.push(context);
      return context;
    });
    for (const context of contexts)
      await context.close();
  },

  launchPersistent: async ({}, run, testInfo) => {
    testInfo.skip(true, 'launchPersistent not supported, skipping');
  },

  startRemoteServer: async ({}, run, testInfo) => {
    testInfo.skip(true, 'startRemoteServer not supported, skipping');
  },

  createUserDataDir: async ({ mode }, run) => {
    const dirs: string[] = [];
    await run(async () => {
      const dir = await fs.promises.mkdtemp('/tmp/playwright-test-');
      dirs.push(dir);
      return dir;
    });
    await Promise.all(dirs.map((dir: string) =>
      fs.promises.rm(dir, { recursive: true, force: true }).catch(e => e)
    ));
  },

  _setupArtifacts: [async ({}, use) => {
    try {
      await runWithExpectApiListener(playwright._instrumentation, use);
    } finally {
      playwright.selectors.setTestIdAttribute('data-testid');
    }
  }, { auto: 'all-hooks-included', timeout: 0 } as any],

  toImplInWorkerScope: [async ({ playwright }, use) => {
    await use((playwright as any)._connection.toImpl);
  }, { scope: 'worker' }],

  _annotations: [async ({ sessionId, cdnTraces, browserVersion }, use, testInfo) => {
    testInfo.annotations.push({
      type: 'browser version',
      description: browserVersion,
    }, {
      type: 'session id',
      description: sessionId,
    }, {
      type: 'worker colo',
      description: cdnTraces.worker?.colo ?? 'N/A',
    }, {
      type: 'browser colo',
      description: cdnTraces.browser?.colo ?? 'N/A',
    });
    await use();
  }, { auto: true }],
});

export async function rafraf(target: Page | Frame, count = 1) {
  for (let i = 0; i < count; i++) {
    await target.evaluate(async () => {
      // @ts-ignore
      await new Promise(f => window.builtins.requestAnimationFrame(() => window.builtins.requestAnimationFrame(f)));
    });
  }
}

export function roundBox(box: BoundingBox): BoundingBox {
  return {
    x: Math.round(box.x),
    y: Math.round(box.y),
    width: Math.round(box.width),
    height: Math.round(box.height),
  };
}

export function unshift(snapshot: string): string {
  const lines = snapshot.split('\n');
  let whitespacePrefixLength = 100;
  for (const line of lines) {
    if (!line.trim())
      continue;
    const match = line.match(/^(\s*)/);
    if (match && match[1].length < whitespacePrefixLength)
      whitespacePrefixLength = match[1].length;
  }
  return lines.filter(t => t.trim()).map(line => line.substring(whitespacePrefixLength)).join('\n');
}

export const expect = baseExpect.extend({
  toContainYaml(received: string, expected: string) {
    const trimmed = expected.split('\n').filter(a => !!a.trim());
    const maxPrefixLength = Math.min(...trimmed.map(line => line.match(/^\s*/)![0].length));
    const trimmedExpected = trimmed.map(line => line.substring(maxPrefixLength)).join('\n');
    try {
      if (this.isNot)
        expect(received).not.toContain(trimmedExpected);
      else
        expect(received).toContain(trimmedExpected);
      return {
        pass: !this.isNot,
        message: () => '',
      };
    } catch (e: any) {
      return {
        pass: this.isNot,
        message: () => e.message,
      };
    }
  }
});

export const devices = [];
export const playwrightTest = test;
export const browserTest = test;
export const contextTest = test;
