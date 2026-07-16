import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      // 'face-api.js' is loaded via CDN import map in the browser (see index.html),
      // not installed as an npm package — alias it to a local stub so Vite/Vitest
      // can resolve the bare specifier; tests override behavior via vi.doMock.
      'face-api.js': fileURLToPath(new URL('./tests/__mocks__/face-api.js', import.meta.url)),
    },
  },
  test: {
    restoreMocks: true,
  },
});
