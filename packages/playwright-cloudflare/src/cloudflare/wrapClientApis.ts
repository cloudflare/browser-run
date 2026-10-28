/**
 * Copyright (c) Rui Figueira.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// TODO very nast hack, fix asap!

// some types are commented out because they are not used in the extension
// or they were not released in this version of Playwright

import { Browser } from 'playwright-core/lib/client/browser';
import { BrowserContext } from 'playwright-core/lib/client/browserContext';
import { BrowserType } from 'playwright-core/lib/client/browserType';
import { Clock } from 'playwright-core/lib/client/clock';
import { ConsoleMessage } from 'playwright-core/lib/client/consoleMessage';
import { Coverage } from 'playwright-core/lib/client/coverage';
import { Dialog } from 'playwright-core/lib/client/dialog';
import { Download } from 'playwright-core/lib/client/download';
// import { Electron, ElectronApplication } from 'playwright-core/lib/client/electron';
import { FrameLocator, Locator } from 'playwright-core/lib/client/locator';
import { ElementHandle } from 'playwright-core/lib/client/elementHandle';
import { FileChooser } from 'playwright-core/lib/client/fileChooser';
import { TimeoutError } from 'playwright-core/lib/client/errors';
import { Frame } from 'playwright-core/lib/client/frame';
import { Keyboard, Mouse, Touchscreen } from 'playwright-core/lib/client/input';
import { JSHandle } from 'playwright-core/lib/client/jsHandle';
import { Route, WebSocket, WebSocketRoute } from 'playwright-core/lib/client/network';
import { APIRequest, APIRequestContext, APIResponse } from 'playwright-core/lib/client/fetch';
import { Page } from 'playwright-core/lib/client/page';
import { Selectors } from 'playwright-core/lib/client/selectors';
import { Tracing } from 'playwright-core/lib/client/tracing';
import { Video } from 'playwright-core/lib/client/video';
import { Worker } from 'playwright-core/lib/client/worker';
import { CDPSession } from 'playwright-core/lib/client/cdpSession';
import { Playwright } from 'playwright-core/lib/client/playwright';
import { WebError } from 'playwright-core/lib/client/webError';

import { apiCallZone } from './apiCallZone';

type ApiTypeMap = {
  // 'android': Android,
  // 'androidDevice': AndroidDevice,
  // 'androidWebView': AndroidWebView,
  // 'androidInput': AndroidInput,
  // 'androidSocket': AndroidSocket,
  'browser': Browser,
  'browserContext': BrowserContext,
  'browserType': BrowserType,
  'clock': Clock,
  'consoleMessage': ConsoleMessage,
  'coverage': Coverage,
  'dialog': Dialog,
  'download': Download,
  // 'electron': Electron,
  // 'electronApplication': ElectronApplication,
  'locator': Locator,
  'frameLocator': FrameLocator,
  'elementHandle': ElementHandle,
  'fileChooser': FileChooser,
  'timeoutError': TimeoutError,
  'frame': Frame,
  'keyboard': Keyboard,
  'mouse': Mouse,
  'touchscreen': Touchscreen,
  'jSHandle': JSHandle,
  'route': Route,
  'webSocket': WebSocket,
  'webSocketRoute': WebSocketRoute,
  'request': APIRequest,
  'requestContext': APIRequestContext,
  'response': APIResponse,
  'page': Page,
  'selectors': Selectors,
  'tracing': Tracing,
  'video': Video,
  'worker': Worker,
  'session': CDPSession,
  'playwright': Playwright,
  'webError': WebError,
};

// obtains all async public methods from a class (excludes the ones prefixed with _)
type KeysOfAsyncMethods<T> = {
  [K in keyof T]: T[K] extends (...args: any[]) => Promise<any> ? (K extends `_${string}` | 'removeAllListeners' ? never : K) : never;
}[Extract<keyof T, string>];

// exhaustive list of async API functions, with explicit flag if they need to be wrapped or not
const apis: { [ApiK in keyof ApiTypeMap]: [ApiTypeMap[ApiK], { [K in KeysOfAsyncMethods<ApiTypeMap[ApiK]>]: boolean }] } = {
  // android: [Android.prototype],
  // androidDevice: [AndroidDevice.prototype],
  // androidWebView: [AndroidWebView.prototype],
  // androidInput: [AndroidInput.prototype],
  // androidSocket: [AndroidSocket.prototype],
  browser: [Browser.prototype, { newContext: true, newPage: true, newBrowserCDPSession: true, startTracing: true, stopTracing: true, close: true, bind: true, unbind: true }],
  browserContext: [BrowserContext.prototype, {
    newPage: true,
    cookies: true,
    addCookies: true,
    clearCookies: true,
    grantPermissions: true,
    clearPermissions: true,
    setGeolocation: true,
    setExtraHTTPHeaders: true,
    setOffline: true,
    setHTTPCredentials: true,
    setStorageState: true,
    addInitScript: true,
    exposeBinding: true,
    exposeFunction: true,
    route: true,
    routeFromHAR: true,
    unrouteAll: true,
    unroute: true,
    waitForEvent: true,
    storageState: true,
    newCDPSession: true,
    close: true,
    routeWebSocket: true
  }],
  browserType: [BrowserType.prototype, { launch: true, launchServer: true, launchPersistentContext: true, connect: true, connectOverCDP: true }],
  clock: [Clock.prototype, { install: true, fastForward: true, pauseAt: true, resume: true, runFor: true, setFixedTime: true, setSystemTime: true }],
  consoleMessage: [ConsoleMessage.prototype, {}],
  coverage: [Coverage.prototype, { startCSSCoverage: true, stopCSSCoverage: true, startJSCoverage: true, stopJSCoverage: true }],
  dialog: [Dialog.prototype, { accept: true, dismiss: true }],
  download: [Download.prototype, { cancel: true, createReadStream: true, path: true, failure: true, delete: true, saveAs: true }],
  // electron: [Electron.prototype, {}],
  // electronApplication: [ElectronApplication.prototype, {}],
  locator: [Locator.prototype, {
    boundingBox: true,
    check: true,
    click: true,
    dblclick: true,
    dispatchEvent: true,
    dragTo: true,
    evaluate: true,
    evaluateAll: true,
    evaluateHandle: true,
    fill: true,
    clear: true,
    highlight: true,
    elementHandle: true,
    elementHandles: true,
    focus: true,
    blur: true,
    count: true,
    getAttribute: true,
    hover: true,
    innerHTML: true,
    innerText: true,
    inputValue: true,
    isChecked: true,
    isDisabled: true,
    isEditable: true,
    isEnabled: true,
    isHidden: true,
    isVisible: true,
    press: true,
    screenshot: true,
    scrollIntoViewIfNeeded: true,
    selectOption: true,
    selectText: true,
    setChecked: true,
    setInputFiles: true,
    tap: true,
    textContent: true,
    type: true,
    pressSequentially: true,
    uncheck: true,
    all: true,
    allInnerTexts: true,
    allTextContents: true,
    waitFor: true,
    ariaSnapshot: true,
    drop: true,
    normalize: true,
    hideHighlight: true,
    waitForFunction: true,
  }],
  frameLocator: [FrameLocator.prototype, {}],
  elementHandle: [ElementHandle.prototype, {
    // from JSHandle
    evaluate: true,
    evaluateHandle: true,
    getProperty: true,
    getProperties: true,
    jsonValue: true,
    dispose: true,
    // from ElementHandle
    ownerFrame: true,
    contentFrame: true,
    getAttribute: true,
    inputValue: true,
    textContent: true,
    innerText: true,
    innerHTML: true,
    isChecked: true,
    isDisabled: true,
    isEditable: true,
    isEnabled: true,
    isHidden: true,
    isVisible: true,
    dispatchEvent: true,
    scrollIntoViewIfNeeded: true,
    hover: true,
    click: true,
    dblclick: true,
    tap: true,
    selectOption: true,
    fill: true,
    selectText: true,
    setInputFiles: true,
    focus: true,
    type: true,
    press: true,
    check: true,
    uncheck: true,
    setChecked: true,
    boundingBox: true,
    screenshot: true,
    $: true,
    $$: true,
    $eval: true,
    $$eval: true,
    waitForElementState: true,
    waitForSelector: true,
  }],
  fileChooser: [FileChooser.prototype, { setFiles: true }],
  timeoutError: [TimeoutError.prototype, { details: false }],
  frame: [Frame.prototype, {
    goto: true,
    waitForNavigation: true,
    waitForLoadState: true,
    waitForURL: true,
    frameElement: true,
    evaluateHandle: true,
    evaluate: true,
    $: true,
    $$: true,
    waitForSelector: true,
    dispatchEvent: true,
    $eval: true,
    $$eval: true,
    content: true,
    setContent: true,
    addScriptTag: true,
    addStyleTag: true,
    click: true,
    dblclick: true,
    dragAndDrop: true,
    tap: true,
    fill: true,
    focus: true,
    textContent: true,
    innerText: true,
    innerHTML: true,
    getAttribute: true,
    inputValue: true,
    isChecked: true,
    isDisabled: true,
    isEditable: true,
    isEnabled: true,
    isHidden: true,
    isVisible: true,
    hover: true,
    selectOption: true,
    setInputFiles: true,
    type: true,
    press: true,
    check: true,
    uncheck: true,
    setChecked: true,
    waitForTimeout: true,
    waitForFunction: true,
    title: true
  }],
  keyboard: [Keyboard.prototype, { down: true, up: true, insertText: true, type: true, press: true }],
  mouse: [Mouse.prototype, { click: true, dblclick: true, down: true, up: true, move: true, wheel: true }],
  touchscreen: [Touchscreen.prototype, { tap: true }],
  jSHandle: [JSHandle.prototype, { evaluate: true, evaluateHandle: true, getProperty: true, jsonValue: true, getProperties: true, dispose: true }],
  route: [Route.prototype, { fallback: true, abort: true, fetch: true, fulfill: true, continue: true }],
  webSocket: [WebSocket.prototype, { waitForEvent: true }],
  webSocketRoute: [WebSocketRoute.prototype, { close: true }],
  request: [APIRequest.prototype, { newContext: true }],
  requestContext: [APIRequestContext.prototype, { dispose: true, delete: true, head: true, get: true, patch: true, post: true, put: true, fetch: true, storageState: true }],
  response: [APIResponse.prototype, { body: true, json: true, text: true, dispose: true, securityDetails: true, serverAddr: true }],
  page: [Page.prototype, {
    opener: true,
    waitForSelector: true,
    dispatchEvent: true,
    evaluateHandle: true,
    $: true,
    $$: true,
    $eval: true,
    $$eval: true,
    addScriptTag: true,
    addStyleTag: true,
    exposeFunction: true,
    exposeBinding: true,
    setExtraHTTPHeaders: true,
    content: true,
    setContent: true,
    goto: true,
    reload: true,
    addLocatorHandler: true,
    waitForLoadState: true,
    waitForNavigation: true,
    waitForURL: true,
    waitForRequest: true,
    waitForResponse: true,
    waitForEvent: true,
    goBack: true,
    goForward: true,
    emulateMedia: true,
    setViewportSize: true,
    evaluate: true,
    addInitScript: true,
    route: true,
    routeFromHAR: true,
    unrouteAll: true,
    unroute: true,
    screenshot: true,
    title: true,
    bringToFront: true,
    close: true,
    click: true,
    dragAndDrop: true,
    dblclick: true,
    tap: true,
    fill: true,
    focus: true,
    textContent: true,
    innerText: true,
    innerHTML: true,
    getAttribute: true,
    inputValue: true,
    isChecked: true,
    isDisabled: true,
    isEditable: true,
    isEnabled: true,
    isHidden: true,
    isVisible: true,
    hover: true,
    selectOption: true,
    setInputFiles: true,
    type: true,
    press: true,
    check: true,
    uncheck: true,
    setChecked: true,
    waitForTimeout: true,
    waitForFunction: true,
    pause: true,
    pdf: true,
    removeLocatorHandler: true,
    requestGC: true,
    routeWebSocket: true,
    consoleMessages: true,
    pageErrors: true,
    requests: true,
    ariaSnapshot: true,
    pickLocator: true,
    cancelPickLocator: true,
    hideHighlight: true,
    clearConsoleMessages: true,
    clearPageErrors: true,
  }],
  selectors: [Selectors.prototype, { register: true }],
  tracing: [Tracing.prototype, { start: true, startChunk: true, stop: true, stopChunk: true, group: false, groupEnd: false, startHar: true, stopHar: true }],
  video: [Video.prototype, { delete: true, path: true, saveAs: true }],
  worker: [Worker.prototype, { evaluate: true, evaluateHandle: true, waitForEvent: true }],
  session: [CDPSession.prototype, { send: true, detach: true }],
  playwright: [Playwright.prototype, { devices: false }],
  webError: [WebError.prototype, {}],
};

const kApiFunctionWrapped = Symbol('kApiFunctionWrapped');

export function wrapClientApis() {
  for (const [typeName, [proto, props]] of Object.entries(apis)) {
    for (const [key, needsWrap] of Object.entries(props)) {
      if (!needsWrap)
        continue;
      const originalFn = (proto as any)[key!];

      if (!originalFn || typeof originalFn !== 'function')
        throw new Error(`Method ${key} not found in ${typeName}`);

      if (originalFn[kApiFunctionWrapped] === true)
        continue;

      const wrapFn = async function(this: any, ...args: any[]) {
        const apiName = apiCallZone.getStore();
        if (apiName)
          return await originalFn.apply(this, args);
        return await apiCallZone.run({ apiName: `${typeName}.${key}` }, async () => await originalFn.apply(this, args));
      };
      wrapFn[kApiFunctionWrapped] = true;
      (proto as any)[key!] = wrapFn;
    }
  }
}
