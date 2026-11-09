// Stands in for @cloudflare/browser-test-runtime when workerFixtures.ts runs on
// upstream Playwright Test (runner/build.mjs aliases it here). `playwright/test`
// stays a bare import that the spec runner maps to the payload built from npm
// `playwright`.
import { env } from 'cloudflare:workers';

// Upstream's full `test`, as upstream's own test config uses, so its fixtures
// the specs do not override run: `_setupArtifacts` among them, which reports
// API calls as steps.
export { test as _baseTest, expect, mergeTests } from 'playwright/test';

// The host passes the run's settings to every worker process as environment.
// Fixtures that need a session (sessionId, browser) are overridden in fixtures.ts.
export function currentTestContext() {
  return {
    env,
    binding: process.env.BROWSER_BINDING ?? 'BROWSER',
    assetsUrl: process.env.ASSETS_URL,
  };
}

// Upstream's `_setupArtifacts` stays.
export function setupArtifactsFixtures() {
  return {};
}
