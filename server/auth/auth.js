import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { betterAuth } from 'better-auth';
import * as schema from '../db/schema.js';
import { buildAuthOptions } from './options.js';

export function createAuth({ config, database }) {
  if (!config?.auth) throw new Error('Validated auth configuration is required.');
  if (!database?.db) throw new Error('The owned Drizzle database client is required.');

  return betterAuth({
    ...buildAuthOptions(config),
    database: drizzleAdapter(database.db, {
      provider: 'pg',
      schema
    })
  });
}
