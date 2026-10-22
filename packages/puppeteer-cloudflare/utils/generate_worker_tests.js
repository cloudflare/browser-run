import path from 'path';
import {fileURLToPath} from 'url';

import {build} from 'vite';

import {deleteDir, listFiles, writeFile} from './utils.js';

const basedir = path.dirname(fileURLToPath(import.meta.url));

const excludedFiles = [
  'acceptInsecureCerts.test.ts',
  'accessibility.test.ts',
  'ariaqueryhandler.test.ts',
  'autofill.test.ts',
  'browser.test.ts',
  'browsercontext-cookies.test.ts',
  'browsercontext.test.ts',
  'cdp/a11yLoaderId.test.ts',
  'cdp/backendNodeId.test.ts',
  'cdp/bfcache.test.ts',
  'cdp/CDPSession.test.ts',
  'cdp/devtools.test.ts',
  'cdp/extensions.test.ts',
  'cdp/heapSnapshot.test.ts',
  'cdp/interventionHeaders.test.ts',
  'cdp/network.test.ts',
  'cdp/pdf.test.ts',
  'cdp/pipe.test.ts',
  'cdp/prerender.test.ts',
  'cdp/queryObjects.test.ts',
  'cdp/screencast.test.ts',
  'cdp/TargetManager.test.ts',
  'cdp/userDataDir.test.ts',
  'chromiumonly.test.ts',
  'connect.test.ts',
  'debugInfo.test.ts',
  'defaultbrowsercontext.test.ts',
  'device-request-prompt.test.ts',
  'download.test.ts',
  'emulation.test.ts',
  'fixtures.test.ts',
  'followSymlinks.test.ts',
  'headful.test.ts',
  'idle_override.test.ts',
  'ignorehttpserrors.test.ts',
  'launcher.test.ts',
  'network.test.ts',
  'proxy.test.ts',
  'requestinterception-experimental.test.ts',
  'requestinterception.test.ts',
  'screenshot.test.ts',
  'stacktrace.test.ts',
  'target.test.ts',
  'waittask.test.ts',
  'worker.test.ts',
];

const sourceTestsDir = path.join(basedir, '..', '..', '..', 'submodules', 'puppeteer', 'test', 'src');
const cloudflareSourceTestsDir = path.join(basedir, '..', 'tests', 'src');
const workerTestsDir = path.join(basedir, '..', 'tests', 'workerTests');

function setTestFilePlugin() {
  return {
    name: 'transform-file',
    transform(src, id) {
      const testPath = [sourceTestsDir, cloudflareSourceTestsDir]
        .map(dir => {
          return path.relative(dir, id).replace(/\\/g, '/');
        })
        .find(p => {
          return !p.startsWith('..');
        });
      if (/\.(spec|test)\.ts$/.test(id)) {
        return {
          code: [
            `import { setCurrentTestFile } from '@cloudflare/browser-test-runtime';setCurrentTestFile(${JSON.stringify(testPath)});globalThis.__dirname = ${JSON.stringify(path.dirname(testPath))};`,
            src,
            'setCurrentTestFile(undefined);',
          ].join('\n'),
          map: null, // provide source map if available
        };
      }
    },
  };
}

deleteDir(workerTestsDir);

// generate workerTests/index.ts file
const testFiles = listFiles(sourceTestsDir, {recursive: true})
  .filter(file => {
    return /\.(test|spec)\.ts$/.test(file);
  })
  .filter(file => {
    return !excludedFiles.includes(
      path.relative(sourceTestsDir, file).replace(/\\/g, '/'),
    );
  })
  .map(file => {
    return `@workerTests/${path.relative(sourceTestsDir, file)}`
      .replace(/\\/g, '/')
      .replace(/\.ts$/, '');
  });

const cloudflareTestFiles = listFiles(cloudflareSourceTestsDir, {
  recursive: true,
})
  .filter(file => {
    return /\.(test|spec)\.ts$/.test(file);
  })
  .map(file => {
    return `@cloudflareTests/${path.relative(cloudflareSourceTestsDir, file)}`
      .replace(/\\/g, '/')
      .replace(/\.ts$/, '');
  });

function tracingTempDirectoryPlugin() {
  return {
    name: 'tracing-temp-directory',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('/tracing.test.ts')) {
        return;
      }
      return code.replaceAll('import.meta.dirname', JSON.stringify('/tmp'));
    },
  };
}

