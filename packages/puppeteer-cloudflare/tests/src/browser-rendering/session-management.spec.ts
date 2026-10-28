import {
  launch,
  connect,
  sessions,
  history,
  acquire,
  limits,
} from '@cloudflare/puppeteer';
import puppeteer from '@cloudflare/puppeteer';
import type {
  BrowserWorker,
  Browser,
  WorkersLaunchOptions,
  ActiveSession,
} from '@cloudflare/puppeteer';
import {env} from 'cloudflare:workers';
import {expect} from 'expect';

async function launchAndGetSession(
  endpoint: BrowserWorker,
  options?: WorkersLaunchOptions,
): Promise<[Browser, string]> {
  const browser = await launch(endpoint, options);
  const sessionId = browser.sessionId();
  expect(sessionId).toBeDefined();
  return [browser, sessionId];
}

async function fetchSingleSession(endpoint: BrowserWorker, sessionId: string) {
  // A just-acquired session can take a moment to become visible.
  let response = await endpoint.fetch(
    `http://fake.host/v1/devtools/session/${sessionId}`,
  );
  for (let attempt = 0; !response.ok && attempt < 10; attempt++) {
    await new Promise(resolve => {
      return setTimeout(resolve, 500);
    });
    response = await endpoint.fetch(
      `http://fake.host/v1/devtools/session/${sessionId}`,
    );
  }
  expect(response.ok).toBe(true);
  const session = await response.json() as ActiveSession;
  expect(session.sessionId).toBe(sessionId);
  return session;
}

// Browser Run returns at most this many rows in limits().activeSessions.
const LIMITS_ACTIVE_SESSIONS_CAP = 200;

function sessionIds(activeSessions: ActiveSession[]): string[] {
  return activeSessions.map(session => {
    return session.sessionId;
  }).sort();
}

async function waitForSessionToClose(
  endpoint: BrowserWorker,
  sessionId: string,
  timeout = 10000,
): Promise<void> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (!(await sessions(endpoint)).some(session => {
      return session.sessionId === sessionId;
    })) {
      return;
    }
    await new Promise(resolve => {
      return setTimeout(resolve, 250);
    });
  }
}

test(`should list sessions @smoke`, async () => {
  const before = await sessions(env.BROWSER);
  const [browser, sessionId] = await launchAndGetSession(env.BROWSER);

  expect(
    before.map(a => {
      return a.sessionId;
    }),
  ).not.toContain(sessionId);
  // fails if session doesn't exist
  await fetchSingleSession(env.BROWSER, browser.sessionId());

  await browser.close();
});

test(`should launch a lab browser`, async () => {
  const browser = await launch(env.BROWSER, {lab: true});
  expect(browser.sessionId()).toBeTruthy();
  await browser.close();
});

test(`should reject lab combined with browser=kitesurf`, async () => {
  const binding = {
    fetch: async () => {
      return new Response('ok');
    },
  } as BrowserWorker;
  await expect(
    launch(binding, {browser: 'kitesurf', lab: true}),
  ).rejects.toThrow(/browser="kitesurf".*lab/);
});

test(`should reject outbound workers combined with browser=kitesurf`, async () => {
  const binding = {
    fetch: async () => {
      return new Response('ok');
    },
  } as BrowserWorker;
  const outboundWorker = {
    fetch: async () => {
      return new Response('ok');
    },
  } as unknown as Fetcher;
  await expect(
    launch(binding, {
      browser: 'kitesurf',
      outboundByHost: {'app.example.com': outboundWorker},
    }),
  ).rejects.toThrow(/browser="kitesurf".*outboundByHost/);
});

test(`should pass lab and outbound workers to the RPC acquire method`, async () => {
  let received: unknown;
  const outboundWorker = {
    fetch: async () => {
      return new Response('ok');
    },
  } as unknown as Fetcher;
  const rpcBinding = {
    fetch: async () => {
      return new Response('ok');
    },
    connectSession: async () => {
      throw new Error('not called');
    },
    acquire: async (options: unknown) => {
      received = options;
      return {sessionId: 'session'};
    },
  } as BrowserWorker;

  await acquire(rpcBinding, {
    lab: true,
    outboundByHost: {'app.example.com': outboundWorker},
  });
  expect(received).toEqual({
    lab: true,
    outboundByHost: {'app.example.com': outboundWorker},
  });
});

