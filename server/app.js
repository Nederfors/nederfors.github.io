import Fastify from 'fastify';
import { createAuth } from './auth/auth.js';
import { authRoutes } from './auth/routes.js';
import { characterRoutes } from './characters/routes.js';
import { createDatabaseClient } from './db/client.js';
import { healthRoutes } from './routes/health.js';

export function buildApp({ config, database, logger, auth } = {}) {
  if (!config) throw new Error('A validated server config is required.');
  const ownedDatabase = database || createDatabaseClient(config);
  const app = Fastify({
    logger: logger ?? { level: config.environment === 'production' ? 'info' : 'warn' },
    trustProxy: config.trustProxy
  });
  const appAuth = auth || createAuth({ config, database: ownedDatabase });

  app.decorate('database', ownedDatabase);
  app.decorate('auth', appAuth);
  app.addHook('onRequest', (request, reply, done) => {
    const requestPath = request.raw.url.split('?', 1)[0];
    if (requestPath === '/api/v1/characters' || requestPath.startsWith('/api/v1/characters/')) {
      reply.header('cache-control', 'no-store');
    }
    done();
  });
  app.register(authRoutes, { auth: appAuth, config });
  app.register(characterRoutes, { auth: appAuth, database: ownedDatabase });
  app.register(healthRoutes, { database: ownedDatabase, config });

  app.setErrorHandler((error, _request, reply) => {
    const statusCode = error.statusCode >= 400 && error.statusCode < 500 ? error.statusCode : 500;
    if (statusCode >= 500) app.log.error({ errorType: error.name }, 'request failed');
    reply.code(statusCode).send({ error: statusCode >= 500 ? 'Internal server error' : 'Request failed' });
  });

  app.addHook('onClose', async () => {
    await ownedDatabase.close();
  });

  return app;
}
