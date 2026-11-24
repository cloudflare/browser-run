/**
 * @license
 * Copyright 2025 Google Inc.
 * SPDX-License-Identifier: Apache-2.0
 */

import type {Browser} from 'puppeteer-core/lib/api/Browser.js';
import type {ConnectionTransport} from 'puppeteer-core/lib/common/ConnectionTransport.js';
import type {ConnectOptions} from 'puppeteer-core/lib/common/ConnectOptions.js';
import {Puppeteer} from 'puppeteer-core/lib/common/Puppeteer.js';

import type {BrowserWorker} from './BrowserWorker.js';
import {
  assertValidSessionId,
  connectToCDPBrowser,
  type Browsers,
  type Locations,
  type SessionGuardrails,
} from './utils.js';
import {WorkersWebSocketTransport} from './WorkersWebSocketTransport.js';

export type {SessionGuardrails} from './utils.js';

const FAKE_HOST = 'https://fake.host';
// Bindings that acquired a session through the RPC `acquire` method. Only these
// connect through `connectSession`; every other session connects through the
// binding's `fetch`. Do not test for `connectSession` with `typeof`: on a
// Browser Run binding every property is an RPC stub, so it is always a function.
const rpcBindings = new WeakSet<object>();
const sessionPinnedEndpoints = new WeakSet<object>();

function validateKitesurfOptions(options?: WorkersLaunchOptions): void {
  if (options?.browser !== 'kitesurf') {
    return;
  }
  const incompatible: string[] = [];
  if (options.lab) {
    incompatible.push('lab');
  }
  if (options.outboundByHost) {
    incompatible.push('outboundByHost');
  }
  if (incompatible.length) {
    throw new Error(
      `Options not supported with browser="kitesurf": ${incompatible.join(', ')}`
    );
  }
}

/**
 * @public
 */
export type AcquireResponse = BrowserRunAcquireResult;
/**
 * @public
 */
export type ActiveSession = BrowserRunSession;
/**
 * @public
 */
export type ClosedSession = BrowserRunSession;
/**
 * @public
 */
export interface SessionsResponse {
  sessions: ActiveSession[];
}
/**
 * @public
 */
export interface HistoryResponse {
  history: ClosedSession[];
}
/**
 * @public
 */
export type LimitsResponse = BrowserRunLimits;
/**
 * @public
 */
export interface WorkersLaunchOptions {
  keep_alive?: number; // milliseconds to keep browser alive even if it has no activity (from 10_000ms to 600_000ms, default is 60_000)
  location?: Locations;
  recording?: boolean;
  lab?: boolean;
  browser?: Browsers;
  outboundByHost?: BrowserRunAcquireOptions['outboundByHost'];
  // restricts the outbound traffic of the session being acquired, latched for
  // its lifetime. Travels over a browser binding only, so it has no effect when
  // connecting to an endpoint addressed by URL.
  guardrails?: SessionGuardrails;
}
/**
 * @public
 */
export class PuppeteerWorkers extends Puppeteer {
  public constructor() {
    super({isPuppeteerCore: false});
    this.acquire = this.acquire.bind(this);
    this.connect = this.connect.bind(this);
    this.launch = this.launch.bind(this);
    this.sessions = this.sessions.bind(this);
    this.history = this.history.bind(this);
    this.limits = this.limits.bind(this);
  }

  /**
   * Launch a browser session.
   *
   * @param endpoint - Cloudflare worker binding
   * @param options - launch options, including the `guardrails` restricting the
   * outbound traffic of the new session
   * @returns a browser session or throws
   */
  public async launch(
    endpoint: BrowserWorker,
    options?: WorkersLaunchOptions
  ): Promise<Browser> {
    validateKitesurfOptions(options);
    const wantsRpcLaunch = options?.lab || options?.outboundByHost;
    if (
      options?.outboundByHost &&
      (options.browser || typeof endpoint.launch !== 'function')
    ) {
      throw new Error('outboundByHost requires a Browser Run RPC binding');
    }
    if (
      wantsRpcLaunch &&
      !options?.browser &&
      typeof endpoint.launch === 'function'
    ) {
      const response = await endpoint.launch(toBrowserRunOptions(options));
      const webSocket = connectionEndpointOf(response);
      sessionPinnedEndpoints.add(webSocket);
      return await this.connect(webSocket, response.sessionId);
    }
    if (options?.browser) {
      // Sessions for these browsers are acquired by the connect call itself.
      return await this.connect(endpoint, undefined, options);
    }
    const response: AcquireResponse = await this.acquire(endpoint, options);
    return await this.connect(endpoint, response.sessionId);
  }

