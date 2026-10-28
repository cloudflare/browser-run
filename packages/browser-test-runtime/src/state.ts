import {Suite} from 'playwright/lib/common/test';

export const rootSuites: Suite[] = [];

export const playwrightTestConfig = {
  projects: [
    {
      timeout: 5000,
      name: 'chromium',
      outputDir: '/tmp/test-results',
      testDir: '/bundle',
    },
  ],
  // same as submodules/playwright/tests/library/playwright.config.ts
  expect: {timeout: 10000},
};

export const configLocation = {
  resolvedConfigFile: '/bundle/playwright.config.ts',
  configDir: '/bundle',
};
