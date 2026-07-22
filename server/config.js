const VALID_ENVIRONMENTS = new Set(['development', 'test', 'production']);
const VALID_SSL_MODES = new Set(['disable', 'verify-full']);

export class ConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConfigError';
  }
}

function requiredString(environment, name) {
  const value = environment[name]?.trim();
  if (!value) throw new ConfigError(`${name} must be configured.`);
  return value;
}

function integer(environment, name, fallback, { min, max }) {
  const raw = environment[name] ?? fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new ConfigError(`${name} must be an integer between ${min} and ${max}.`);
  }
  return value;
}

function boolean(environment, name, fallback = false) {
  const raw = environment[name];
  if (raw === undefined || raw === '') return fallback;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  throw new ConfigError(`${name} must be true or false.`);
}

function databaseUrl(environment) {
  const value = requiredString(environment, 'DATABASE_URL');
  try {
    const parsed = new URL(value);
    if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
      throw new Error('unsupported protocol');
    }
    if (parsed.searchParams.has('ssl') || parsed.searchParams.has('sslmode')) {
      throw new Error('SSL options must use the configuration boundary');
    }
  } catch {
    throw new ConfigError('DATABASE_URL must be a PostgreSQL connection URL.');
  }
  return value;
}

function bindHost(environment) {
  const value = (environment.HOST || '127.0.0.1').trim();
  if (!value || /\s/.test(value)) {
    throw new ConfigError('HOST must be a non-empty bind host without whitespace.');
  }
  return value;
}

export function loadConfig(environment = process.env) {
  const nodeEnv = environment.NODE_ENV || 'development';
  if (!VALID_ENVIRONMENTS.has(nodeEnv)) {
    throw new ConfigError('NODE_ENV must be development, test, or production.');
  }

  const sslMode = environment.DATABASE_SSL_MODE || (nodeEnv === 'production' ? 'verify-full' : 'disable');
  if (!VALID_SSL_MODES.has(sslMode)) {
    throw new ConfigError('DATABASE_SSL_MODE must be disable or verify-full.');
  }

  const privateNetwork = boolean(environment, 'DATABASE_PRIVATE_NETWORK');
  if (nodeEnv === 'production' && sslMode === 'disable' && !privateNetwork) {
    throw new ConfigError('Production DATABASE_SSL_MODE=disable requires DATABASE_PRIVATE_NETWORK=true.');
  }

  const config = {
    environment: nodeEnv,
    host: bindHost(environment),
    port: integer(environment, 'PORT', 3000, { min: 1, max: 65535 }),
    trustProxy: boolean(environment, 'TRUST_PROXY'),
    shutdownTimeoutMs: integer(environment, 'SHUTDOWN_TIMEOUT_MS', 10_000, { min: 1_000, max: 60_000 }),
    database: {
      url: databaseUrl(environment),
      poolMax: integer(environment, 'DATABASE_POOL_MAX', 10, { min: 1, max: 50 }),
      idleTimeoutMs: integer(environment, 'DATABASE_IDLE_TIMEOUT_MS', 10_000, { min: 1_000, max: 120_000 }),
      connectionTimeoutMs: integer(environment, 'DATABASE_CONNECTION_TIMEOUT_MS', 5_000, { min: 250, max: 60_000 }),
      statementTimeoutMs: integer(environment, 'DATABASE_STATEMENT_TIMEOUT_MS', 3_000, { min: 100, max: 60_000 }),
      healthCheckTimeoutMs: integer(environment, 'DATABASE_HEALTHCHECK_TIMEOUT_MS', 2_000, { min: 100, max: 30_000 }),
      sslMode,
      privateNetwork,
      sslCa: environment.DATABASE_SSL_CA?.replace(/\\n/g, '\n') || undefined
    }
  };

  return Object.freeze({ ...config, database: Object.freeze(config.database) });
}
