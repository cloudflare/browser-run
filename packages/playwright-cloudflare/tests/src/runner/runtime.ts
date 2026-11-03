// Stands in for @cloudflare/browser-test-runtime when workerFixtures.ts runs on
// upstream Playwright Test (runner/build.mjs aliases it here). `playwright/test`
// stays a bare import that the spec runner maps to the payload built from npm
// `playwright`.
import { env } from 'cloudflare:workers';

export { _baseTest, expect, mergeTests } from 'playwright/test';

// Before @cloudflare/playwright evaluates, as underTest.ts does for the old Worker.
process.env.PWTEST_UNDER_TEST = 'true';

// The host passes the run's settings to every worker process as environment.
// Fixtures that need a session (sessionId, browser) are overridden in fixtures.ts.
export function currentTestContext() {
  return {
    env,
    binding: process.env.BROWSER_BINDING ?? 'BROWSER',
    assetsUrl: process.env.ASSETS_URL,
  };
}

// Upstream records API calls as steps through its own fixtures, which these
// tests do not use, so there is no listener to install.
export async function runWithExpectApiListener<T>(_instrumentation: unknown, use: () => Promise<T>): Promise<T> {
  return await use();
}
