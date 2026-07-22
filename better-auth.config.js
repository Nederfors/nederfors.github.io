import { betterAuth } from 'better-auth';
import { AUTH_BASE_PATH, buildAuthSchemaOptions } from './server/auth/options.js';

export const auth = betterAuth({
  appName: 'Symbapedia',
  baseURL: 'http://localhost',
  basePath: AUTH_BASE_PATH,
  logger: { disabled: true },
  ...buildAuthSchemaOptions()
});
