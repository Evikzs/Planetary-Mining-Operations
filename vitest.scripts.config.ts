import { defineConfig } from 'vitest/config';

// Dev tools that run through Vitest so they can import TypeScript sources.
export default defineConfig({ test: { include: ['scripts/**/*.run.ts'], environment: 'node' } });
