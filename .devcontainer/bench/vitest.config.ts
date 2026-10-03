import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // Generous on purpose: the end-to-end and architecture tests start Node processes, which
    // takes seconds per start on a slow bind mount under load (milliseconds in the image build).
    testTimeout: 120_000,
    hookTimeout: 120_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/interface/cli.ts'],
      reporter: ['text-summary', 'text'],
      reportsDirectory: 'coverage',
      thresholds: {
        'src/domain/**/*.ts': { lines: 80 },
        'src/application/**/*.ts': { lines: 80 },
      },
    },
  },
});
