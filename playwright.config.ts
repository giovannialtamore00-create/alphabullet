import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  use: { baseURL: 'http://localhost:4173', viewport: { width: 1280, height: 720 } },
  webServer: { command: 'npm run build && npx vite preview --port 4173 --strictPort', url: 'http://localhost:4173', reuseExistingServer: true, timeout: 120_000 },
  projects: [{ name: 'chromium', use: { browserName: 'chromium', launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } } }],
});
