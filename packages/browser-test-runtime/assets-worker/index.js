import { serveTestAsset } from '../worker-routes/index.js';

export default {
  async fetch(request, env) {
    return await serveTestAsset(request, env.ASSETS);
  },
};
