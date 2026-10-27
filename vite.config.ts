import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';

export default defineConfig({
  base: process.env.PMO_BASE ?? '/',
  plugins: [preact()],
  worker: { format: 'es' },
  build: { target: 'es2022', manifest: true, sourcemap: true },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
});
