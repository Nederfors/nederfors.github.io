import { describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../server/app.js';
import { loadConfig } from '../../server/config.js';

function config() {
  return loadConfig({ NODE_ENV: 'test', DATABASE_URL: 'postgresql://test:secret@127.0.0.1:5432/test' });
}

function database({ failure } = {}) {
  return {
    checkHealth: failure ? vi.fn().mockRejectedValue(failure) : vi.fn().mockResolvedValue(),
    close: vi.fn().mockResolvedValue()
  };
}

describe('Fastify application', () => {
  it('constructs without listening and preserves normal unknown-route behavior', async () => {
    const app = buildApp({ config: config(), database: database(), logger: false });

    expect(app.server.listening).toBe(false);
    const response = await app.inject('/api/v1/not-implemented');
    expect(response.statusCode).toBe(404);
    await app.close();
  });

  it('returns readiness success after a bounded database check', async () => {
    const client = database();
    const app = buildApp({ config: config(), database: client, logger: false });

    const response = await app.inject('/api/v1/health');
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
    expect(response.headers['cache-control']).toBe('no-store');
    expect(client.checkHealth).toHaveBeenCalledOnce();
    await app.close();
  });

  it('returns a non-sensitive 503 when database readiness fails', async () => {
    const app = buildApp({
      config: config(),
      database: database({ failure: new Error('postgresql://test:secret@private-host unavailable') }),
      logger: false
    });

    const response = await app.inject('/api/v1/health');
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ status: 'unavailable' });
    expect(response.body).not.toContain('secret');
    expect(response.body).not.toContain('private-host');
    await app.close();
  });

  it('bounds a stalled database readiness check', async () => {
    const stalledDatabase = {
      checkHealth: vi.fn(() => new Promise(() => {})),
      close: vi.fn().mockResolvedValue()
    };
    const boundedConfig = loadConfig({
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://test:secret@127.0.0.1:5432/test',
      DATABASE_HEALTHCHECK_TIMEOUT_MS: '100'
    });
    const app = buildApp({ config: boundedConfig, database: stalledDatabase, logger: false });

    const response = await app.inject('/api/v1/health');
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ status: 'unavailable' });
    await app.close();
  });

  it('releases its owned database resource during close', async () => {
    const client = database();
    const app = buildApp({ config: config(), database: client, logger: false });

    await app.close();
    expect(client.close).toHaveBeenCalledOnce();
  });
});
