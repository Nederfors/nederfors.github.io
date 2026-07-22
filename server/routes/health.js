const healthResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['status'],
  properties: { status: { type: 'string', enum: ['ok', 'unavailable'] } }
};

function boundedReadinessCheck(database, timeoutMs) {
  let timeout;
  const deadline = new Promise((_, reject) => {
    timeout = setTimeout(() => reject(new Error('database readiness timed out')), timeoutMs);
  });
  return Promise.race([database.checkHealth(), deadline]).finally(() => clearTimeout(timeout));
}

export async function healthRoutes(app, { database, config }) {
  app.get('/api/v1/health', {
    schema: { response: { 200: healthResponseSchema, 503: healthResponseSchema } }
  }, async (_request, reply) => {
    reply.header('cache-control', 'no-store');
    try {
      await boundedReadinessCheck(database, config.database.healthCheckTimeoutMs);
      return { status: 'ok' };
    } catch (error) {
      app.log.warn({ errorType: error instanceof Error ? error.name : 'unknown' }, 'database readiness check failed');
      return reply.code(503).send({ status: 'unavailable' });
    }
  });
}
