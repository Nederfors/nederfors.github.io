import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../../server/config.js';

const validEnvironment = Object.freeze({
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://test_user:super-secret-password@127.0.0.1:5432/symbapedia_test',
  PORT: '3100',
  DATABASE_POOL_MAX: '4'
});

describe('server configuration', () => {
  it('parses valid runtime configuration without serializing credentials', () => {
    const config = loadConfig(validEnvironment);

    expect(config).toMatchObject({
      environment: 'test',
      host: '127.0.0.1',
      port: 3100,
      trustProxy: false,
      database: { poolMax: 4, sslMode: 'disable' }
    });
    expect(JSON.stringify({ ...config, database: { ...config.database, url: '[redacted]' } }))
      .not.toContain('super-secret-password');
  });

  it('fails fast when database configuration is absent without exposing another secret', () => {
    const environment = { ...validEnvironment };
    delete environment.DATABASE_URL;

    expect(() => loadConfig(environment)).toThrow(ConfigError);
    expect(() => loadConfig(environment)).toThrow('DATABASE_URL must be configured.');
  });

  it('rejects invalid port and pool bounds using non-secret errors', () => {
    expect(() => loadConfig({ ...validEnvironment, PORT: '70000' }))
      .toThrow('PORT must be an integer between 1 and 65535.');
    expect(() => loadConfig({ ...validEnvironment, DATABASE_POOL_MAX: '0' }))
      .toThrow('DATABASE_POOL_MAX must be an integer between 1 and 50.');
    expect(() => loadConfig({ ...validEnvironment, DATABASE_SSL_MODE: 'insecure' }))
      .toThrow('DATABASE_SSL_MODE must be disable or verify-full.');
    expect(() => loadConfig({ ...validEnvironment, HOST: 'not valid' }))
      .toThrow('HOST must be a non-empty bind host without whitespace.');
    expect(() => loadConfig({ ...validEnvironment, DATABASE_URL: 'postgresql://test:secret@host/db?sslmode=require' }))
      .toThrow('DATABASE_URL must be a PostgreSQL connection URL.');
  });

  it('requires verified TLS or an explicit private network for production', () => {
    expect(() => loadConfig({
      ...validEnvironment,
      NODE_ENV: 'production',
      DATABASE_SSL_MODE: 'disable'
    })).toThrow('DATABASE_PRIVATE_NETWORK=true');

    expect(loadConfig({
      ...validEnvironment,
      NODE_ENV: 'production',
      DATABASE_SSL_MODE: 'disable',
      DATABASE_PRIVATE_NETWORK: 'true'
    }).database.privateNetwork).toBe(true);
  });
});
