import { test, expect } from '../../src/server/workerFixtures';

test('renders a page from the test server', async ({ page, server }) => {
  await page.goto(server.EMPTY_PAGE);
  await page.setContent('<title>smoke</title>');
  await expect(page).toHaveTitle('smoke');
});

test('turns a known error message into a skip', async () => {
  throw new Error('Cloudflare Workers does not support this');
});

test('fails on purpose', async ({ page }) => {
  await page.setContent('<p>hello</p>');
  await expect(page.locator('p')).toHaveText('goodbye', { timeout: 1000 });
});
