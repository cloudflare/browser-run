import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const packageDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const generatedDir = path.join(packageDir, '.types');
const outputDir = path.join(packageDir, 'lib');
const puppeteerTypesDir = path.resolve(
  packageDir,
  '../../submodules/puppeteer/packages/puppeteer-core/lib/puppeteer'
);
const thirdPartyTypesDir = path.resolve(
  packageDir,
  '../../submodules/puppeteer/packages/puppeteer-core/lib/third_party'
);

function replaceExactlyOnce(contents, search, replacement, source) {
  const first = contents.indexOf(search);
  if (first === -1 || contents.indexOf(search, first + search.length) !== -1) {
    throw new Error(`Expected exactly one declaration match in ${source}`);
  }
  return contents.replace(search, replacement);
}

function sanitizeConnectOptions(contents, source) {
  const channelOption = `    /**
     * If specified, puppeteer looks for an open WebSocket at the well-known
     * default user data directory for the specified channel and attempts to
     * connect to it using ws://localhost:$ActivePort/devtools/browser. Only works
     * for Chrome and when run in Node.js.
     *
     * This option is experimental when used with puppeteer.connect().
     *
     * @experimental
     */
    channel?: ChromeReleaseChannel;
`;
  const capabilityTypes = `/**
 * @public
 */
export type SupportedWebDriverCapability = Exclude<Session.CapabilityRequest, 'unhandledPromptBehavior' | 'acceptInsecureCerts'>;
/**
 * WebDriver BiDi capabilities that are not set by Puppeteer itself.
 *
 * @public
 */
export interface SupportedWebDriverCapabilities {
    firstMatch?: SupportedWebDriverCapability[];
    alwaysMatch?: SupportedWebDriverCapability;
}
`;
  const capabilitiesOption = `    /**
     * WebDriver BiDi capabilities passed to BiDi \`session.new\`.
     *
     * @remarks
     * Only works for \`protocol="webDriverBiDi"\` and {@link Puppeteer.connect}.
     */
    capabilities?: SupportedWebDriverCapabilities;
`;
  const headersOption = `    /**
     * Headers to use for the web socket connection.
     * @remarks
     * Only works in the Node.js environment.
     *
     * @deprecated Use {@link WsOptions.headers} via
     * {@link ConnectOptions.wsOptions} instead. When both are set,
     * \`wsOptions.headers\` wins.
     */
    headers?: Record<string, string>;
`;
  const wsOptionsOption = `    /**
     * Options for the WebSocket connection to the browser.
     *
     * @remarks
     * Only used in the Node.js environment. The browser build has no ping frame
     * API, so the keep-alive options are ignored there.
     */
    wsOptions?: WsOptions;
`;

  contents = replaceExactlyOnce(
    contents,
    "import type { Session } from 'webdriver-bidi-protocol';\n",
    '',
    source
  );
  contents = replaceExactlyOnce(
    contents,
    "export type ProtocolType = 'cdp' | 'webDriverBiDi';",
    "export type ProtocolType = 'cdp';",
    source
  );
  contents = replaceExactlyOnce(contents, channelOption, '', source);
  contents = replaceExactlyOnce(contents, capabilityTypes, '', source);
  contents = replaceExactlyOnce(
    contents,
    "     * - Launching Firefox - 'webDriverBiDi'.\n     *\n",
    '',
    source
  );
  contents = replaceExactlyOnce(
    contents,
    'Custom ID generator for CDP / BiDi messages.',
    'Custom ID generator for CDP messages.',
    source
  );
  contents = replaceExactlyOnce(contents, capabilitiesOption, '', source);
  contents = replaceExactlyOnce(contents, wsOptionsOption, '', source);
  return replaceExactlyOnce(contents, headersOption, '', source);
}

