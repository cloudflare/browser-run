// Tests that load their pages from the test assets Worker over HTTPS
// (`TEST_ASSETS_HTTPS_PREFIX`) instead of the `http://*.test` test server
// hostnames. Their `server.CROSS_PROCESS_PREFIX` is the same origin.
export const httpsTests: string[] = [
  // TODO: Move these tests back to the test server hostnames when Browser Run
  // outbound Workers support HTTPS. Pages on http://test-server.test are not a
  // secure context, so Chrome does not expose service workers, geolocation, the
  // clipboard, CacheStorage, OPFS, cookieStore, local fonts or device
  // orientation events on them.
  'library/browsercontext-clearcookies.spec.ts > should not transiently delete non-matching cookies when filtering',
  'library/browsercontext-service-worker-policy.spec.ts > should allow service workers by default',
  'library/capabilities.spec.ts > should not crash on showDirectoryPicker',
  'library/capabilities.spec.ts > should not crash on storage.getDirectory()',
  'library/capabilities.spec.ts > navigator.clipboard should be present',
  'library/geolocation.spec.ts > should work @smoke',
  'library/geolocation.spec.ts > should isolate contexts',
  'library/geolocation.spec.ts > should use context options',
  'library/geolocation.spec.ts > watchPosition should be notified',
  'library/permissions.spec.ts > permissions > should grant geolocation permission when origin is listed',
  'library/permissions.spec.ts > permissions > should grant notifications permission when listed',
  'library/permissions.spec.ts > should support clipboard read',
  'library/permissions.spec.ts > should be able to use the local-fonts API',
  'page/interception.spec.ts > should intercept after a service worker',
  'page/page-cache-storage.spec.ts > CacheStorage entry should survive page.reload()',
  'page/page-dispatchevent.spec.ts > should dispatch device orientation event',
  'page/page-dispatchevent.spec.ts > should dispatch absolute device orientation event',
  'page/page-dispatchevent.spec.ts > should dispatch device motion event',
  'page/page-event-request.spec.ts > should report requests and responses handled by service worker',
  'page/page-event-request.spec.ts > should report requests and responses handled by service worker with routing',
  'page/page-event-request.spec.ts > should report navigation requests and responses handled by service worker',
  'page/page-event-request.spec.ts > should report navigation requests and responses handled by service worker with routing',
  'page/page-network-response.spec.ts > should report if request was fromServiceWorker',
  // Guardrails check public hostnames only. These sessions have no outbound
  // routes, so they cannot load the test server hostnames.
  'browser-rendering/guardrails.spec.ts > should allow navigation to an allowed domain and block everything else @smoke',
  'browser-rendering/guardrails.spec.ts > should match subdomains with a wildcard pattern',
  'browser-rendering/guardrails.spec.ts > should deny all outbound traffic with an empty allowlist',
];
