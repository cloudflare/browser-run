// Worker-side helpers shared by the test Workers. They are plain ES modules
// with no dependencies, so Wrangler bundles them without extra build steps.

// Responds to `GET /` with the test list. `x-worker-version` lets CI wait for
// a new deploy before it generates proxy specs from the list.
export function testListResponse(suites, env) {
  return Response.json(suites, {
    headers: { 'x-worker-version': env.CF_VERSION_METADATA?.id ?? '' },
  });
}

// The browser loads test pages from these hostnames. They have no DNS records:
// Browser Run sends their requests to the test Worker through `outboundByHost`.
// Outbound routing supports plain HTTP on the default port only. The two names
// are different sites, so Chrome puts them in different processes.
export const TEST_SERVER_HOST = 'test-server.test';
export const CROSS_PROCESS_HOST = 'cross-process.test';
export const TEST_SERVER_PREFIX = `http://${TEST_SERVER_HOST}`;
export const CROSS_PROCESS_PREFIX = `http://${CROSS_PROCESS_HOST}`;

// The `outboundByHost` map that routes both test server hostnames to `fetcher`.
export function testServerOutboundByHost(fetcher) {
  return {
    [TEST_SERVER_HOST]: fetcher,
    [CROSS_PROCESS_HOST]: fetcher,
  };
}

// True when the Worker runs under local `wrangler dev`. Outbound routing needs
// a deployed Worker, so local runs keep serving test pages from the request
// origin.
export function isLocalDev(url) {
  const { hostname } = new URL(url);
  return hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]';
}

// `server.PREFIX` for a test request that arrived at `url`.
export function testServerPrefix(url) {
  return isLocalDev(url) ? new URL(url).origin : TEST_SERVER_PREFIX;
}

// `server.CROSS_PROCESS_PREFIX` for a `server.PREFIX`. Local dev has a single
// origin, so it uses the same prefix.
export function crossProcessPrefix(prefix) {
  return prefix === TEST_SERVER_PREFIX ? CROSS_PROCESS_PREFIX : prefix;
}

// True for the acquire request (`POST /v1/devtools/browser`) of the Node test
// runner.
export function isAcquireRequest(request) {
  return request.method === 'POST' && new URL(request.url).pathname === '/v1/devtools/browser';
}

// Acquires a Browser Run session whose test server hostnames route to
// `fetcher`, and responds like the forwarded acquire request: `{ sessionId }`.
// `acquire` is the library function, for example `acquire` from
// `@cloudflare/playwright`.
export async function acquireWithTestServerRoutes(acquire, binding, fetcher) {
  try {
    const { sessionId } = await acquire(binding, { outboundByHost: testServerOutboundByHost(fetcher) });
    return Response.json({ sessionId });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(`Unable to acquire a Browser Run session: ${message}`, { status: 502 });
  }
}

// Forwards a `/v1/*` request from the Node test runner to the Browser Run
// binding. The binding ignores the host, and `binding` only selects it here.
export function forwardToBrowserRun(request, binding) {
  const url = new URL(request.url);
  url.protocol = 'http:';
  url.host = 'fake.host';
  url.searchParams.delete('binding');
  return binding.fetch(new Request(url.toString(), request));
}

// Browser Run no longer serves the session: it is gone (404) or its browser
// is not running (410, for example "state: unhealthy").
const sessionGoneError = /Unable to connect to browser: code: (404|410)\b/;

export function isSessionGoneError(message) {
  return sessionGoneError.test(message ?? '');
}

// A failed test result for a session that the Worker cannot use. Return it
// instead of throwing: a thrown error reaches the proxy as a generic 1101 page
// and hides the Browser Run error. `sessionUnusable` makes the proxy acquire a
// new session for the retry.
export function sessionUnusableResult({ testId, timeout, sessionId, error }) {
  const message = `Unable to use Browser Run session ${sessionId}: ${error instanceof Error ? error.message : String(error)}`;
  return {
    testId,
    status: 'failed',
    expectedStatus: 'passed',
    errors: [{ message }],
    annotations: [{ type: 'session id', description: sessionId }],
    duration: 0,
    hasNonRetriableError: false,
    timeout,
    sessionUnusable: true,
  };
}
