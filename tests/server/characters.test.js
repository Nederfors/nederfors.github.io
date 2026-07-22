import { describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../server/app.js';
import { loadConfig } from '../../server/config.js';
import { testEnvironment } from './helpers.js';

const timestamp = '2026-07-22T12:00:00.000Z';

function document(overrides = {}) {
  return {
    format: 'symbapedia-character',
    formatVersion: 2,
    rulesetVersion: 3,
    name: 'Hosted Character',
    data: {},
    ...overrides
  };
}

function row(overrides = {}) {
  return {
    id: 'character-id',
    revision: 1,
    schemaVersion: 2,
    document: document(),
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides
  };
}

function dependencies({ session, query } = {}) {
  const pool = { query: query || vi.fn() };
  const database = {
    pool,
    db: {},
    checkHealth: vi.fn().mockResolvedValue(),
    close: vi.fn().mockResolvedValue()
  };
  const auth = {
    api: { getSession: vi.fn().mockResolvedValue(session) },
    handler: vi.fn()
  };
  return { auth, database, pool };
}

function appFor(dependencies) {
  return buildApp({
    config: loadConfig(testEnvironment()),
    database: dependencies.database,
    auth: dependencies.auth,
    logger: false
  });
}

describe('hosted character routes', () => {
  it('requires a Better Auth session for every CRUD route and performs no SQL', async () => {
    const deps = dependencies({ session: null });
    const app = appFor(deps);
    try {
      const requests = [
        { method: 'GET', url: '/api/v1/characters' },
        { method: 'POST', url: '/api/v1/characters', payload: {} },
        { method: 'GET', url: '/api/v1/characters/id' },
        { method: 'PUT', url: '/api/v1/characters/id', payload: {} },
        { method: 'DELETE', url: '/api/v1/characters/id', payload: {} }
      ];

      for (const request of requests) {
        const response = await app.inject(request);
        expect(response.statusCode).toBe(401);
        expect(response.headers['cache-control']).toBe('no-store');
        expect(response.json()).toEqual({ error: 'unauthorized' });
      }
      expect(deps.pool.query).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('marks unmatched hosted-character paths as non-cacheable', async () => {
    const deps = dependencies({ session: null });
    const app = appFor(deps);
    try {
      const response = await app.inject('/api/v1/characters/not/a/route');
      expect(response.statusCode).toBe(404);
      expect(response.headers['cache-control']).toBe('no-store');
    } finally {
      await app.close();
    }
  });

  it('rejects malformed and unsupported documents before persistence', async () => {
    const deps = dependencies({ session: { user: { id: 'owner-id' } } });
    const app = appFor(deps);
    try {
      for (const invalidDocument of [
        { ...document(), format: 'other-format' },
        { ...document(), formatVersion: 1 },
        { ...document(), data: [] },
        { format: 'symbapedia-character', formatVersion: 2 }
      ]) {
        const response = await app.inject({
          method: 'POST',
          url: '/api/v1/characters',
          payload: { id: 'invalid', document: invalidDocument }
        });
        expect(response.statusCode).toBe(400);
        expect(response.headers['cache-control']).toBe('no-store');
      }
      expect(deps.pool.query).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('derives owner, revision, and schema version while preserving unknown document fields', async () => {
    const wholeDocument = document({
      futureEnvelopeField: { enabled: true },
      data: { futureDataField: ['preserved'] }
    });
    const query = vi.fn().mockResolvedValue({
      rowCount: 1,
      rows: [row({ document: wholeDocument })]
    });
    const deps = dependencies({ session: { user: { id: 'authenticated-owner' } }, query });
    const app = appFor(deps);
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/characters',
        payload: {
          id: 'character-id',
          ownerId: 'attacker-owner',
          revision: 99,
          schemaVersion: 99,
          document: wholeDocument
        }
      });

      expect(response.statusCode).toBe(201);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.json()).toEqual({ character: row({ document: wholeDocument }) });
      expect(query).toHaveBeenCalledOnce();
      expect(query.mock.calls[0][1]).toEqual([
        'authenticated-owner',
        'character-id',
        2,
        JSON.stringify(wholeDocument)
      ]);
    } finally {
      await app.close();
    }
  });

  it('returns stable owner-scoped not-found and revision-conflict errors', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ '?column?': 1 }] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] });
    const deps = dependencies({ session: { user: { id: 'owner-id' } }, query });
    const app = appFor(deps);
    try {
      const conflict = await app.inject({
        method: 'PUT',
        url: '/api/v1/characters/character-id',
        payload: { expectedRevision: 1, document: document() }
      });
      expect(conflict.statusCode).toBe(409);
      expect(conflict.json()).toEqual({ error: 'revision_conflict' });
      expect(conflict.headers['cache-control']).toBe('no-store');

      const missing = await app.inject({
        method: 'DELETE',
        url: '/api/v1/characters/other-id',
        payload: { expectedRevision: 1 }
      });
      expect(missing.statusCode).toBe(404);
      expect(missing.json()).toEqual({ error: 'not_found' });
      expect(missing.headers['cache-control']).toBe('no-store');
      expect(query.mock.calls[1][1]).toEqual(['owner-id', 'character-id']);
      expect(query.mock.calls[3][1]).toEqual(['owner-id', 'other-id']);
    } finally {
      await app.close();
    }
  });
});