test(`should translate keep_alive for RPC acquire`, async () => {
  let received: unknown;
  const rpcBinding = {
    fetch: async () => {
      return new Response('ok');
    },
    connectSession: async () => {
      throw new Error('not called');
    },
    acquire: async (options: unknown) => {
      received = options;
      return {sessionId: 'session'};
    },
  } as BrowserWorker;

  await acquire(rpcBinding, {lab: true, keep_alive: 30000});
  expect(received).toEqual({lab: true, keepAlive: 30000});
});

test(`should pass translated options to RPC launch and reuse its pinned Fetcher`, async () => {
  let received: unknown;
  let connectSessionCalls = 0;
  const pinnedWebSocket = {
    fetch: async () => {
      return new Response('not a websocket');
    },
    connectSession: async () => {
      connectSessionCalls++;
      throw new Error('pinned Fetcher was probed');
    },
  } as unknown as Fetcher;
  const rpcBinding = {
    fetch: async () => {
      return new Response('ok');
    },
    launch: async (options: unknown) => {
      received = options;
      return {sessionId: 'session', webSocket: pinnedWebSocket};
    },
  } as BrowserWorker;

  await expect(
    launch(rpcBinding, {lab: true, keep_alive: 30000}),
  ).rejects.toThrow();
  expect(received).toEqual({lab: true, keepAlive: 30000});
  expect(connectSessionCalls).toBe(0);
});

test(`should preserve lab for a legacy acquire binding`, async () => {
  let request: Request | undefined;
  const legacyBinding = {
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      request = new Request(input, init);
      return Response.json({sessionId: 'session'});
    },
  } as BrowserWorker;

  await acquire(legacyBinding, {lab: true});
  expect(new URL(request!.url).searchParams.get('lab')).toBe('true');
});

test(`should fall back to fetch when RPC session capabilities are incomplete`, async () => {
  let request: Request | undefined;
  let acquireCalled = false;
  const partialBinding = {
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      request = new Request(input, init);
      return Response.json({sessionId: 'session'});
    },
    acquire: async () => {
      acquireCalled = true;
      return {sessionId: 'rpc-session'};
    },
  } as BrowserWorker;

  await acquire(partialBinding, {lab: true});
  expect(acquireCalled).toBe(false);
  expect(new URL(request!.url).searchParams.get('lab')).toBe('true');
});

test(`should call RPC acquire as a method on the binding`, async () => {
  // RPC stubs turn any property access, including `bind`, `call` and `apply`,
  // into a remote call that Browser Run does not implement.
  const rpcOnly = (name: string) => {
    return () => {
      throw new Error(`${name} must not be used on an RPC stub`);
    };
  };
  let rpcCalls = 0;
  const rpcAcquire = Object.assign(
    async () => {
      rpcCalls++;
      return {sessionId: 'rpc-session'};
    },
    {bind: rpcOnly('bind'), call: rpcOnly('call'), apply: rpcOnly('apply')},
  );
  const rpcBinding = {
    fetch: async () => {
      return Response.json({sessionId: 'fetch-session'});
    },
    connectSession: async () => {
      throw new Error('not called');
    },
    acquire: rpcAcquire,
  } as unknown as BrowserWorker;

  expect(await acquire(rpcBinding)).toEqual({sessionId: 'fetch-session'});
  expect(await acquire(rpcBinding, {lab: true})).toEqual({
    sessionId: 'rpc-session',
  });
  expect(rpcCalls).toBe(1);
});

test(`should connect HTTP-acquired sessions through fetch, not connectSession`, async () => {
  // On a Browser Run binding every property is an RPC stub, so `acquire` and
  // `connectSession` always look callable, even where Browser Run cannot serve
  // them (for example, local development).
  const binding = {
    fetch: (input: RequestInfo | URL, init?: RequestInit) => {
      return env.BROWSER.fetch(input, init);
    },
    acquire: async () => {
      throw new Error('RPC acquire must not be called');
    },
    connectSession: async () => {
      throw new Error('connectSession must not be called');
    },
  } as unknown as BrowserWorker;

  const browser = await launch(binding, {keep_alive: 10000});
  const sessionId = browser.sessionId();
  await browser.disconnect();

  const connectedBrowser = await connect(binding, sessionId);
  expect(connectedBrowser.sessionId()).toBe(sessionId);
  await connectedBrowser.close();
});