  /**
   * Returns active sessions
   *
   * @remarks
   * Sessions with a connnectionId already have a worker connection established
   *
   * @param endpoint - Cloudflare worker binding
   * @returns List of active sessions
   */
  public async sessions(endpoint: BrowserWorker): Promise<ActiveSession[]> {
    const res = await endpoint.fetch(`${FAKE_HOST}/v1/sessions`);
    const status = res.status;
    const text = await res.text();
    if (status !== 200) {
      throw new Error(
        `Unable to fetch new sessions: code: ${status}: message: ${text}`
      );
    }
    const data: SessionsResponse = JSON.parse(text);
    return data.sessions;
  }

  /**
   * Returns recent sessions (active and closed)
   *
   * @param endpoint - Cloudflare worker binding
   * @returns List of recent sessions (active and closed)
   */
  public async history(endpoint: BrowserWorker): Promise<ClosedSession[]> {
    const res = await endpoint.fetch(`${FAKE_HOST}/v1/history`);
    const status = res.status;
    const text = await res.text();
    if (status !== 200) {
      throw new Error(
        `Unable to fetch account history: code: ${status}: message: ${text}`
      );
    }
    const data: HistoryResponse = JSON.parse(text);
    return data.history;
  }

  /**
   * Returns current limits
   *
   * @param endpoint - Cloudflare worker binding
   * @returns current limits
   */
  public async limits(endpoint: BrowserWorker): Promise<LimitsResponse> {
    const res = await endpoint.fetch(`${FAKE_HOST}/v1/limits`);
    const status = res.status;
    const text = await res.text();
    if (status !== 200) {
      throw new Error(
        `Unable to fetch account limits: code: ${status}: message: ${text}`
      );
    }
    const data: LimitsResponse = JSON.parse(text);
    return data;
  }

  /**
   * Establish a devtools connection to an existing session
   *
   * @param endpoint - Cloudflare worker binding
   * @param sessionId - sessionId obtained from a .sessions() call
   * @param options - launch options, only used when acquiring and connecting to
   * a browser in a single pass
   * @returns a browser instance
   */
  public override async connect(
    endpoint: BrowserWorker | ConnectOptions,
    sessionId?: string,
    options?: WorkersLaunchOptions
  ): Promise<Browser>;

  /**
   * Establish a devtools connection to an existing session
   *
   * @param browserWorker - BrowserWorker
   * @returns a browser instance
   */
  public override async connect(
    endpoint: BrowserWorker | ConnectOptions,
    sessionId?: string,
    options?: WorkersLaunchOptions
  ): Promise<Browser> {
    validateKitesurfOptions(options);
    if (options?.outboundByHost) {
      const browserWorker = endpoint as BrowserWorker;
      if (
        sessionId ||
        options.browser ||
        typeof browserWorker.launch !== 'function'
      ) {
        throw new Error(
          'outboundByHost must be passed to launch() or acquire() on a Browser Run RPC binding'
        );
      }
      const response = await browserWorker.launch(toBrowserRunOptions(options));
      const webSocket = connectionEndpointOf(response);
      sessionPinnedEndpoints.add(webSocket);
      return await this.connect(webSocket, response.sessionId);
    }
    // Without a sessionId the browser is acquired by this call itself, so
    // there's no session to connect to yet.
    const browser = sessionId ? undefined : options?.browser;
    const connectOptions = endpoint as ConnectOptions;
    if (!sessionId && !browser && connectOptions.protocol === 'webDriverBiDi') {
      throw new Error('Cloudflare Browser Run supports the CDP protocol only');
    }
    if (sessionId) {
      assertValidSessionId(sessionId);
    }
    try {
      if (!sessionId && !browser) {
        return await super.connect(connectOptions);
      }
      let connectionEndpoint = endpoint as BrowserWorker;
      if (
        sessionId &&
        rpcBindings.has(connectionEndpoint) &&
        !sessionPinnedEndpoints.has(connectionEndpoint)
      ) {
        const connection = await connectionEndpoint.connectSession!(sessionId);
        connectionEndpoint = connectionEndpointOf(connection);
        sessionPinnedEndpoints.add(connectionEndpoint);
      }
      const connectionTransport: ConnectionTransport =
        await WorkersWebSocketTransport.create(
          connectionEndpoint,
          sessionId,
          {browser, guardrails: options?.guardrails}
        );
      return await connectToCDPBrowser(connectionTransport, {sessionId});
    } catch (e) {
      if (browser) {
        throw new Error(`Unable to connect to ${browser} session: ${e}`);
      }
      throw new Error(
        `Unable to connect to existing session ${sessionId} (it may still be in use or not ready yet) - retry or launch a new browser: ${e}`
      );
    }
  }

