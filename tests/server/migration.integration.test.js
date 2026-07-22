import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../server/app.js';
import { loadConfig } from '../../server/config.js';
import { createDatabaseClient } from '../../server/db/client.js';
import { runMigrations } from '../../server/db/migrate.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (testDatabaseUrl) {
  describe('Drizzle migration integration', () => {
    const config = loadConfig({ NODE_ENV: 'test', DATABASE_URL: testDatabaseUrl });
    const database = createDatabaseClient(config);

    beforeAll(async () => {
      await runMigrations({ config, database });
      await runMigrations({ config, database });
    });

    afterAll(async () => {
      await database.close();
    });

    it('serves Fastify readiness from the disposable PostgreSQL database', async () => {
      const appDatabase = createDatabaseClient(config);
      const app = buildApp({ config, database: appDatabase, logger: false });

      const response = await app.inject('/api/v1/health');
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ status: 'ok' });
      await app.close();
    });

    it('records the no-domain baseline repeatably without creating future tables', async () => {
      const { rows } = await database.pool.query(`
        SELECT tablename
        FROM pg_tables
        WHERE schemaname = 'public'
        ORDER BY tablename
      `);
      const names = rows.map(row => row.tablename);

      expect(names).toEqual([]);
      expect(names).not.toContain('characters');
      expect(names).not.toContain('auth');
      expect(names).not.toContain('user');
      expect(names).not.toContain('session');

      const migrationTable = await database.pool.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'drizzle'
          AND table_name = '__drizzle_migrations'
      `);
      expect(migrationTable.rows).toEqual([{ table_name: '__drizzle_migrations' }]);

      const migrations = await database.pool.query(`
        SELECT id, hash, created_at
        FROM drizzle.__drizzle_migrations
        ORDER BY id
      `);
      expect(migrations.rows).toHaveLength(1);
      expect(migrations.rows[0]).toEqual({
        id: 1,
        hash: expect.any(String),
        created_at: '1784678400000'
      });
    });
  });
} else {
  describe.skip('Drizzle migration integration', () => {
    it('requires TEST_DATABASE_URL', () => {});
  });
}
