export const TEST_AUTH_SECRET = 'test-only-better-auth-secret-at-least-32-characters';
export const TEST_AUTH_ORIGIN = 'http://127.0.0.1:3100';

export function testEnvironment(overrides = {}) {
  return {
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://test:secret@127.0.0.1:5432/test',
    BETTER_AUTH_SECRET: TEST_AUTH_SECRET,
    BETTER_AUTH_URL: TEST_AUTH_ORIGIN,
    ...overrides
  };
}