  /**
   * Acquire a new browser session.
   *
   * @param borwserWorker - BrowserWorker
   * @param options - launch options, including the `guardrails` restricting the
   * outbound traffic of the new session
   * @returns a new browser session
   */
  public async acquire(
    endpoint: BrowserWorker,
    options?: WorkersLaunchOptions
  ): Promise<AcquireResponse> {
    validateKitesurfOptions(options);
    const hasRpcAcquire =
      typeof endpoint.acquire === 'function' &&
      typeof endpoint.connectSession === 'function';
    if (options?.outboundByHost && (options.browser || !hasRpcAcquire)) {
      throw new Error('outboundByHost requires a Browser Run RPC binding');
    }
    const wantsRpcAcquire = options?.lab || options?.outboundByHost;
    if (wantsRpcAcquire && hasRpcAcquire) {
      // Call as a method on the binding. On an RPC stub every property access,
      // including Function.prototype members such as `bind`, becomes a remote
      // call.
      const response: BrowserRunAcquireResult = await endpoint.acquire!(
        toBrowserRunOptions(options)
      );
      rpcBindings.add(endpoint);
      return response;
    }
    const searchParams = new URLSearchParams();
    if (options?.keep_alive) {
      searchParams.set('keep_alive', `${options.keep_alive}`);
    }
    if (options?.location) {
      searchParams.set('location', options.location);
    }
    if (options?.recording) {
      searchParams.set('recording', options.recording.toString());
    }
    if (options?.lab) {
      searchParams.set('lab', options.lab.toString());
    }

    const acquireUrl = `${FAKE_HOST}/v1/devtools/browser?${searchParams.toString()}`;
    const res = await endpoint.fetch(acquireUrl, {
      method: 'POST',
      // Guardrails travel in the body here, unlike the websocket upgrades that
      // have to use a header.
      ...(options?.guardrails
        ? {
            headers: {'content-type': 'application/json'},
            body: JSON.stringify({guardrails: options.guardrails}),
          }
        : {}),
    });
    const status = res.status;
    const text = await res.text();
    if (status !== 200) {
      throw new Error(
        `Unable to create new browser: code: ${status}: message: ${text}`
      );
    }
    // Got a 200, so response text is actually an AcquireResponse
    const response: AcquireResponse = JSON.parse(text);
    return response;
  }
}

// The `Fetcher` that a Browser Run RPC connection is pinned to. It is a
// `BrowserWorker` for consumers, but this package builds with the DOM `fetch`
// types, which differ from the Workers ones.
function connectionEndpointOf(connection: BrowserRunConnection): BrowserWorker {
  return connection.webSocket as unknown as BrowserWorker;
}

// `lab` is accepted by Browser Run but is not in the workers-types options type.
type BrowserRunOptions = BrowserRunAcquireOptions & {lab?: boolean};

function toBrowserRunOptions(
  options?: WorkersLaunchOptions
): BrowserRunOptions {
  const {keep_alive, browser: _browser, ...rest} = options ?? {};
  return {
    ...rest,
    ...(keep_alive === undefined ? {} : {keepAlive: keep_alive}),
  };
}
