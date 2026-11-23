import { TEST_SERVER_PREFIX } from '@cloudflare/browser-test-runtime/worker-routes';

import { test, expect } from '../server/workerFixtures';

test(`should send Worker requests for the test server to the Worker`, async ({ server }) => {
  test.skip(server.PREFIX !== TEST_SERVER_PREFIX, 'local dev serves the test server from the request origin');
  const response = await fetch(server.HELLO_WORLD);
  expect(response.status).toBe(200);
  expect(await response.text()).toContain('Hello world');
});
