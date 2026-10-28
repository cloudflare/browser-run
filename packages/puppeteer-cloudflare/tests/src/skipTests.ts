export const skipTests: string[] = [
    // TODO: Remove these six skips after Browser Run upgrades to Chrome 146 or
    // newer. Chrome 128 ignores windowBounds/background, lacks setContentsSize,
    // reports the fixed iframe element as non-clickable, and accepts the inline
    // script despite the Worker-hosted CSP setup.
    "page.test.ts > Page > Page.newPage > should open pages in a new window at the specified position",
    "page.test.ts > Page > Page.newPage > should open pages in a new window in maximized state",
    "page.test.ts > Page > Page.resize > should resize the browser window to fit page content",
    "page.test.ts > Page > Page.newPage > should create a background page",
    "click.test.ts > Page.click > should click the button with fixed position inside an iframe",
    "page.test.ts > Page > Page.addScriptTag > should throw when added with content to the CSP page",

    // Browser Run page navigator.userAgent returns Cloudflare-Workers, while CDP
    // Browser.getVersion and request headers use the stock or overridden Chrome
    // UA. The page UA ignores explicit UA overrides, although platform overrides
    // work, so upstream platform consistency, device emulation, and reset
    // assertions cannot hold.
    "page.test.ts > Page > Page.setUserAgent > should work with platform option without userAgent",
    "page.test.ts > Page > Page.setUserAgent > should restore original",
    "page.test.ts > Page > Page.setUserAgent > should emulate device user-agent",

    // These match Puppeteer's own TestExpectations.json. This Worker runner
    // cannot represent expected failures, so it records them as explicit skips.
    "coverage.test.ts > Coverage specs > JSCoverage > should not hang when there is a debugger statement",
    "evaluation.test.ts > Evaluation specs > Page.evaluate > should transfer RegEx",
    "evaluation.test.ts > Evaluation specs > Page.evaluate > should return RegEx",
    "navigation.test.ts > navigation > Page.goto > should work when navigating to a URL with a client redirect",

    "oopif.test.ts > OOPIF > should treat OOP iframes and normal iframes the same",
    "oopif.test.ts > OOPIF > should track navigations within OOP iframes",
    "oopif.test.ts > OOPIF > should support OOP iframes becoming normal iframes again",
    "oopif.test.ts > OOPIF > should support frames within OOP frames",
    "oopif.test.ts > OOPIF > should recover cross-origin frames on reconnect",
    "oopif.test.ts > OOPIF > should support OOP iframes getting detached",
    "oopif.test.ts > OOPIF > should support wait for navigation for transitions from local to OOPIF",
    "oopif.test.ts > OOPIF > should keep track of a frames OOP state",
    "oopif.test.ts > OOPIF > should support evaluating in oop iframes",
    "oopif.test.ts > OOPIF > should provide access to elements",
    "oopif.test.ts > OOPIF > should report oopif frames",
    "oopif.test.ts > OOPIF > should wait for inner OOPIFs",
    "oopif.test.ts > OOPIF > should load oopif iframes with subresources and request interception",
    "oopif.test.ts > OOPIF > should support frames within OOP iframes",
    "oopif.test.ts > OOPIF > clickablePoint, boundingBox, boxModel should work for elements inside OOPIFs",
    "oopif.test.ts > OOPIF > should detect existing OOPIFs when Puppeteer connects to an existing page",
    "oopif.test.ts > OOPIF > should support lazy OOP frames",
    "oopif.test.ts > OOPIF > should exposeFunction on a page with a PDF viewer",
    "oopif.test.ts > OOPIF > should evaluate on a page with a PDF viewer",
    "oopif.test.ts > OOPIF > should support evaluateOnNewDocument",
    "oopif.test.ts > OOPIF > should support removing evaluateOnNewDocument scripts",
    "oopif.test.ts > OOPIF > should support exposeFunction",
    "oopif.test.ts > OOPIF > should support removing exposed function",
    "oopif.test.ts > OOPIF > waitForFrame > should resolve immediately if the frame already exists",
    "oopif.test.ts > OOPIF > should report google.com frame",
    "oopif.test.ts > OOPIF > should expose events within OOPIFs",
    "page.test.ts > Page > Page.setUserAgent > should work",
    "page.test.ts > Page > Page.setUserAgent > should work for subframes",
    "page.test.ts > Page > Page.addScriptTag > should work with a path and type=module",
    "page.test.ts > Page > Page.addScriptTag > should work with a path",
    "page.test.ts > Page > Page.addScriptTag > should include sourcemap when path is provided",
    "page.test.ts > Page > Page.addStyleTag > should work with a path",
    "page.test.ts > Page > Page.addStyleTag > should include sourcemap when path is provided",
    "elementhandle.test.ts > ElementHandle specs > ElementHandle[Symbol.dispose] > should work",
    "elementhandle.test.ts > ElementHandle specs > ElementHandle[Symbol.asyncDispose] > should work",
    "elementhandle.test.ts > ElementHandle specs > ElementHandle.move > should work",
    "cookies.test.ts > Cookie specs > Page.cookies > should get a cookie",
    "cookies.test.ts > Cookie specs > Page.cookies > should get multiple cookies",
    "cookies.test.ts > Cookie specs > Page.setCookie > should set cookie with reasonable defaults",
    "cookies.test.ts > Cookie specs > Page.setCookie > should set a cookie with a path",
    "cookies.test.ts > Cookie specs > Page.setCookie > should set cookies from a frame",
    "cookies.test.ts > Cookie specs > Page.deleteCookie > should delete cookie for specified URL",
    "locator.test.ts > Locator > Locator.click > should time out",
    "locator.test.ts > Locator > Locator.click > should retry clicks on errors",
    "locator.test.ts > Locator > Locator.click > can be aborted",
    "locator.test.ts > Locator > Locator.race > can be aborted",
    "locator.test.ts > Locator > Locator.race > should time out when all locators do not match",
    "locator.test.ts > Locator > Locator.prototype.filter > should resolve as soon as the predicate matches",
    "navigation.test.ts > navigation > Page.goto > should fail when navigating to bad SSL",
    // Workers.dev always presents valid managed TLS, so the remote TestServer
    // cannot provide the invalid certificate required by this upstream test.
    "navigation.test.ts > navigation > Page.goto > should fail when navigating to bad SSL after redirects",
    "navigation.test.ts > navigation > Page.goto > should not leak listeners during navigation",
    "navigation.test.ts > navigation > Page.goto > should not leak listeners during bad navigation",
    "navigation.test.ts > navigation > Page.goto > should not leak listeners during navigation of 11 pages",
    "navigation.test.ts > navigation > Page.goto > should fail when navigating and show the url at the error message",
    "coverage.test.ts > Coverage specs > JSCoverage > should work with conditionals",
    "coverage.test.ts > Coverage specs > CSSCoverage > should work with complicated usecases",
    "evaluation.test.ts > Evaluation specs > Page.evaluate > should replace symbols with undefined",
    "evaluation.test.ts > Evaluation specs > Page.evaluate > should work for circular object",
    "evaluation.test.ts > Evaluation specs > Page.evaluate > should transfer 100Mb of data from page to node.js",
    "evaluation.test.ts > Evaluation specs > Page.evaluate > should return properly serialize objects with unknown type fields",
    "jshandle.test.ts > JSHandle > JSHandle.toString > should work with window subtypes",
    "jshandle.test.ts > JSHandle > JSHandle[Symbol.dispose] > should work",
    "jshandle.test.ts > JSHandle > JSHandle[Symbol.asyncDispose] > should work",
    "jshandle.test.ts > JSHandle > JSHandle.move > should work",
    "dialog.test.ts > Page.Events.Dialog > should fire",
    "dialog.test.ts > Page.Events.Dialog > should allow accepting prompts",
    "frame.test.ts > Frame specs > Frame Management > should handle nested frames",
    "input.test.ts > input tests > ElementHandle.uploadFile > should read the file",
    "input.test.ts > input tests > FileChooser.accept > should be able to read selected file",
    "mouse.test.ts > Mouse > should not throw if buttons are pressed twice",
    "mouse.test.ts > Mouse > should reset properly",
    "drag-and-drop.test.ts > Drag n' Drop > should drag and drop",
    "keyboard.test.ts > Keyboard > should send a character with sendCharacter in iframe",
    "jshandle.test.ts > JSHandle > JSHandle.jsonValue > should work with dates",
    "jshandle.test.ts > JSHandle > JSHandle.jsonValue > should not throw for circular objects",
    "keyboard.test.ts > Keyboard > ElementHandle.press should not support |text| option",
    "page.test.ts > Page > Page.pdf > can print to PDF and save to file",

    // Browser Run shares a remote browser session across tests. Crashing a page
    // destroys that session rather than only the target under test.
    "page.test.ts > Page > Page.Events.error > should throw when page crashes",

    // Worker isolates disable dynamic code generation. Puppeteer's custom query
    // registration path compiles user handlers with Function constructors.
    "elementhandle.test.ts > ElementHandle specs > Custom queries > should register and unregister",
    "elementhandle.test.ts > ElementHandle specs > Custom queries > should work for multiple elements",
    "elementhandle.test.ts > ElementHandle specs > Custom queries > should eval correctly",
    "elementhandle.test.ts > ElementHandle specs > Custom queries > should wait correctly with waitForSelector",
    "elementhandle.test.ts > ElementHandle specs > Custom queries > should wait correctly with waitForSelector on an element",
    "elementhandle.test.ts > ElementHandle specs > Custom queries > should work when both queryOne and queryAll are registered",
    "elementhandle.test.ts > ElementHandle specs > Custom queries > should eval when both queryOne and queryAll are registered",
    "elementhandle.test.ts > ElementHandle specs > Custom queries > should work with function shorthands",
    "queryhandler.test.ts > Query handler tests > Text selectors > in Page > should query existing element",
    "queryhandler.test.ts > Query handler tests > Text selectors > in Page > should return empty array for non-existing element",
    "queryhandler.test.ts > Query handler tests > Text selectors > in Page > should return first element",
    "queryhandler.test.ts > Query handler tests > Text selectors > in Page > should pierce shadow DOM",
    "queryhandler.test.ts > Query handler tests > Text selectors > in Page > should query deeply nested text",
    "queryhandler.test.ts > Query handler tests > Text selectors > in Page > should query inputs",
    "queryhandler.test.ts > Query handler tests > Text selectors > in Page > should not query radio",
    "queryhandler.test.ts > Query handler tests > Text selectors > in Page > should query text spanning multiple elements",
    "queryhandler.test.ts > Query handler tests > Text selectors > in Page > should clear caches",
    "queryhandler.test.ts > Query handler tests > Text selectors > in ElementHandles > should query existing element",
    "queryhandler.test.ts > Query handler tests > Text selectors > in ElementHandles > should return null for non-existing element",
    "queryhandler.test.ts > Query handler tests > P selectors > should work with custom selectors",
    "queryhandler.test.ts > Query handler tests > P selectors > should work with custom selectors with args",
    "queryselector.test.ts > querySelector > QueryAll > should have registered handler",
    "queryselector.test.ts > querySelector > QueryAll > $$ should query existing elements",
    "queryselector.test.ts > querySelector > QueryAll > $$ should return empty array for non-existing elements",
    "queryselector.test.ts > querySelector > QueryAll > $$eval should work",
    "queryselector.test.ts > querySelector > QueryAll > $$eval should accept extra arguments",
    "queryselector.test.ts > querySelector > QueryAll > $$eval should accept ElementHandles as arguments",
    "queryselector.test.ts > querySelector > QueryAll > $$eval should handle many elements",

    // These assertions depend on localhost URLs, socket failure modes, or
    // redirect history that the deployed workers.dev TestServer cannot match.
    "evaluation.test.ts > Evaluation specs > Frame.evaluate > should execute after cross-site navigation",
    "navigation.test.ts > navigation > Page.goto > should fail when main resources failed to load",
    "navigation.test.ts > navigation > Page.goBack > should work",

    // Browser Run returns concrete CdpCDPSession objects from the bundled copy;
    // they cannot satisfy instanceof checks against the test bundle's copy.
    "frame.test.ts > Frame specs > Frame.client > should return the client instance",
    "page.test.ts > Page > Page.client > should return the client instance",

    // The Worker bundle renames the injected helper, so createFunction3 is not
    // available under the identifier expected by this direct utility test.
    "injected.test.ts > PuppeteerUtil tests > createFunction tests > should work",
    // Serialized race candidates lose the concrete locator type required by
    // Locator.race and produce "Unknown locator for race candidate".
    "locator.test.ts > Locator > Locator.race > races multiple locators",
    "locator.test.ts > Locator > Locator.race > should not time out when one of the locators matches",
    // The generated Worker test has no Mocha context for this.timeout().
    "queryselector.test.ts > querySelector > Page.$$eval > should handle many elements",
    // Bundling removes the source filename that this test requires in the stack.
    "page.test.ts > Page > Page.exposeFunction > should throw exception in page context",

    // These tests connect a second client with browser.wsEndpoint(). Browser
    // Run connects through the binding and a session ID, so the endpoint is
    // empty and puppeteer.connect() rejects the options.
    "cdp/network_restrictions.test.ts > Network Restrictions > should detach from targets violating blocklist when connecting to a running browser",
    "cdp/network_restrictions.test.ts > Network Restrictions > should detach from targets violating allowlist when connecting to a running browser",
    "dialog.test.ts > Page.Events.Dialog > should see dialogs handled by other connections",

    // Page.startScreenRecording is not available before Chrome 153. This matches
    // Puppeteer's own TestExpectations.json.
    "page.test.ts > Page > Page.record > should record page",
];
