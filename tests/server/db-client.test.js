import { describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../../server/config.js';
import { createDatabaseClient } from '../../server/db/client.js';
import { testEnvironment } from './helpers.js';

class FakePool {
  constructor(options) {
    this.options = options;
    this.query = vi.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] });
    this.end = vi.fn().mockResolvedValue();
  }
}

describe('database client', () => {
  it('owns one bounded pool, uses it for Drizzle, and closes it once', async () => {
    const config = loadConfig({
      ...testEnvironment(),
      DATABASE_POOL_MAX: '3',
      DATABASE_CONNECTION_TIMEOUT_MS: '1200',
      DATABASE_HEALTHCHECK_TIMEOUT_MS: '800'
    });
    const drizzleFactory = vi.fn(({ client }) => ({ client }));
    const database = createDatabaseClient(config, { PoolConstructor: FakePool, drizzleFactory });

    expect(database.pool.options).toMatchObject({
      max: 3,
      connectionTimeoutMillis: 1200,
      query_timeout: 800,
      ssl: undefined
    });
    expect(drizzleFactory).toHaveBeenCalledWith({ client: database.pool });

    await database.checkHealth();
    expect(database.pool.query).toHaveBeenCalledWith({ text: 'SELECT 1', query_timeout: 800 });

    await Promise.all([database.close(), database.close()]);
    expect(database.pool.end).toHaveBeenCalledOnce();
  });

  it('uses certificate verification for the production TLS mode', () => {
    const config = loadConfig({
      ...testEnvironment(),
      NODE_ENV: 'production',
      BETTER_AUTH_URL: 'https://symbapedia.example',
      DATABASE_SSL_CA: 'test-ca'
    });
    const database = createDatabaseClient(config, { PoolConstructor: FakePool, drizzleFactory: () => ({}) });

    expect(database.pool.options.ssl).toEqual({ rejectUnauthorized: true, ca: 'test-ca' });
  });
});