function remoteTestServerPlugin() {
  return {
    name: 'remote-test-server',
    enforce: 'pre',
    transform(code, id) {
      if (id.endsWith('/page.test.ts')) {
        return code.replace(
          "    it('should work with options parameter', async () => {\n      const {page, server} = await getTestState();\n\n      expect(\n        await page.evaluate(() => {\n          return navigator.userAgent;\n        }),\n      ).toContain('Mozilla');\n      await page.setUserAgent({userAgent: 'foobar'});",
          "    it('should work with options parameter', async () => {\n      const {page, server} = await getTestState();\n\n      await page.setUserAgent({userAgent: 'foobar'});",
        );
      }
      if (id.endsWith('/console.test.ts')) {
        // Worker fixtures use HTTPS, so an HTTP URL tests mixed-content blocking
        // instead of the network failure and console location asserted upstream.
        // Browser Run's network proxy can surface the failed lookup as a reset.
        return code
          .replaceAll('http://wat', 'https://does-not-exist.invalid')
          .replace(
            'expect(message.text()).toContain(`ERR_NAME_NOT_RESOLVED`);',
            "expect(message.text()).atLeastOneToContain(['ERR_NAME_NOT_RESOLVED', 'ERR_CONNECTION_RESET']);",
          );
      }
      if (id.endsWith('/navigation.test.ts')) {
        return code
          .replace(
            "it('should work when subframe issues window.stop()', async function () {",
            "it('should work when subframe issues window.stop()', async function ({}, testInfo) {",
          )
          .replace('timeout: this.timeout() - 1000,', 'timeout: testInfo.timeout - 1000,');
      }
      if (!id.endsWith('/cookies.test.ts')) {
        return;
      }

      return code
        .replace(
          "domain: 'localhost',\n        path: '/',\n        expires: -1,\n        httpOnly: false,\n        secure: false,\n        sourceScheme: 'Unset',",
          "domain: new URL(server.EMPTY_PAGE).hostname,\n        path: '/',\n        expires: -1,\n        httpOnly: false,\n        secure: new URL(server.EMPTY_PAGE).protocol === 'https:',\n        sourceScheme: 'Unset',",
        )
        .replace(
          "domain: 'localhost',\n            path: '/',\n            expires: -1,\n            size: 14,\n            httpOnly: false,\n            secure: false,\n            session: true,\n            sourceScheme: 'Unset',",
          "domain: new URL(server.EMPTY_PAGE).hostname,\n            path: '/',\n            expires: -1,\n            size: 14,\n            httpOnly: false,\n            secure: new URL(server.EMPTY_PAGE).protocol === 'https:',\n            session: true,\n            sourceScheme: 'Unset',",
        )
        .replace(
          '      await expectCookieEquals(await page.cookies(), [\n        {\n          name: \'partitionCookie\',',
          '      const cookies = await page.cookies();\n      await expectCookieEquals(cookies, [\n        {\n          name: \'partitionCookie\',',
        )
        .replace(
          "          partitionKey: isChrome\n            ? url.origin.replace(`:${url.port}`, '')\n            : url.origin,",
          '',
        )
        .replace(
          "      ]);\n    });\n    it('should not set a cookie on a blank page'",
          "      ]);\n      const partitionSite = new URL(cookies[0]!.partitionKey!);\n      expect(partitionSite.protocol).toBe(url.protocol);\n      expect(\n        url.hostname === partitionSite.hostname ||\n          url.hostname.endsWith(`.${partitionSite.hostname}`),\n      ).toBe(true);\n    });\n    it('should not set a cookie on a blank page'",
        )
        .replace(
          "      const origin = isChrome\n        ? url.origin.replace(`:${url.port}`, '')\n        : url.origin;",
          "      const origin = url.origin;",
        )
        .replace(
          "      expect(await page.cookies()).toHaveLength(1);\n      await page.deleteCookie({\n        url: url.toString(),\n        name: 'partitionCookie',\n        partitionKey: origin,\n      });",
          "      const [cookie] = await page.cookies();\n      expect(cookie).toBeDefined();\n      await page.deleteCookie({\n        url: url.toString(),\n        name: 'partitionCookie',\n        partitionKey: cookie!.partitionKey,\n      });",
        );
    },
  };
}

writeFile(
  path.join(workerTestsDir, 'index.ts'),
  `import '../src/server/workerFixtures';

${[...testFiles, ...cloudflareTestFiles]
  .map(file => {
    return `import ${JSON.stringify(file)};`;
  })
  .join('\n')}
`,
);

