import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../config.js';
import { createDatabaseClient } from './client.js';

export async function runMigrations({ config = loadConfig(), database } = {}) {
  const client = database || createDatabaseClient(config);
  try {
    await migrate(client.db, { migrationsFolder: fileURLToPath(new URL('../../drizzle', import.meta.url)) });
  } finally {
    if (!database) await client.close();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runMigrations().catch(() => {
    console.error('Migration failed. Check database availability and migration configuration.');
    process.exitCode = 1;
  });
}
