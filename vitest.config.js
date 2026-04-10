import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      exclude: ['node_modules/', 'test/'],
      include: ['src/**/*.js'],
      provider: 'v8',
      reporter: ['text', 'lcov'],
      thresholds: {
        branches: 65,
        functions: 80,
        lines: 80,
        statements: 80,
      },
    },
    env: {
      DB_PATH: ':memory:',
      NODE_ENV: 'test',
    },
    environment: 'node',
    globals: true,
    isolate: true,
    pool: 'forks',
  },
});
