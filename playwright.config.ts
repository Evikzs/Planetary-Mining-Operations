import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  retries: 0,
  // Rendering runs on SwiftShader, and CI runners vary about 2x in speed.
  timeout: 60_000,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: 'http://localhost:4173', trace: 'retain-on-failure' },
  webServer: {
    command: 'npm run build:e2e && npx vite preview --mode e2e --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'desktop',
      use: { browserName: 'chromium', viewport: { width: 1920, height: 1080 } },
    },
    {
      // The smallest window the game supports.
      name: 'desktop-min',
      use: { browserName: 'chromium', viewport: { width: 1280, height: 720 } },
    },
  ],
});
