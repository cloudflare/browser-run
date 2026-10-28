// Replaces `playwright-core/lib/coreBundle` for the upstream test files. The real barrel
// re-exports all of playwright-core (CLI, MCP tools, servers), and the tests only use these parts.
import { deviceDescriptors } from '@isomorphic/deviceDescriptors';
import { nullProgress } from '../../../../../submodules/playwright/packages/playwright-core/src/server/progress';
import { DirTraceLoaderBackend, extractTrace } from '../../../../../submodules/playwright/packages/playwright-core/src/tools/trace/traceParser';

export * as iso from '@isomorphic/index';
export * as utils from '@utils/index';
// from the runtime build, because the sources read package.json relative to __dirname
export { getPlaywrightVersion, getUserAgent } from '@cloudflare/playwright/internal';

export const server = { deviceDescriptors, nullProgress };
export const tools = { DirTraceLoaderBackend, extractTrace };
// library/videoPlayer.ts decodes videos with the ffmpeg executable, which Workers cannot run.
export const registry = {
  registry: {
    findExecutable(name: string): never {
      throw new Error(`Executable ${name} is not available in Cloudflare Workers`);
    },
  },
};
