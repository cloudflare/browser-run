// Shared vite configuration for builds that bundle the playwright submodule sources.
import fs from 'fs';
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const basedir = path.dirname(fileURLToPath(import.meta.url));
export const playwrightDir = path.resolve(basedir, '../../../submodules/playwright');
const playwrightPackagesDir = path.join(playwrightDir, 'packages');
const bundlesDir = path.resolve(basedir, '../src/bundles');
const utilsBundleImpl = path.join(bundlesDir, 'utilsBundleImpl.js');

// Path aliases from the submodule tsconfig.json that runtime code imports.
export const playwrightPathAliases = [
  { find: /^@isomorphic\/(.*)$/, replacement: `${playwrightPackagesDir}/isomorphic/$1` },
  { find: /^@utils\/(.*)$/, replacement: `${playwrightPackagesDir}/utils/$1` },
  { find: /^@protocol\/(.*)$/, replacement: `${playwrightPackagesDir}/protocol/src/$1` },
  { find: /^@testIsomorphic\/(.*)$/, replacement: `${playwrightPackagesDir}/playwright/src/isomorphic/$1` },
];

// Must come before the `playwright-core/lib` alias.
export const playwrightCoreBundleAlias = {
  find: /^playwright-core\/lib\/coreBundle$/,
  replacement: path.resolve(basedir, '../src/mocks/coreBundle.ts'),
};

// Prebuilt bundles from utils/build_bundles.js.
export const playwrightBundleAliases = [
  { find: /^jest-matcher-utils$/, replacement: path.join(bundlesDir, 'jest-matcher-utils.js') },
  { find: /^jest-message-util$/, replacement: path.join(bundlesDir, 'jest-message-util.js') },
  { find: /^@jest\/expect-utils$/, replacement: path.join(bundlesDir, 'jest-expect-utils.js') },
  { find: /^pngjs$/, replacement: path.join(bundlesDir, 'pngjs.js') },
];

// Replaces submodule modules with mocks, matched by the resolved file path rather than by the import
// specifier, so the mock still applies when upstream moves the importer. Fails the build if a mocked
// module no longer exists upstream, instead of silently bundling nothing or the real module.
// `mocks` maps paths relative to submodules/playwright/packages (without extension) to mock files.
export function playwrightModuleMocks(mocks) {
  const targets = new Map();
  for (const [target, mock] of Object.entries(mocks)) {
    const file = path.join(playwrightPackagesDir, target);
    if (!fs.existsSync(`${file}.ts`))
      throw new Error(`Mocked module ${target}.ts does not exist in submodules/playwright/packages`);
    targets.set(file, mock);
  }
  return {
    name: 'playwright-module-mocks',
    enforce: 'pre',
    resolveId(source, importer) {
      if (!importer || !source.startsWith('.'))
        return null;
      const file = path.resolve(path.dirname(importer), source).replace(/\.(ts|js)$/, '');
      return targets.get(file) ?? null;
    },
  };
}

// Upstream sources import their npm dependencies directly (`import debug from 'debug'`), and the
// upstream build rewrites those imports to keys of `playwright-core/lib/utilsBundle`
// (see `_rewriteVendoredImports` in submodules/playwright/utils/build/build.js).
// This plugin does the same rewrite, so the dependencies come from the prebuilt utilsBundleImpl.
// `target` is the module that provides the utilsBundle exports (defaults to the prebuilt bundle; set
// it to an external module id to reuse a bundle at runtime). `include` lists the directories to rewrite.
export function playwrightVendoredImports({ target = utilsBundleImpl, external = false, include = [playwrightPackagesDir] } = {}) {
  const require = createRequire(import.meta.url);
  const { MAPPING, VENDORED_PACKAGES } = require(path.join(playwrightDir, 'utils/build/utilsBundleMapping.js'));
  const escape = value => value.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  const packagesPattern = [...VENDORED_PACKAGES].map(escape).join('|');
  const importRe = new RegExp(`^import\\s+(\\{[^}]*\\}|\\*\\s+as\\s+\\w+|\\w+(?:\\s*,\\s*\\{[^}]*\\})?)\\s+from\\s+'(${packagesPattern})';?`, 'gm');
  const sourceRe = new RegExp(`^import\\s+[^'";]*\\s+from\\s+'(${packagesPattern})'`, 'm');

  const parseNamed = braced => braced.replace(/^\s*\{|\}\s*$/g, '').split(',')
    .map(spec => spec.trim())
    .filter(spec => spec && !spec.startsWith('type '))
    .map(spec => {
      const match = spec.match(/^(\w+)(?:\s+as\s+(\w+))?$/);
      if (!match)
        throw new Error(`Cannot parse import specifier "${spec}"`);
      return { src: match[1], alias: match[2] || match[1] };
    });

  class UnmappedImportError extends Error {}

  const rewrite = (file, clause, pkg) => {
    const def = MAPPING[pkg];
    const specifiers = [];
    const fail = () => {
      throw new UnmappedImportError(`${file}: "import ${clause} from '${pkg}'" has no utilsBundle mapping`);
    };
    if (clause.startsWith('{')) {
      for (const { src, alias } of parseNamed(clause))
        specifiers.push(`${def.named?.[src] ?? fail()} as ${alias}`);
    } else if (clause.startsWith('*')) {
      specifiers.push(`${def.namespace ?? fail()} as ${clause.match(/\*\s+as\s+(\w+)/)[1]}`);
    } else {
      const [, defaultName, named] = clause.match(/^(\w+)(?:\s*,\s*(\{[^}]*\}))?$/);
      specifiers.push(`${def.default ?? fail()} as ${defaultName}`);
      for (const { src, alias } of named ? parseNamed(named) : [])
        specifiers.push(`${def.named?.[src] ?? fail()} as ${alias}`);
    }
    return `import { ${specifiers.join(', ')} } from ${JSON.stringify(target)};`;
  };

  return {
    name: 'playwright-vendored-imports',
    enforce: 'pre',
    resolveId(source) {
      // `utilsBundle` (the upstream barrel) is replaced by the prebuilt bundle
      if (/(^|\/)utilsBundle(\.ts|\.js)?$/.test(source))
        return { id: target, external };
      return null;
    },
    transform(code, id) {
      if (!include.some(dir => id.startsWith(dir)) || id.includes('/node_modules/') || !/\.ts$/.test(id))
        return null;
      if (!sourceRe.test(code))
        return null;
      return {
        code: code.replace(importRe, (full, clause, pkg) => {
          try {
            return rewrite(id, clause, pkg);
          } catch (error) {
            // Upstream rewrites every import in its sources, so an unmapped one there is a bug. Other
            // files (upstream tests) may import packages directly; those are bundled as they are.
            if (error instanceof UnmappedImportError && !id.startsWith(playwrightPackagesDir))
              return full;
            throw error;
          }
        }),
        map: null,
      };
    },
  };
}