test(`should keep session open when closing browser created with connect`, async () => {
  const {sessionId} = await acquire(env.BROWSER, {keep_alive: 10000});

  const connectedBrowser = await connect(env.BROWSER, sessionId);

  // Connecting reuses the acquired session instead of creating a new one.
  // Other tests run in parallel on the same account, so compare only this
  // session rather than the whole active-session list.
  expect(connectedBrowser.sessionId()).toBe(sessionId);
  await fetchSingleSession(env.BROWSER, sessionId);
  await connectedBrowser.close();

  // Closing a connected browser leaves the session open until keep_alive.
  await fetchSingleSession(env.BROWSER, sessionId);

  // keep_alive (10s) plus a margin for Browser Run to reap the session.
  await waitForSessionToClose(env.BROWSER, sessionId, 20000);
  expect(sessionIds(await sessions(env.BROWSER))).not.toContain(sessionId);
});

test(`should close session when launched browser is closed`, async () => {
  const [browser, sessionId] = await launchAndGetSession(env.BROWSER);
  await browser.close();
  await waitForSessionToClose(env.BROWSER, sessionId);
  const afterClose = await sessions(env.BROWSER);
  expect(
    afterClose.map(a => {
      return a.sessionId;
    }),
  ).not.toContain(sessionId);
});

test(`should keep a connected session open past keep_alive`, async () => {
  // keep_alive is an inactivity timeout: it closes sessions without a client,
  // not sessions that still have a connected browser.
  const keepAlive = 15000;
  const [browser, sessionId] = await launchAndGetSession(env.BROWSER, {
    keep_alive: keepAlive,
  });

  try {
    await new Promise(resolve => {
      return setTimeout(resolve, 11000);
    });
    await fetchSingleSession(env.BROWSER, sessionId);
    expect(browser.connected).toBe(true);

    await new Promise(resolve => {
      return setTimeout(resolve, 5000);
    });
    await fetchSingleSession(env.BROWSER, sessionId);
    expect(browser.connected).toBe(true);
  } finally {
    await browser.close().catch(() => {});
  }
});

test(`should add new session to history when launching browser`, async () => {
  const before = await history(env.BROWSER);
  const [launchedBrowser, sessionId] = await launchAndGetSession(env.BROWSER);
  const after = await history(env.BROWSER);

  expect(
    before.map(a => {
      return a.sessionId;
    }),
  ).not.toContain(sessionId);
  expect(
    after.map(a => {
      return a.sessionId;
    }),
  ).toContain(sessionId);

  await launchedBrowser.close();
});

test(`should show sessionId in active sessions under limits endpoint`, async () => {
  const [launchedBrowser, sessionId] = await launchAndGetSession(env.BROWSER);

  try {
    // A new session can take a moment to appear under limits.
    let activeSessionIds: string[] = [];
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      activeSessionIds = (await limits(env.BROWSER)).activeSessions.map(s => {
        return s.id;
      });
      if (activeSessionIds.includes(sessionId)) {
        break;
      }
      await new Promise(resolve => {
        return setTimeout(resolve, 500);
      });
    }
    if (!activeSessionIds.includes(sessionId)) {
      if (activeSessionIds.length >= LIMITS_ACTIVE_SESSIONS_CAP) {
        // The list is full, so the new session can be cut off. Confirm that
        // the session is active through its own endpoint instead.
        await fetchSingleSession(env.BROWSER, sessionId);
        return;
      }
      const {maxConcurrentSessions} = await limits(env.BROWSER);
      throw new Error(
        `Session ${sessionId} missing from ${activeSessionIds.length} active sessions under limits (maxConcurrentSessions: ${maxConcurrentSessions})`,
      );
    }
  } finally {
    await launchedBrowser.close();
  }
});

test(`should have functions in default exported object`, () => {
  expect(puppeteer.launch).toBe(launch);
  expect(puppeteer.connect).toBe(connect);
  expect(puppeteer.sessions).toBe(sessions);
  expect(puppeteer.history).toBe(history);
  expect(puppeteer.acquire).toBe(acquire);
  expect(puppeteer.limits).toBe(limits);
});
