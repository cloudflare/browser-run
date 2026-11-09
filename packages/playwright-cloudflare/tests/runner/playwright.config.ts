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
