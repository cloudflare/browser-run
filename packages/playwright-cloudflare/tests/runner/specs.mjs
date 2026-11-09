// Which spec files make up the suite, and which assets they read. Tests that
// cannot pass are skipped by title in ../src/skipTests.ts instead; a whole file
// is excluded here only when none of it can run against Browser Run.
import fs from 'node:fs';
import path from 'node:path';

export const EXCLUDED_FILES = [
  'page/page-leaks.spec.ts',
  'library/browsertype-connect.spec.ts',
  'library/browsertype-launch-selenium.spec.ts',
  'library/browsertype-launch-server.spec.ts',
  'library/browsertype-launch.spec.ts',
  'library/client-certificates.spec.ts',
  'library/debug-controller.spec.ts',
  'library/headful.spec.ts',
  // inspects the Node.js heap through node:inspector, which Workers do not provide
  'library/heap.spec.ts',
  'library/har.spec.ts',
  'library/launcher.spec.ts',
  // tests the @playwright/client bundle from the file system (reads __dirname at module scope)
  'library/playwright-client.spec.ts',
  'library/snapshotter.spec.ts',
  'library/trace-viewer.spec.ts',
  'library/trace-viewer-scrub.spec.ts',
  'library/video.spec.ts',
  'library/web-socket.spec.ts',
];

const SPEC = /\.(spec|test)\.ts$/;

// Upstream's page/ and library/ specs and browser-run's own, named as in
// skipTests.ts: page/page-basic.spec.ts, browser-rendering/user-agent.spec.ts.
export function suiteSpecs({ upstreamTestsDir, cloudflareTestsDir }) {
  const upstream = ['page', 'library']
      .flatMap(dir => fs.readdirSync(path.join(upstreamTestsDir, dir)).map(file => `${dir}/${file}`))
      .filter(name => SPEC.test(name) && !EXCLUDED_FILES.includes(name));
  const own = fs.globSync('**/*', { cwd: cloudflareTestsDir }).filter(name => SPEC.test(name));
  return [...upstream, ...own].sort();
}

// What specs open through asset(name), which reads /bundle/assets/<name>:
// every quoted string in them naming something under assets/, since names
// also reach asset() through variables. The folder itself ('.', as in CSS
// selectors) and folders that only hold other folders are not names.
export function assetNames(specFiles, assetsDir) {
  const names = new Set();
  for (const file of specFiles) {
    for (const [, name] of fs.readFileSync(file, 'utf8').matchAll(/'([^'\n]+)'/g)) {
      if (name.startsWith('/') || name.startsWith('.') || name.includes('..'))
        continue;
      const target = path.join(assetsDir, name);
      if (!fs.existsSync(target))
        continue;
      if (fs.statSync(target).isDirectory() && !fs.readdirSync(target).some(entry => fs.statSync(path.join(target, entry)).isFile()))
        continue;
      names.add(name);
    }
  }
  return [...names];
}