(async () => {
  await build({
    plugins: [
      setTestFilePlugin(),
      tracingTempDirectoryPlugin(),
      remoteTestServerPlugin(),
    ],
    root: sourceTestsDir,
    define: {
      'import.meta.dirname': 'globalThis.__dirname',
    },
    resolve: {
      alias: {
        // https://workers-nodejs-compat-matrix.pages.dev/
        async_hooks: 'node:async_hooks',
        assert: 'node:assert',
        buffer: 'node:buffer',
        child_process: 'node:child_process',
        constants: 'node:constants',
        crypto: 'node:crypto',
        dns: 'node:dns',
        domain: 'node:domain',
        events: 'node:events',
        http: 'node:http',
        http2: 'node:http2',
        https: 'node:https',
        inspector: 'node:inspector',
        module: 'node:module',
        net: 'node:net',
        os: 'node:os',
        path: 'node:path',
        querystring: 'node:querystring',
        process: 'node:process',
        readline: 'node:readline',
        stream: 'node:stream',
        string_decoder: 'node:string_decoder',
        tls: 'node:tls',
        url: 'node:url',
        util: 'node:util',
        vm: 'node:vm',
        zlib: 'node:zlib',

        '@workerTests': sourceTestsDir,
        '@cloudflareTests': path.resolve(basedir, '../tests/src'),

        '@pptr/testserver': path.resolve(
          basedir,
          '../tests/src/server/mocha-utils',
        ),

        'puppeteer-core/internal/node/util/fs.js': path.resolve(
          basedir,
          '../../../submodules/puppeteer/packages/puppeteer-core/src/node/util/fs.ts',
        ),
        'puppeteer-core/internal': '@cloudflare/puppeteer/internal',
        'puppeteer-core': '@cloudflare/puppeteer',
        'puppeteer/internal/puppeteer.js': '@cloudflare/puppeteer',
        'puppeteer/lib/cjs/puppeteer/puppeteer.js': '@cloudflare/puppeteer',
        puppeteer: '@cloudflare/puppeteer',

        'fs/promises': path.resolve(basedir, '../tests/src/server/fsPromises'),
        'node:fs/promises': path.resolve(
          basedir,
          '../tests/src/server/fsPromises',
        ),

        // eslint-disable-next-line prettier/prettier
        'fs': 'node:fs',

        './mocha-utils.js': path.resolve(
          basedir,
          '../tests/src/server/mocha-utils',
        ),
        // Tests in subdirectories, e.g. cdp/, import it from the parent.
        '../mocha-utils.js': path.resolve(
          basedir,
          '../tests/src/server/mocha-utils',
        ),

        sinon: path.resolve(basedir, '../tests/src/server/mocks/sinon.ts'),
      },
    },
    build: {
      emptyOutDir: false,
      minify: false,
      // prevents __defProp, __defNormalProp, __publicField in compiled code
      target: 'esnext',
      lib: {
        name: 'tests',
        entry: path.join(basedir, '../tests/workerTests/index.ts'),
        formats: ['es'],
      },
      terserOptions: {
        format: {
          // we need to ensure no comments are preserved
          comments: false,
        },
      },
      rollupOptions: {
        output: {
          preserveModules: true,
          dir: workerTestsDir,
          preserveModulesRoot: sourceTestsDir,
          entryFileNames: '[name].js',
          chunkFileNames: '[name].js',
        },
        external: [
          'node:async_hooks',
          'node:assert',
          'node:buffer',
          'node:child_process',
          'node:constants',
          'node:crypto',
          'node:dns',
          'node:domain',
          'node:events',
          'node:fs',
          'node:http',
          'node:http2',
          'node:https',
          'node:inspector',
          'node:module',
          'node:net',
          'node:os',
          'node:path',
          'node:querystring',
          'node:process',
          'node:readline',
          'node:stream',
          'node:string_decoder',
          'node:timers',
          'node:tls',
          'node:url',
          'node:util',
          'node:vm',
          'node:zlib',

          'cloudflare:workers',
          '@cloudflare/browser-test-runtime',
          '@cloudflare/puppeteer',
          /^@cloudflare\/puppeteer\/internal\/.+/,
          'expect',
          'diff',
          'jpeg-js',
          'mime',
          'mocha',
          'pixelmatch',
          'pngjs',
        ],
      },
      commonjsOptions: {
        transformMixedEsModules: true,
        extensions: ['.ts', '.js'],
        include: [path.resolve(basedir, '../../../submodules/puppeteer/test/**/*'), /node_modules/],
      },
    },
  });
})();
