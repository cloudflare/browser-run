import path from "path";
import { fileURLToPath } from "url";
import { deleteDir, listFiles, writeFile } from "./utils.js";
import { EXCLUDED_FILES as excludedFiles } from "../tests/runner/specs.mjs";

const basedir = path.dirname(fileURLToPath(import.meta.url));

const sourceTestsDir = path.join(basedir, '..', '..', '..', 'submodules', 'playwright', 'tests');
const cloudflareSourceTestsDir = path.join(basedir, '..', 'tests', 'src');
const workerTestsDir = path.join(basedir, '..', 'tests', 'workerTests');

deleteDir(workerTestsDir);

// generate workerTests/index.ts file
const testFiles = ['page', 'library']
  .flatMap(dir => listFiles(path.join(sourceTestsDir, dir)))
  .filter(file => /\.(test|spec)\.ts$/.test(file))
  .filter(file => !excludedFiles.includes(path.relative(sourceTestsDir, file).replace(/\\/g, '/')))
  .map(file => `@workerTests/${path.relative(sourceTestsDir, file)}`.replace(/\\/g, '/').replace(/\.ts$/, ''));

const cloudflareTestFiles = listFiles(cloudflareSourceTestsDir, { recursive: true })
  .filter(file => /\.(test|spec)\.ts$/.test(file))
  .map(file => `@cloudflareTests/${path.relative(cloudflareSourceTestsDir, file)}`.replace(/\\/g, '/').replace(/\.ts$/, ''));

writeFile(path.join(
  workerTestsDir, 'index.ts'),
  [...testFiles, ...cloudflareTestFiles]
    .map(file => `import ${JSON.stringify(file)};`)
    .join('\n')
);
