# Puppeteer for Browser Run

This package is a port of [Puppeteer](https://github.com/puppeteer/puppeteer) modified to be compatible with [Cloudflare Workers](https://developers.cloudflare.com/workers/) and [Browser Run](https://developers.cloudflare.com/browser-run/).

The goals of the port are:

- Support as much of the existing puppeteer-core library as possible.
- Minimize the size of the library for Workers developers, since library space is at a premium in Workers projects.
- Make library use as seamless as possible in Workers.

## Installation

```shell
npm install @cloudflare/puppeteer
```

## Configuration

`@cloudflare/puppeteer` needs [Node.js compatibility](https://developers.cloudflare.com/workers/runtime-apis/nodejs/#get-started). For a `compatibility_date` of `2026-08-04` or later, Workers enables Node.js compatibility by default. For an earlier date, you must add the `nodejs_compat` compatibility flag.

Add a browser binding to your Wrangler configuration:

```toml
compatibility_date = "2026-08-04"
browser = { binding = "MYBROWSER" }
```

If your `compatibility_date` is earlier than `2026-08-04`, also add the `nodejs_compat` flag:

```toml
compatibility_date = "2026-08-03"
compatibility_flags = ["nodejs_compat"]
browser = { binding = "MYBROWSER" }
```

Do not add the `no_nodejs_compat` flag. The package does not work without Node.js compatibility.

### File options

Options that read or write files use the [Workers virtual file system](https://developers.cloudflare.com/workers/runtime-apis/nodejs/fs/). Examples are `page.screenshot({path})`, `page.pdf({path})`, and `tracing.start({path})`. These options need a `compatibility_date` of `2025-09-01` or later, or the `enable_nodejs_fs_module` flag.

Write files to `/tmp`. Files in `/tmp` exist only for the current request.

## TypeScript

The package types use the Browser Run types of the Workers runtime, for example `BrowserRun` and `BrowserRunAcquireGuardrails`. Your project gets these types from `wrangler types` with Wrangler 4.134.0 or later, or from `@cloudflare/workers-types` 5.20260917.1 or later.

If your types are older, TypeScript reports `Cannot find name 'BrowserRun'`. With `skipLibCheck`, TypeScript does not report an error, but it also does not check these types. To update the types, run:

```sh
npx wrangler types
```

## CDP Protocol Support

[Browser Run now has full CDP support](https://developers.cloudflare.com/changelog/post/2026-04-10-browser-rendering-cdp-endpoint/), so starting with `@cloudflare/puppeteer` version 1.1.0, the library uses the standard CDP (Chrome DevTools Protocol) internally to communicate with Browser Run.

Everything should work the same way, but if you encounter any issues, please [report them](https://github.com/cloudflare/browser-run/issues). You can also downgrade to a previous puppeteer version by using `compatibility_date` prior to `2026-03-17` or by adding the `no_websocket_standard_binary_type` flag:

```toml
compatibility_date = "2026-03-16"
# or
compatibility_flags = ["nodejs_compat", "no_websocket_standard_binary_type", ...]
```

See [cloudflare/browser-run#193](https://github.com/cloudflare/browser-run/issues/193) and [cloudflare/workerd#6442](https://github.com/cloudflare/workerd/issues/6442) for details.

## Example

```ts
import puppeteer from '@cloudflare/puppeteer';

export default {
  async fetch(request, env): Promise<Response> {
    const browser = await puppeteer.launch(env.MYBROWSER);
    const page = await browser.newPage();

    await page.goto('https://example.com');
    const img = await page.screenshot();

    await browser.close();

    return new Response(img, {
      headers: {
        'Content-Type': 'image/png',
      },
    });
  },
} satisfies ExportedHandler<Env>;
```

## Documentation

More information in the [Browser Run developer docs](https://developers.cloudflare.com/browser-run/).
