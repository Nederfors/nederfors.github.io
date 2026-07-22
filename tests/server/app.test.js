/* global Headers, Response */
import { describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../server/app.js';
import { loadConfig } from '../../server/config.js';
import { testEnvironment } from './helpers.js';

function config() {
  return loadConfig(testEnvironment());
}

function database({ failure } = {}) {
  return {
    db: {},
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
      db: {},
      checkHealth: vi.fn(() => new Promise(() => {})),
      close: vi.fn().mockResolvedValue()
    };
    const boundedConfig = loadConfig({
      ...testEnvironment(),
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

  it('bridges Fetch responses without losing status, headers, or multiple cookies', async () => {
    const handler = vi.fn(async fetchRequest => {
      const headers = new Headers({ 'content-type': 'application/json', 'x-auth-test': 'preserved' });
      headers.append('set-cookie', 'first=one; Path=/; HttpOnly; SameSite=Lax');
      headers.append('set-cookie', 'second=two; Path=/; HttpOnly; SameSite=Lax');
      expect(fetchRequest.url).toBe('http://127.0.0.1:3100/api/auth/test-bridge');
      expect(fetchRequest.headers.get('origin')).toBe('http://127.0.0.1:3100');
      expect(await fetchRequest.json()).toEqual({ ok: true });
      return new Response(JSON.stringify({ bridged: true }), { status: 202, headers });
    });
    const app = buildApp({
      config: config(),
      database: database(),
      logger: false,
      auth: { handler }
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/test-bridge',
      headers: { origin: 'http://127.0.0.1:3100' },
      payload: { ok: true }
    });

    expect(response.statusCode).toBe(202);
    expect(response.headers['x-auth-test']).toBe('preserved');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['set-cookie']).toEqual([
      'first=one; Path=/; HttpOnly; SameSite=Lax',
      'second=two; Path=/; HttpOnly; SameSite=Lax'
    ]);
    expect(response.json()).toEqual({ bridged: true });
    expect(handler).toHaveBeenCalledOnce();
    await app.close();
  });

  it('keeps auth exceptions and sensitive values behind the server error boundary', async () => {
    const secretValues = ['plain-password', config().auth.secret, config().database.url, 'session-token'];
    const logLines = [];
    const app = buildApp({
      config: config(),
      database: database(),
      logger: { level: 'trace', stream: { write: line => logLines.push(line) } },
      auth: {
        handler: vi.fn().mockRejectedValue(new Error(secretValues.join(' ')))
      }
    });

    const response = await app.inject({ method: 'POST', url: '/api/auth/failure', payload: {} });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ error: 'Internal server error' });
    expect(response.headers['cache-control']).toBe('no-store');
    for (const value of secretValues) {
      expect(response.body).not.toContain(value);
      expect(logLines.join('\n')).not.toContain(value);
    }
    await app.close();
  });
});
