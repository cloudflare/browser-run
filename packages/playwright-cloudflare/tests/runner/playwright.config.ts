// Upstream Playwright Test's config, for its runner in Node and its worker
// processes in the runner Worker's isolates. runner/build.mjs bundles it for
// both, with the specs under tests/ and the smoke project under smoke/ of
// /project in the isolates and of runner/dist/node/project in Node.
import { defineConfig } from 'playwright/test';

// Upstream's own template, so the specs find their *-chromium snapshots;
// build.mjs collects the snapshots with the same one.
import snapshots from './snapshots.json';

export default defineConfig({
  snapshotPathTemplate: snapshots.snapshotPathTemplate,
  // Specs write under their output paths with the isolate's own fs, which can
  // only write in /tmp.
  outputDir: '/tmp/test-results',
  // An isolate's /tmp counts against its memory for its whole life, and
  // attachments reach the runner with their bytes, so nothing reads a test's
  // output there after it ends: upstream removes it after each test.
  preserveOutput: 'never',
  // The specs are already bundled, and the isolates load them as they are.
  // Upstream's transform in Node would print them again, changing titles
  // made from a function's source and so the test IDs.
  build: { external: ['**/*'] },
  // As upstream's own config (tests/library/playwright.config.ts), which
  // specs assert in call logs.
  expect: { timeout: 10000 },
  workers: 6,
  retries: 1,
  timeout: 60 * 1000,
  reporter: 'list',
  projects: [
    { name: 'suite', testDir: './tests' },
    // One pass, one known-error skip and one deliberate failure, to check the
    // runner itself end to end; CI runs --project=suite.
    { name: 'smoke', testDir: './smoke', retries: 0 },
  ],
});
