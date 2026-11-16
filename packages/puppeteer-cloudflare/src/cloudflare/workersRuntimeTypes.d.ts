/**
 * @license
 * Copyright 2025 Google Inc.
 * SPDX-License-Identifier: Apache-2.0
 */

// Build-only declarations, not emitted. The published declarations refer to the
// Browser Run types of the Workers runtime by their global names, which every
// Worker project gets from @cloudflare/workers-types or `wrangler types`. This
// package compiles with the DOM library, which conflicts with the global form of
// the Workers types, so define the same global names from their module form.
// The DOM `Response` and `WebSocket` also lack the Workers-only members the
// transport uses, so add them here. Keeping them out of emitted files stops
// them from reaching the global types of Node code that imports this package.
import type * as Workers from '@cloudflare/workers-types/index.js';

declare global {
  interface Response {
    webSocket: WebSocket | null;
  }
  interface WebSocket {
    accept(): void;
  }

  type BrowserRun = Workers.BrowserRun;
  type BrowserRunAcquireGuardrails = Workers.BrowserRunAcquireGuardrails;
  type BrowserRunAcquireOptions = Workers.BrowserRunAcquireOptions;
  type BrowserRunAcquireResult = Workers.BrowserRunAcquireResult;
  type BrowserRunConnection = Workers.BrowserRunConnection;
  type BrowserRunLimits = Workers.BrowserRunLimits;
  type BrowserRunSession = Workers.BrowserRunSession;
}
