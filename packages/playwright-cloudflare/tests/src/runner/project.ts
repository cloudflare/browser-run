// The suite built by runner/build.mjs, as the runner Worker (index.ts) and the
// local check Worker (check.ts) give it to their isolates.
import type { ProjectBundle, ProjectTree } from '@cloudflare/kitebuild-playwright-spec-runner';

import BUILD_ID from '../../runner/dist/build-id.txt';
import PROJECT from '../../runner/dist/project.json';
import TREE from '../../runner/dist/tree.json';

export const BUILD = BUILD_ID.trim();
export const PROJECT_ROOT = '/project';
export const LOADED_COMPATIBILITY_DATE = '2026-04-04';

const tree = TREE as ProjectTree;

// Snapshots and assets, base64 in project.json.
const files = Object.fromEntries(Object.entries((PROJECT as { files: Record<string, string> }).files).map(([key, base64]) =>
  [key, Uint8Array.from(atob(base64), char => char.charCodeAt(0)).buffer]));

export function project(origin: string) {
  return {
    compatibilityDate: LOADED_COMPATIBILITY_DATE,
    tree,
    bundle: { ...(PROJECT as ProjectBundle), files },
    files: {
      async readFile(file: string) {
        const node = tree.nodes[file];
        if (node?.type !== 'file' || node.text === undefined)
          throw Object.assign(new Error(`ENOENT: no such file, open '${file}'`), { code: 'ENOENT' });
        return new TextEncoder().encode(node.text).buffer as ArrayBuffer;
      },
      // The runner in Node writes the reports; what an isolate writes outside
      // /tmp is not kept.
      writeFile() {},
      mkdir() {},
      remove() {},
    },
    // The test server is this Worker's own assets. PWTEST_UNDER_TEST, which
    // gives pages upstream's test globals (window.builtins), is read once when
    // @cloudflare/playwright evaluates, so it must be set from the start.
    env: { CI: '1', ASSETS_URL: origin, PWTEST_UNDER_TEST: 'true' },
  };
}
