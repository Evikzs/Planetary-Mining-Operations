import { configDefaults, defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';

// Files that time code against a budget run one at a time, after the rest:
// other test files running beside them on CI's few cores only add time.
const TIMED = [
  'tests/perf/**/*.test.ts',
  'tests/sim/views.test.ts',
  'tests/sim/offline.test.ts',
  'tests/shared/terrain.test.ts',
  'tests/sim/world/roads.test.ts',
  'tests/sim/world/plots.test.ts',
];

export default defineConfig({
  base: process.env.PMO_BASE ?? '/',
  plugins: [preact()],
  worker: { format: 'es' },
  build: { target: 'es2022', manifest: true, sourcemap: true },
  test: {
    environment: 'node',
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['tests/**/*.test.ts'],
          exclude: [...configDefaults.exclude, ...TIMED],
        },
      },
      {
        extends: true,
        test: {
          name: 'timed',
          include: TIMED,
          fileParallelism: false,
          sequence: { groupOrder: 1 },
        },
      },
    ],
  },
});
