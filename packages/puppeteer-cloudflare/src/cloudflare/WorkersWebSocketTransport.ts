/**
 * @license
 * Copyright 2025 Google Inc.
 * SPDX-License-Identifier: Apache-2.0
 */
import type {ConnectionTransport} from 'puppeteer-core/lib/common/ConnectionTransport.js';
import {DEBUG_PREFIXES, debug} from 'puppeteer-core/lib/common/Debug.js';

import {packageVersion} from '../packageVersion.js';
import type {BrowserWorker} from './BrowserWorker.js';
import {
  encodeGuardrailsHeader,
  GUARDRAILS_HEADER,
  type Browsers,
  type SessionGuardrails,
} from './utils.js';

const FAKE_HOST = 'https://fake.host';

/**
 * Whatever shapes the upgrade request beyond the endpoint and the session, kept
 * in one bag so that adding another knob doesn't grow the `create` signature.
 */
export interface WorkersWebSocketTransportOptions {
  // acquires this browser on connect instead of the default one
  browser?: Browsers;
  // restricts the outbound traffic of the session being acquired
  guardrails?: SessionGuardrails;
}

export class WorkersWebSocketTransport implements ConnectionTransport {
  ws: WebSocket;
  onmessage?: (message: string) => void;
  onclose?: () => void;
  sessionId: string | undefined;

  static async create(
    endpoint: BrowserWorker,
    sessionId: string | undefined,
    options: WorkersWebSocketTransportOptions = {}
  ): Promise<WorkersWebSocketTransport> {
    const {browser, guardrails} = options;
    // Browsers other than the default one are acquired on connect, so there's
    // no session to connect to yet.
    const path = browser
      ? `${FAKE_HOST}/v1/devtools/browser?browser=${browser}`
      : `${FAKE_HOST}/v1/devtools/browser/${sessionId}`;
    const response = await endpoint.fetch(path, {
      headers: {
        Upgrade: 'websocket',
        'cf-brapi-client': `@cloudflare/puppeteer@${packageVersion}`,
        ...(guardrails
          ? {[GUARDRAILS_HEADER]: encodeGuardrailsHeader(guardrails)}
          : {}),
      },
    });
    // A refused upgrade has no websocket to accept, so surface what core said
    // instead of failing on a null dereference.
    if (!response.webSocket) {
      throw new Error(
        `Unable to connect to browser: code: ${response.status}: message: ${await response.text()}`
      );
    }
    response.webSocket.accept();
    return new WorkersWebSocketTransport(response.webSocket, sessionId);
  }

  constructor(ws: WebSocket, sessionId: string | undefined) {
    this.ws = ws;
    this.sessionId = sessionId;
    this.ws.addEventListener('message', async event => {
      this.onmessage?.(event.data);
    });
    this.ws.addEventListener('close', () => {
      this.onclose?.();
    });
    this.ws.addEventListener('error', e => {
      const message = (e as ErrorEvent).message || 'Unknown error';
      debug(DEBUG_PREFIXES.error)?.(
        `WebSocket error: SessionID: ${sessionId} - ${message}`
      );
    });
  }

  send(message: string): void {
    this.ws.send(message);
  }

  close(): void {
    this.ws.close();
  }

  toString(): string {
    return this.sessionId ?? 'unknown';
  }
}
