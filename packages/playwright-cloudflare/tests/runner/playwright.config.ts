// Upstream Playwright Test's config for runs in the deployed Worker. Paths are
// virtual: runner/build.mjs places the specs under /project/tests and the smoke
// project under /project/smoke.
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
    // One pass and one deliberate failure, to check a run end to end.
    { name: 'smoke', testDir: './smoke', retries: 0 },
  ],
});
