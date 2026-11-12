# Testing Playwright with Cloudflare

The best way to test Playwright Cloudflare is to run the playwright test suite in a worker runtime environment.
To facilitate this, we have created some scripts that generate the necessary code to load these test files into workers.

These tests are then exposed through `testsServer` worker, which can be accessed via HTTP / WebSocket protocols.
This setup allows us to execute proxy tests using `vitest` that interact with the testsServer.

## Worker Tests

`workerTests` folder contains playwright original tests with few modifications, and are generated via a script.

All those tests are loaded by `testsServer` worker and made available to run in worker runtime.

## Proxy Tests

In the `proxyTests` folder, we maintain proxy files for each test, which are generated via a script.

These files are used to call the `testsServer` worker and execute the corresponding tests.

## Upstream Playwright Test runner (pilot)

`wrangler.runner.toml` deploys a Worker that runs upstream Playwright Test
itself, through `@cloudflare/kitebuild-playwright-spec-runner`: the runner in a
Worker Loader isolate and each worker process in its own, with the browser from
Browser Run. It uses the same specs, fixtures (`src/server/workerFixtures.ts`)
and skip lists; `src/runner/` adapts them, and `runner/build.mjs` bundles them
with `vite.config.ts`'s aliases. The spec runner is vendored as a tarball in
`vendor/` until it is published.

```sh
npm run test:runner:build -- page/page-basic.spec.ts browser-rendering/user-agent.spec.ts
cd tests
npx wrangler deploy -c wrangler.runner.toml
npx wrangler secret put RUN_TOKEN -c wrangler.runner.toml
curl -N -X POST "$URL/run" -H "Authorization: Bearer $RUN_TOKEN" -d '{"args":["--project=smoke"]}'
```

`--project=smoke` runs `runner/smoke/` (one pass, one known-error skip, one
deliberate failure; exit code 1); `--project=suite` runs the bundled specs.

`runner/run.mjs` starts a fresh isolate every three test groups
(`groupsPerIsolate: 3` with the config's `fullyParallel`, so three independent
tests per isolate), but not a fresh browser: it acquires one Browser Run session per worker slot through
the runner Worker's `/browser/v1/*`, lends them in `BROWSER_SESSION_IDS`, and
closes them when Playwright exits; it waits until each new session accepts
connections first. Each worker process connects to its slot's
session and only disconnects at teardown; after a failure it ends the session, and
later worker processes in that slot launch their own browser. A screenshot comparison can leave
more than half an isolate's memory charged until it is collected, and a
long-lived isolate need not collect before the next test. `--workers` must be a
number, since it is the number of sessions.

## Add Tests / Mark as skipped

It's possible to add more playwright tests by editing `src/tests.ts` and import them there, ensuring they have a `../workerTests` prefix.

Our generator script will be able to parse that file and process the new imported tests.

You can also ensure some tests are skipped by adding their full title into `skipTests` structure found in `src/tests.ts`.
