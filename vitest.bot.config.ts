import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['bot/**/*.test.ts'],
    environment: 'node',
    testTimeout: 120000,
    passWithNoTests: true,
  },
});
