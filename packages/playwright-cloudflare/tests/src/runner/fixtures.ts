// What specs get for `@playwright/test`, `pageTest`, `browserTest` and
// `workerFixtures` under upstream Playwright Test (runner/build.mjs redirects
// those imports here): workerFixtures.ts, with the browser session runner/run.mjs
// lends each worker process and the skip lists applied.
import path from 'path';

import { isSessionGoneError } from '@cloudflare/browser-test-runtime/worker-routes';
import { chromium, connect, launch } from '@cloudflare/playwright';

import { test as base } from '../server/workerFixtures';
import { skipErrorMessages, skipTests } from '../skipTests';

export * from '../server/workerFixtures';

const skippedTitles = new Set(skipTests);

// Whether a test of this worker process failed. Playwright starts a new worker
// process after a failure, for the retry among others.
let testFailed = false;

export const test = base.extend<{ _skipLists: void }, { _lentSessionId: string }>({
  // The client's Playwright, as upstream's own fixture gives, rather than the
  // package's default export: upstream's _setupArtifacts lists its contexts.
  playwright: [async ({}, run) => {
    await run((chromium as any)._playwright);
  }, { scope: 'worker' }],

  // runner/run.mjs owns one session per parallel worker slot. A worker
  // process lives only as long as its isolate (one test group), so it connects
  // to its slot's session and disconnects at teardown, leaving the browser for
  // the next worker process in that slot.
  _lentSessionId: [async ({}, run, workerInfo) => {
    const sessionId = process.env.BROWSER_SESSION_IDS?.split(',')[workerInfo.parallelIndex];
    if (!sessionId)
      throw new Error(`no browser session for parallel index ${workerInfo.parallelIndex}; runner/run.mjs lends them in BROWSER_SESSION_IDS`);
    await run(sessionId);
  }, { scope: 'worker' }],

  // If Browser Run no longer serves the lent session, this worker process
  // launches a browser of its own and closes it at teardown.
  //
  // After a failure the lent browser is ended rather than left for the next
  // worker process: a browser placed far from the Worker fails timing-sensitive
  // specs every time, retries included. runner/run.mjs then lends the slot a
  // new session, placed anew; isolates that start before it does launch their own.
  browser: [async ({ binding, _lentSessionId: sessionId }, run) => {
    let lent = true;
    const browser = await connect(binding, sessionId).catch(async error => {
      if (!isSessionGoneError(error.message))
        throw error;
      console.warn(`browser session ${sessionId} is gone; launching a browser for this worker process`);
      lent = false;
      return await launch(binding);
    });
    await run(browser);
    if (lent && testFailed) {
      console.warn(`a test failed; ending browser session ${sessionId} for the runner to replace`);
      const cdp = await browser.newBrowserCDPSession();
      await cdp.send('Browser.close').catch(() => {});
    }
    await browser.close();
  }, { scope: 'worker' }],

  // The session of the browser in use, lent or launched, for logs and annotations.
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
      return;
    }
    testFailed = true;
  }, { auto: true }],
});

export const playwrightTest = test;
export const browserTest = test;
export const contextTest = test;
