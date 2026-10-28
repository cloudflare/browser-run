// `playwright-core/lib/coreBundle` re-exports all of playwright-core (CLI, MCP tools, servers).
// Workers code only needs these exports, so the full barrel is not bundled.
export {
  getPlaywrightVersion,
  getUserAgent,
} from 'playwright-core/lib/server/userAgent';
