import Fastify from 'fastify';
import { createDatabaseClient } from './db/client.js';
import { healthRoutes } from './routes/health.js';

export function buildApp({ config, database, logger } = {}) {
  if (!config) throw new Error('A validated server config is required.');
  const ownedDatabase = database || createDatabaseClient(config);
  const app = Fastify({
    logger: logger ?? { level: config.environment === 'production' ? 'info' : 'warn' },
    trustProxy: config.trustProxy
  });

  app.decorate('database', ownedDatabase);
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
