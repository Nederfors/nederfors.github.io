import { loadConfig } from './config.js';
import { buildApp } from './app.js';

export function installSignalHandlers(app, config, { processRef = process } = {}) {
  let shuttingDown = false;
  const shutdown = async signal => {
    if (shuttingDown) return;
    shuttingDown = true;
    app.log.info({ signal }, 'server shutting down');
    let timeout;
    await Promise.race([
      app.close(),
      new Promise(resolve => { timeout = setTimeout(resolve, config.shutdownTimeoutMs); })
    ]);
    clearTimeout(timeout);
    processRef.exit(0);
  };
  processRef.once('SIGINT', () => { void shutdown('SIGINT'); });
  processRef.once('SIGTERM', () => { void shutdown('SIGTERM'); });
}

export async function startServer({ config = loadConfig(), app = buildApp({ config }), processRef = process } = {}) {
  installSignalHandlers(app, config, { processRef });
  await app.listen({ host: config.host, port: config.port });
  return app;
}

if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  startServer().catch(() => {
    console.error('Server failed to start. Check non-secret runtime configuration and database availability.');
    process.exitCode = 1;
  });
}
