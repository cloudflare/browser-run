/**
 * @license
 * Copyright 2025 Google Inc.
 * SPDX-License-Identifier: Apache-2.0
 */
import {PuppeteerWorkers} from './cloudflare/PuppeteerWorkers.js';
import fs from 'node:fs';
import path from 'node:path';
import {environment} from 'puppeteer-core/lib/environment.js';
// Side-effect import: registers the Cloudflare.* CDP command augmentation of
// ProtocolMapping.Commands so session.send('Cloudflare.*', ...) is typed.
import './cloudflare/protocol.js';

// Wire puppeteer-core's file helpers to the Workers node:fs implementation.
// Used for `path` options, e.g. page.pdf({path}) and page.screenshot({path}).
Object.assign(environment.value, {
  path,
  readFile: (filePath: string, encoding?: 'utf8' | 'ascii') => {
    return fs.promises.readFile(filePath, encoding ? {encoding} : undefined);
  },
  writeFile: async (filePath: string, data: Uint8Array | string) => {
    await fs.promises.writeFile(filePath, data);
  },
  openFileForWriting: (filePath: string) => {
    return fs.promises.open(filePath, 'w+');
  },
  createWriteStream: (
    filePath: string,
    options?: {encoding?: BufferEncoding; overwrite?: boolean},
  ) => {
    return fs.createWriteStream(filePath, {
      encoding: options?.encoding,
      flags: options?.overwrite === false ? 'wx' : 'w',
    });
  },
  mkdir: async (dirPath: string, options?: {recursive?: boolean}) => {
    await fs.promises.mkdir(dirPath, options);
  },
});
export * from 'puppeteer-core/lib/api/api.js';
export * from 'puppeteer-core/lib/common/common.js';
export * from 'puppeteer-core/lib/revisions.js';
export * from 'puppeteer-core/lib/util/util.js';
export * from './cloudflare/BrowserWorker.js';
export * from './cloudflare/protocol.js';

const puppeteer = new PuppeteerWorkers();

// Explicit types keep the emitted declarations pointing at PuppeteerWorkers.
// Inferred types would reference puppeteer-core's Node entry point, which pulls
// in Node-only modules such as @puppeteer/browsers.
export const connect: PuppeteerWorkers['connect'] = puppeteer.connect;
export const history: PuppeteerWorkers['history'] = puppeteer.history;
export const launch: PuppeteerWorkers['launch'] = puppeteer.launch;
export const limits: PuppeteerWorkers['limits'] = puppeteer.limits;
export const sessions: PuppeteerWorkers['sessions'] = puppeteer.sessions;
export const acquire: PuppeteerWorkers['acquire'] = puppeteer.acquire;

export * from './cloudflare/PuppeteerWorkers.js';

export default puppeteer;
