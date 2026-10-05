import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
  server: { allowedHosts: ['.trycloudflare.com'] },
  test: { include: ['tests/unit/**/*.test.ts'] },
});
