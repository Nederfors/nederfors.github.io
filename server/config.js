import { isIP } from 'node:net';

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

function authSecret(environment) {
  const value = requiredString(environment, 'BETTER_AUTH_SECRET');
  if (value.length < 32) {
    throw new ConfigError('BETTER_AUTH_SECRET must contain at least 32 characters.');
  }
  return value;
}

function authSecrets(environment) {
  const raw = environment.BETTER_AUTH_SECRETS?.trim();
  if (!raw) return undefined;

  const versions = new Set();
  const secrets = raw.split(',').map(entry => {
    const separator = entry.indexOf(':');
    const version = Number(entry.slice(0, separator));
    const value = entry.slice(separator + 1).trim();
    if (separator < 1 || !Number.isSafeInteger(version) || version < 0 || versions.has(version) || value.length < 32) {
      throw new ConfigError('BETTER_AUTH_SECRETS must be a comma-separated list of unique non-negative versions and secrets of at least 32 characters.');
    }
    versions.add(version);
    return Object.freeze({ version, value });
  });

  return Object.freeze(secrets);
}

function authBaseUrl(environment, nodeEnv) {
  const value = requiredString(environment, 'BETTER_AUTH_URL');
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new ConfigError('BETTER_AUTH_URL must be a valid absolute application origin.');
  }

  if (!['http:', 'https:'].includes(url.protocol)
      || url.username
      || url.password
      || url.pathname !== '/'
      || url.search
      || url.hash) {
    throw new ConfigError('BETTER_AUTH_URL must be an exact HTTP(S) application origin without a path, credentials, query, or fragment.');
  }
  if (nodeEnv === 'production' && url.protocol !== 'https:') {
    throw new ConfigError('Production BETTER_AUTH_URL must use HTTPS.');
  }
  return url.origin;
}

function trustedProxies(environment) {
  const raw = environment.BETTER_AUTH_TRUSTED_PROXIES?.trim();
  if (!raw) return Object.freeze([]);

  const entries = raw.split(',').map(entry => entry.trim());
  const valid = entries.every(entry => {
    if (isIP(entry)) return true;
    const match = /^(.+)\/(\d{1,3})$/.exec(entry);
    if (!match) return false;
    const version = isIP(match[1]);
    const prefix = Number(match[2]);
    return version !== 0 && prefix > 0 && prefix <= (version === 4 ? 32 : 128);
  });
  if (!valid) {
    throw new ConfigError('BETTER_AUTH_TRUSTED_PROXIES must be a comma-separated list of explicit IP addresses or CIDR ranges.');
  }
  return Object.freeze(entries);
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

  const auth = {
    secret: authSecret(environment),
    secrets: authSecrets(environment),
    baseUrl: authBaseUrl(environment, nodeEnv),
    signupEnabled: boolean(environment, 'AUTH_SIGNUP_ENABLED', false),
    trustedProxies: trustedProxies(environment)
  };
  const frozenAuth = Object.freeze(auth);
  if (boolean(environment, 'TRUST_PROXY')) {
    throw new ConfigError('TRUST_PROXY=true is not supported; configure explicit BETTER_AUTH_TRUSTED_PROXIES entries.');
  }

  const config = {
    environment: nodeEnv,
    host: bindHost(environment),
    port: integer(environment, 'PORT', 3000, { min: 1, max: 65535 }),
    trustProxy: auth.trustedProxies.length > 0 ? auth.trustedProxies : false,
    shutdownTimeoutMs: integer(environment, 'SHUTDOWN_TIMEOUT_MS', 10_000, { min: 1_000, max: 60_000 }),
    auth: frozenAuth,
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

  return Object.freeze({ ...config, auth: frozenAuth, database: Object.freeze(config.database) });
}
