import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.js', 'tests/server/**/*.test.js'],
    exclude: ['tests/**/*.spec.js']
  }
});
