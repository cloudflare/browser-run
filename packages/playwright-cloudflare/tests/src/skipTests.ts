export const skipTests: string[] = [
  'library/browsercontext-add-cookies.spec.ts > should set cookie with reasonable defaults',
  'library/browsercontext-basic.spec.ts > should make a copy of default viewport',
  'library/browsercontext-cookies-third-party.spec.ts > should(not) block third party cookies - ephemeral context',
  'library/browsercontext-cookies.spec.ts > should get a non-session cookie',
  'library/browsercontext-events.spec.ts > console event should work in immediately closed popup',
  'library/browsercontext-events.spec.ts > console event should work in popup 2',
  'library/browsercontext-events.spec.ts > dialog event should work in immediately closed popup',
  'library/browsercontext-events.spec.ts > dialog event should work in popup 2',
  'library/browsercontext-events.spec.ts > dialog event should work in popup',
  'library/browsercontext-har.spec.ts > should goBack to redirected navigation',
  // Remote Browser Rendering sessions do not preserve redirected history entries reliably.
  'library/browsercontext-har.spec.ts > should goForward to redirected navigation',
  'library/browsercontext-locale.spec.ts > should affect navigator.language in popups',
  'library/browsercontext-service-worker-policy.spec.ts > block > blocks service worker registration',
  'library/browsercontext-storage-state.spec.ts > should handle missing file',
  'library/browsercontext-storage-state.spec.ts > should round-trip through the file',
  'library/browsercontext-strict.spec.ts > strict context mode > should fail page.click in strict mode',
  'library/browsercontext-strict.spec.ts > strict context mode > should fail page.textContent in strict mode',
  'library/browsercontext-viewport-mobile.spec.ts > mobile viewport > should emulate the hover media feature',
  'library/browsercontext-viewport-mobile.spec.ts > mobile viewport > view scale should reset after navigation',
  'library/browsercontext-viewport.spec.ts > should set window.screen.orientation.type for mobile devices',
  'library/capabilities.spec.ts > should not auto play audio',
  'library/capabilities.spec.ts > should not crash on feature detection for PublicKeyCredential',
  // These load the assets with a file:// URL, which the remote browser cannot open. Upstream
  // v1.58 skipped them in service mode, v1.62 does not.
  'library/capabilities.spec.ts > should play video @smoke',
  'library/capabilities.spec.ts > should play webm video @smoke',
  'library/download.spec.ts > should be able to download a inline PDF file via response interception',
  'library/download.spec.ts > should be able to download a PDF file',
  'library/har.spec.ts > should attach content',
  'library/har.spec.ts > should have version and creator',
  'library/har.spec.ts > should include API request',
  'library/har.spec.ts > should include content @smoke',
  'library/har.spec.ts > should include cookies',
  'library/har.spec.ts > should include sizes',
  'library/har.spec.ts > should report the correct response body size when the bodySize is 0',
  'library/ignorehttpserrors.spec.ts > should isolate contexts',
  'library/ignorehttpserrors.spec.ts > should isolated contexts that share network process',
  // The test source locations are not available in the bundled Worker tests.
  'library/debugger.spec.ts > should pause at next and resume',
  'library/debugger.spec.ts > should run to location',
  // Also fails on main (v1.58) in the full suite against the deployed test Worker.
  'library/geolocation.spec.ts > should use context options for popup',
  'library/page-event-crash.spec.ts > should emit crash event when page crashes',
  'library/page-event-crash.spec.ts > should be able to close context when page crashes',
  'library/page-event-crash.spec.ts > should cancel waitForEvent when page crashes',
  'library/page-event-crash.spec.ts > should throw on any action after page crashes',
  // The injected clock follows real time until install(). If the round trips to
  // Browser Run before install() take more than 100 ms, performance.now() is
  // ahead by that time.
  'library/page-clock.spec.ts > stubTimers > replaces global performance.now',
  'library/page-clock.spec.ts > stubTimers > replaces global performance.timeOrigin',
  'library/permissions.spec.ts > permissions > should isolate permissions between browser contexts',
  'library/permissions.spec.ts > local network request is allowed from public origin',
  'library/permissions.spec.ts > permissions > should be prompt by default',
  'library/permissions.spec.ts > permissions > should prompt for geolocation permission when origin is not listed',
  'library/permissions.spec.ts > permissions > should reset permissions',
  'library/permissions.spec.ts > permissions > should trigger permission onchange',
  'library/popup.spec.ts > BrowserContext.addInitScript should apply to an in-process popup',
  'library/popup.spec.ts > should expose function from browser context',
  'library/popup.spec.ts > should inherit touch support from browser context',
  'library/popup.spec.ts > should inherit viewport size from browser context',
  'library/popup.spec.ts > should not dispatch binding on a closed page',
  'library/popup.spec.ts > should respect routes from browser context when using window.open',
  'library/route-web-socket.spec.ts > no-match > should pass through the required protocol',
  'library/route-web-socket.spec.ts > pass-through > should pass through the required protocol',
  'library/route-web-socket.spec.ts > no-mock > should pass through the required protocol',
  'library/screenshot.spec.ts > element screenshot > should restore default viewport after fullPage screenshot',
  // Concurrent screenshots exceed the remote session's single-operation capacity.
  'library/screenshot.spec.ts > page screenshot > should run in parallel in multiple pages',
  // Screenshot completion is nondeterministic after remote focus emulation.
  'library/emulation-focus.spec.ts > should not affect screenshots',
  'library/shared-worker.spec.ts > should survive shared worker restart',
  'library/tracing.spec.ts > should include context API requests',
  // Reads the local artifacts folder. Upstream v1.58 skipped it in service mode, v1.62 does not.
  'library/tracing.spec.ts > should not flush console events',
  'page/elementhandle-screenshot.spec.ts > element screenshot > should capture full element when larger than viewport',
  'page/expect-boolean.spec.ts > toBeChecked > fail missing',
  'page/expect-boolean.spec.ts > toBeChecked > fail with checked:false',
  'page/expect-boolean.spec.ts > toBeChecked > fail with indeterminate: true',
  'page/expect-boolean.spec.ts > toBeChecked > fail with not',
  'page/expect-boolean.spec.ts > toBeChecked > fail',
  'page/expect-boolean.spec.ts > toBeHidden > fail with not when nothing matching',
  'page/expect-misc.spec.ts > toBeInViewport > should have good stack',
  'page/expect-misc.spec.ts > toContainClass > fail with array',
  'page/expect-misc.spec.ts > toContainClass > fail',
  'page/expect-misc.spec.ts > toHaveAttribute > should match boolean attribute',
  'page/expect-misc.spec.ts > toHaveAttribute > should not match missing attribute',
  'page/expect-misc.spec.ts > toHaveClass > fail with array',
  'page/expect-misc.spec.ts > toHaveClass > fail',
  'page/expect-misc.spec.ts > toHaveCount > fail zero 2',
  'page/expect-misc.spec.ts > toHaveCount > fail zero',
  'page/expect-misc.spec.ts > toHaveJSProperty > fail boolean 2',
  'page/expect-misc.spec.ts > toHaveJSProperty > fail boolean',
  'page/expect-misc.spec.ts > toHaveJSProperty > fail number',
  'page/expect-misc.spec.ts > toHaveJSProperty > fail string',
  'page/expect-misc.spec.ts > toHaveURL > fail with negative predicate',
  'page/expect-misc.spec.ts > toHaveURL > fail with positive predicate',
  'page/expect-to-have-text.spec.ts > toHaveText with array > fail on not+empty',
  'page/expect-to-have-text.spec.ts > toHaveText with array > fail',
  'page/interception.spec.ts > should intercept by glob',
  'page/interception.spec.ts > should intercept network activity from worker 2',
  // Cache interception relies on a local history lifecycle that remote sessions do not expose.
  'page/interception.spec.ts > should disable memory cache when intercepting',
  'page/locator-misc-1.spec.ts > should upload the file',
  // Also fails on main (v1.58) in the full suite against the deployed test Worker.
  'page/page-add-locator-handler.spec.ts > should work',
  'page/page-autowaiting-no-hang.spec.ts > assigning location to about:blank',
  'page/page-basic.spec.ts > should have sane user agent',
  // New in v1.62. The result depends on the Browser Run browser: these pass with wrangler dev,
  // but fail against the deployed test Worker. (hover: hover) needs the --blink-settings flags
  // that Playwright passes when it launches a headless browser. 20 page.requestGC() calls exceed
  // the test timeout.
  'page/page-emulate-media.spec.ts > should report hover and fine pointer for desktop',
  'page/page-evaluate.spec.ts > promise collected',
  'page/page-evaluate.spec.ts > should respect use strict expression',
  'page/page-evaluate.spec.ts > should work with function shorthands',
  'page/page-event-popup.spec.ts > should be able to capture alert',
  // The test creates large files in the Worker, and the Worker throws an exception. Upstream
  // v1.58 skipped these tests in service mode, v1.62 does not.
  'page/page-filechooser.spec.ts > should upload multiple large files',
  'page/page-goto.spec.ts > should fail when main resources failed to load',
  'page/page-goto.spec.ts > should fail when navigating to bad SSL',
  // The Worker fixture is HTTPS-only, so it cannot exercise implicit HTTP URL completion.
  'page/page-goto.spec.ts > should use http for no protocol',
  // The Worker fixture cannot emulate the separate failing HTTPS server used by this test.
  'page/page-goto.spec.ts > should fail when navigating and show the url at the error message',
  // Browser Run blocks file:// URLs (net::ERR_BLOCKED_BY_ADMINISTRATOR). Upstream v1.58 skipped
  // these tests in service mode, v1.62 does not.
  'page/page-goto.spec.ts > should work with file URL',
  'page/page-goto.spec.ts > should work with file URL with subframes',
  'page/page-history.spec.ts > page.goBack should work for file urls',
  'page/page-network-response.spec.ts > should provide a Response with a file URL',
  // Browser Rendering does not expose a stable back-forward cache lifecycle.
  'page/page-history.spec.ts > goBack/goForward should work with bfcache-able pages',
  // Browser Rendering does not preserve renderer-initiated history entries reliably.
  'page/page-history.spec.ts > page.goForward during renderer-initiated navigation',
  // Browser Rendering can omit the load event when restoring remote history entries.
  'page/page-history.spec.ts > page.goBack should work @smoke',
  'page/page-network-response.spec.ts > should return body for prefetch script',
  'page/page-network-sizes.spec.ts > should have the correct responseBodySize',
  'page/page-network-sizes.spec.ts > should set bodySize to 0 when there was no response body',
  'page/page-request-intercept.spec.ts > should fulfill intercepted response using alias',
  'page/page-request-intercept.spec.ts > should give access to the intercepted response',
  // Also fails on main (v1.58) with a page teardown timeout. route.continue fails the same way.
  'page/page-route.spec.ts > route.fulfill should throw if called twice',
  'page/page-route.spec.ts > route.continue should throw if called twice',
  // Also fails on main (v1.58) in the full suite against the deployed test Worker.
  'page/page-screenshot.spec.ts > page screenshot > should take fullPage screenshots during navigation',
  'page/page-screenshot.spec.ts > page screenshot animations > should wait for fonts to load',
  // WebP snapshot comparison loads a WASM codec from the file system, which Workers cannot do.
  // Page.screenshot({ type: 'webp' }) works, because Chromium encodes the image.
  'page/page-screenshot.spec.ts > page screenshot > should produce a valid webp screenshot',
  'page/page-screenshot.spec.ts > page screenshot > path option should detect webp',
  'page/page-set-input-files.spec.ts > should throw an error if the file does not exist',
  'page/page-set-input-files.spec.ts > should upload a file after popup',
  'page/page-set-input-files.spec.ts > should upload a folder',
  'page/page-set-input-files.spec.ts > should upload the file with spaces in name',
  'page/page-set-input-files.spec.ts > should upload the file',
  // See page-filechooser.spec.ts > should upload multiple large files.
  'page/page-set-input-files.spec.ts > should upload large file',
  'page/page-set-input-files.spec.ts > should upload large file with relative path',
  'page/page-wait-for-navigation.spec.ts > should work with clicking on links which do not commit navigation',
  'page/page-wait-for-response.spec.ts > should work with re-rendered cached IMG elements',
  'page/page-wait-for-selector-2.spec.ts > should have correct stack trace for timeout',
  // Detached element handles reject before the remote hidden-state poll can complete.
  'page/page-wait-for-selector-2.spec.ts > should succeed if element handle was detached while waiting for hidden',
  // Detached element handles reject before the remote detached-state poll can complete.
  'page/page-wait-for-selector-2.spec.ts > should succeed if element handle was detached while waiting for detached',
  'page/selectors-get-by.spec.ts > getByTestId should escape id',
  'page/selectors-get-by.spec.ts > getByTestId should work for regex',
  'page/wheel.spec.ts > should dispatch wheel events @smoke',
  'page/wheel.spec.ts > should dispatch wheel events after popup was opened @smoke',
  'page/workers.spec.ts > Page.workers @smoke',
  'page/workers.spec.ts > should emit created and destroyed events',
  'page/workers.spec.ts > should report worker script as network request',
  // server.waitForRequest skips the test while page.waitForEvent('worker') is still pending. The
  // pending wait then rejects during teardown and fails the test.
  'page/workers.spec.ts > should support extra http headers',
];

export const skipErrorMessages: Array<string | RegExp> = [
  'Cloudflare Workers does not support',
  '__filename is not defined',
  '__dirname is not defined',
  `\\(\\) => {}`, // Cloudflare serializes empty arrow function with new lines
  'createHttp2Server is not defined',
  /\[unenv\] .* is not implemented yet!/,
  /Received string:\s+"Cloudflare-Workers"/,
  '.rendering.cfdata.org',
  /expect\w+ is not a function/,
  'Error: Agent not implemented',
  // node:vm execution contexts are not available in Cloudflare Workers.
  'The runInThisContext method is not implemented',
];
