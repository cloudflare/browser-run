// Tests that load their pages from the test assets Worker over HTTPS
// (`TEST_ASSETS_HTTPS_PREFIX`) instead of the `http://*.test` test server
// hostnames. The test assets Worker serves static files only: these tests
// cannot use the test server routes (`setRoute`, `waitForRequest`, `setCSP`).
export const httpsTests: string[] = [
  // TODO: Move these tests back to the test server hostnames when Browser Run
  // outbound Workers support HTTPS. Pages on http://test-server.test are not a
  // secure context, so Chrome does not store Secure cookies or grant
  // geolocation on them.
  'cookies.test.ts > Cookie specs > Page.setCookie > should set a cookie with a partitionKey',
  'cookies.test.ts > Cookie specs > Page.deleteCookie > should only delete cookie from the default partition if partitionkey is not specified',
  'cookies.test.ts > Cookie specs > Page.deleteCookie > should delete cookie with partition key if partition key is specified',
  'page.test.ts > Page > Page.setGeolocation > should work',
];
