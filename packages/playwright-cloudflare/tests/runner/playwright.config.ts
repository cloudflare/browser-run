// Upstream Playwright Test's config for runs in the deployed Worker. Paths are
// virtual: runner/build.mjs places the specs under /project/tests and the smoke
// project under /project/smoke.
import { defineConfig } from 'playwright/test';

export default defineConfig({
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
