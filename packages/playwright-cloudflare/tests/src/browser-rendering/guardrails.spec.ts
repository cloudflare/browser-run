import { launch, acquire, sessions } from '@cloudflare/playwright';

import { test, expect } from '../server/workerFixtures';

// These tests load `server.EMPTY_PAGE` from the test assets Worker over HTTPS
// (see `httpsTests.ts`). The control host of the test Worker is in the same zone.
const GUARDRAILS_BLOCKED_URL = 'https://playwright-test-workers.rendering.cfdata.org/';

test(`should allow navigation to an allowed domain and block everything else @smoke`, async ({ binding, server }) => {
  const browser = await launch(binding, { guardrails: { allowedDomains: [server.HOSTNAME] } });
  try {
    const page = await browser.newPage();

    const allowed = await page.goto(server.EMPTY_PAGE);
    expect(allowed!.status()).toBe(200);

    // Same zone, different hostname: the exact pattern above does not match it.
    const blocked = await page.goto(GUARDRAILS_BLOCKED_URL);
    expect(blocked!.status()).toBe(403);
    expect(blocked!.headers()['cf-mitigated']).toBe('guardrails');
  } finally {
    await browser.close();
  }
});

test(`should match subdomains with a wildcard pattern`, async ({ binding, server }) => {
  const [, parentDomain] = server.HOSTNAME.match(/^[^.]+\.(.+)$/)!;
  const browser = await launch(binding, { guardrails: { allowedDomains: [`*.${parentDomain}`] } });
  try {
    const page = await browser.newPage();
    const response = await page.goto(server.EMPTY_PAGE);
    expect(response!.status()).toBe(200);
  } finally {
    await browser.close();
  }
});

test(`should deny all outbound traffic with an empty allowlist`, async ({ binding, server }) => {
  const browser = await launch(binding, { guardrails: { allowedDomains: [] } });
  try {
    const page = await browser.newPage();

    const blocked = await page.goto(server.EMPTY_PAGE);
    expect(blocked!.status()).toBe(403);
    expect(blocked!.headers()['cf-mitigated']).toBe('guardrails');

    // Denying every outbound request still leaves a usable page, which is the point
    // of an empty allowlist.
    await page.setContent(`<div>hello</div>`);
    expect(await page.textContent('div')).toBe('hello');
  } finally {
    await browser.close();
  }
});

test(`should acquire a session with guardrails`, async ({ binding }) => {
  const { sessionId } = await acquire(binding, { guardrails: { allowedDomains: ['*.example.com'] } });
  expect(sessionId).toBeTruthy();
  expect((await sessions(binding)).map(s => s.sessionId)).toContain(sessionId);
});

test(`should reject an invalid policy at acquire time`, async ({ binding }) => {
  // Wildcard-only would match any hostname, so it is not a valid pattern.
  await expect(acquire(binding, { guardrails: { allowedDomains: ['*'] } })).rejects.toThrow(/code: 400/);
});

test(`should reject guardrails combined with browser=kitesurf`, async ({ binding }) => {
  // kitesurf enforces its own allowlist under a different header, so core refuses the
  // combination rather than hand back a session that quietly has no policy. The policy is
  // still sent: core owns the rule, so it stays enforced if this client is out of date.
  await expect(launch(binding, { browser: 'kitesurf', guardrails: { allowedDomains: ['*.example.com'] } }))
      .rejects.toThrow(/code: 400.*browser=kitesurf/);
});

test(`should reject lab combined with browser=kitesurf`, async ({ binding }) => {
  await expect(launch(binding, { browser: 'kitesurf', lab: true }))
      .rejects.toThrow(/browser="kitesurf".*lab/);
});

test(`should reject outbound workers combined with browser=kitesurf`, async ({ binding }) => {
  await expect(launch(binding, {
    browser: 'kitesurf',
    outboundByHost: { 'app.example.com': {} as never },
  }))
      .rejects.toThrow(/browser="kitesurf".*outboundByHost/);
});
