// What specs get for `@playwright/test`, `pageTest`, `browserTest` and
// `workerFixtures` under upstream Playwright Test (runner/build.mjs redirects
// those imports here): workerFixtures.ts, with a browser launched per worker
// process and the skip lists applied.
import path from 'path';

import { launch } from '@cloudflare/playwright';

import { test as base } from '../server/workerFixtures';
import { skipErrorMessages, skipTests } from '../skipTests';

export * from '../server/workerFixtures';

const skippedTitles = new Set(skipTests);

export const test = base.extend<{ _skipLists: void }>({
  browser: [async ({ binding }, run) => {
    const browser = await launch(binding);
    await run(browser);
    await browser.close();
  }, { scope: 'worker' }],

  sessionId: [async ({ browser }, run) => {
    await run(browser.sessionId());
  }, { scope: 'worker' }],

  // Skips by full title, and turns a failure with a known error message into a
  // skip, as TestsServer does for the old Worker.
  _skipLists: [async ({}, use, testInfo) => {
    const file = path.relative(testInfo.project.testDir, testInfo.file);
    testInfo.skip(skippedTitles.has([file, ...testInfo.titlePath.slice(1)].join(' > ')), 'Test skipped because it is in the skipTests list');
    await use();
    if (testInfo.status === testInfo.expectedStatus)
      return;
    const errorText = testInfo.errors.map(error => `${error.message ?? ''}\n${error.stack ?? ''}`).join('\n');
    if (skipErrorMessages.some(message => typeof message === 'string' ? errorText.includes(message) : message.test(errorText))) {
      testInfo.annotations.push({ type: 'skip', description: 'Test skipped because it failed with a known error message' });
      testInfo.expectedStatus = 'skipped';
      testInfo.status = 'skipped';
    }
  }, { auto: true }],
});

export const playwrightTest = test;
export const browserTest = test;
export const contextTest = test;