function copyDeclarations(
  sourceDir,
  destinationDir,
  rewriteThirdParty = false,
  rootDir = sourceDir
) {
  for (const entry of fs.readdirSync(sourceDir, {withFileTypes: true})) {
    const source = path.join(sourceDir, entry.name);
    const destination = path.join(destinationDir, entry.name);
    const relative = path.relative(rootDir, source).replaceAll(path.sep, '/');
    if (entry.isDirectory()) {
      if (relative === 'bidi') {
        continue;
      }
      copyDeclarations(source, destination, rewriteThirdParty, rootDir);
    } else if (entry.name.endsWith('.d.ts')) {
      fs.mkdirSync(destinationDir, {recursive: true});
      let contents = fs.readFileSync(source, 'utf8').replaceAll('\r\n', '\n');
      if (rewriteThirdParty) {
        contents = contents.replace(
          /((?:\.\.\/)+)third_party\//g,
          (_, prefix) => `${prefix.slice(3)}third_party/`
        );
      }
      if (relative === 'common/ConnectOptions.d.ts') {
        contents = sanitizeConnectOptions(contents, source);
      } else if (relative === 'common/Debug.d.ts') {
        // The Workers build has no BiDi, so drop its debug channel prefixes.
        contents = replaceExactlyOnce(
          contents,
          '    readonly bidiSend: "puppeteer:webDriverBiDi:SEND ►";\n' +
            '    readonly bidiReceive: "puppeteer:webDriverBiDi:RECV ◀";\n',
          '',
          source
        );
      } else if (relative === 'index-browser.d.ts') {
        contents = replaceExactlyOnce(
          contents,
          "export type { Session } from 'webdriver-bidi-protocol';\n",
          '',
          source
        );
      }
      fs.writeFileSync(destination, contents);
    }
  }
}

function declarationFiles(directory) {
  return fs.readdirSync(directory, {withFileTypes: true}).flatMap(entry => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return declarationFiles(file);
    }
    return entry.name.endsWith('.d.ts') ? [file] : [];
  });
}

function copyCloudflareDeclarations(sourceDir, destinationDir, depth = 0) {
  for (const entry of fs.readdirSync(sourceDir, {withFileTypes: true})) {
    const source = path.join(sourceDir, entry.name);
    const destination = path.join(destinationDir, entry.name);
    if (entry.isDirectory()) {
      copyCloudflareDeclarations(source, destination, depth + 1);
    } else if (entry.name.endsWith('.d.ts')) {
      fs.mkdirSync(destinationDir, {recursive: true});
      const puppeteerPrefix = `${'../'.repeat(depth + 1)}puppeteer-core/`;
      let contents = fs.readFileSync(source, 'utf8').replaceAll(
        'puppeteer-core/lib/',
        puppeteerPrefix
      );
      fs.writeFileSync(destination, contents);
    }
  }
}

fs.rmSync(path.join(outputDir, 'puppeteer-core/bidi'), {
  recursive: true,
  force: true,
});
copyDeclarations(
  puppeteerTypesDir,
  path.join(outputDir, 'puppeteer-core'),
  true
);
copyDeclarations(
  thirdPartyTypesDir,
  path.join(outputDir, 'puppeteer-core/third_party')
);
let indexDeclaration = fs.readFileSync(
  path.join(generatedDir, 'index.d.ts'),
  'utf8'
);
indexDeclaration = indexDeclaration
  .replaceAll('puppeteer-core/lib/', './puppeteer-core/')
  .replaceAll('./cloudflare/', './puppeteer-cloudflare/cloudflare/');
fs.writeFileSync(path.join(outputDir, 'index.d.ts'), indexDeclaration);
copyCloudflareDeclarations(
  path.join(generatedDir, 'cloudflare'),
  path.join(outputDir, 'puppeteer-cloudflare/cloudflare'),
  1
);

for (const declaration of declarationFiles(outputDir)) {
  const contents = fs.readFileSync(declaration, 'utf8');
  if (
    contents.includes('webdriver-bidi-protocol') ||
    contents.includes('webDriverBiDi')
  ) {
    throw new Error(`BiDi type leaked into ${declaration}`);
  }
}
fs.rmSync(generatedDir, {recursive: true});
