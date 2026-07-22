import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

function poolOptions(config) {
  const { database } = config;
  return {
    connectionString: database.url,
    max: database.poolMax,
    idleTimeoutMillis: database.idleTimeoutMs,
    connectionTimeoutMillis: database.connectionTimeoutMs,
    statement_timeout: database.statementTimeoutMs,
    query_timeout: database.healthCheckTimeoutMs,
    ssl: database.sslMode === 'verify-full'
      ? { rejectUnauthorized: true, ...(database.sslCa ? { ca: database.sslCa } : {}) }
      : undefined
  };
}

export function createDatabaseClient(config, { PoolConstructor = Pool, drizzleFactory = drizzle } = {}) {
  const pool = new PoolConstructor(poolOptions(config));
  const db = drizzleFactory({ client: pool });
  let closePromise;

  return {
    db,
    pool,
    async checkHealth() {
      await pool.query({ text: 'SELECT 1', query_timeout: config.database.healthCheckTimeoutMs });
    },
    close() {
      closePromise ||= pool.end();
      return closePromise;
    }
  };
}
