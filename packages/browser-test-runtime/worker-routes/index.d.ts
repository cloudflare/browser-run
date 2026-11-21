export interface VersionMetadataEnv {
  CF_VERSION_METADATA?: { id: string };
}

/** Responds to `GET /` with the test list and the `x-worker-version` header. */
export declare function testListResponse(suites: unknown, env: VersionMetadataEnv): Response;

/** Hostname of the test server. Browser Run routes it to the test Worker. */
export declare const TEST_SERVER_HOST: 'test-server.test';
/** Hostname of the cross-process test server, a different site than `TEST_SERVER_HOST`. */
export declare const CROSS_PROCESS_HOST: 'cross-process.test';
/** `server.PREFIX` of the tests on a deployed test Worker. */
export declare const TEST_SERVER_PREFIX: 'http://test-server.test';
/** `server.CROSS_PROCESS_PREFIX` of the tests on a deployed test Worker. */
export declare const CROSS_PROCESS_PREFIX: 'http://cross-process.test';

/** The `outboundByHost` map that routes both test server hostnames to `fetcher`. */
export declare function testServerOutboundByHost<T>(fetcher: T): Record<string, T>;

/** True when the Worker runs under local `wrangler dev`. */
export declare function isLocalDev(url: string | URL): boolean;

/** `server.PREFIX` for a test request. Local dev uses the request origin. */
export declare function testServerPrefix(url: string | URL): string;

/** `server.CROSS_PROCESS_PREFIX` for a `server.PREFIX`. Local dev uses the same prefix. */
export declare function crossProcessPrefix(prefix: string): string;

/** True for `POST /v1/devtools/browser`. */
export declare function isAcquireRequest(request: Request): boolean;

/**
 * Acquires a session whose test server hostnames route to `fetcher` and
 * responds with `{ sessionId }`, or with status 502 and the error message.
 */
export declare function acquireWithTestServerRoutes<Binding, Outbound>(
  acquire: (binding: Binding, options: { outboundByHost: Record<string, Outbound> }) => Promise<{ sessionId: string }>,
  binding: Binding,
  fetcher: Outbound,
): Promise<Response>;

/** Forwards a `/v1/*` request to the Browser Run binding. */
export declare function forwardToBrowserRun(
  request: Request,
  binding: { fetch(request: Request): Promise<Response> },
): Promise<Response>;

/** True for connect errors that mean Browser Run no longer serves the session. */
export declare function isSessionGoneError(message: string | undefined): boolean;

export interface SessionUnusableResult {
  testId: string;
  status: 'failed';
  expectedStatus: 'passed';
  errors: { message: string }[];
  annotations: { type: string; description?: string }[];
  duration: number;
  hasNonRetriableError: boolean;
  timeout: number;
  sessionUnusable: true;
}

/** A failed test result that tells the proxy to acquire a new session. */
export declare function sessionUnusableResult(options: {
  testId: string;
  timeout: number;
  sessionId: string;
  error: unknown;
}): SessionUnusableResult;
