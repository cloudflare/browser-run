import { AsyncLocalStorage } from 'async_hooks';
import { debugLogger } from '@utils/debugLogger';

import type { ConnectionTransport, ProtocolRequest, ProtocolResponse } from 'playwright-core/lib/server/transport';

// stores the endpoint and options for client -> server communication
export const transportZone = new AsyncLocalStorage<WebSocketTransport>();

export class WebSocketTransport implements ConnectionTransport {
  private _ws: WebSocket;
  private _closing = false;
  onmessage?: (message: ProtocolResponse) => void;
  onclose?: () => void;
  readonly sessionId: string | undefined;

  static async connect(): Promise<WebSocketTransport> {
    // read the endpoint and options injected in cliend side
    const transport = transportZone.getStore();
    if (!transport)
      throw new Error('Transport is not available in the current zone');
    return transport;
  }

  constructor(ws: WebSocket, sessionId: string | undefined) {
    this._ws = ws;
    this.sessionId = sessionId;
    this._ws.addEventListener('message', event => {
      this.onmessage?.(JSON.parse(event.data) as ProtocolResponse);
    });
    this._ws.addEventListener('close', () => {
      this._closing = true;
      this.onclose?.();
    });
    this._ws.addEventListener('error', e => {
      // workerd fires an error when Browser Run drops the socket after Browser.close
      if (this._closing)
        return;
      const message = (e as ErrorEvent).message || 'unknown error';
      debugLogger.log('error', `Websocket error${sessionId ? `: SessionID: ${sessionId}` : ''}: ${message}`);
    });
  }

  send(message: ProtocolRequest): void {
    if (message.method === 'Browser.close')
      this._closing = true;
    this._ws.send(JSON.stringify(message));
  }

  close(): void {
    this._closing = true;
    this._ws.close();
    this.onclose?.();
  }

  async closeAndWait() {
    if (this._ws.readyState === WebSocket.CLOSED)
      return;
    this.close();
    // TODO wait for close event
  }

  toString(): string {
    return this.sessionId ?? '';
  }
}
