import { defineConfig } from '@playwright/test';

// The desktop app: a built app under Electron. CI runs it on the packaged Linux directory.
export default defineConfig({
  testDir: 'e2e-electron',
  retries: 0,
  workers: 1,
  timeout: 120_000,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
});
