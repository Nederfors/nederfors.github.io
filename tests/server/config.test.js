import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../../server/config.js';
import { TEST_AUTH_SECRET, testEnvironment } from './helpers.js';

const validEnvironment = Object.freeze(testEnvironment({
  DATABASE_URL: 'postgresql://test_user:super-secret-password@127.0.0.1:5432/symbapedia_test',
  PORT: '3100',
  DATABASE_POOL_MAX: '4'
}));

describe('server configuration', () => {
  it('parses valid runtime configuration without serializing credentials', () => {
    const config = loadConfig(validEnvironment);

    expect(config).toMatchObject({
      environment: 'test',
      host: '127.0.0.1',
      port: 3100,
      trustProxy: false,
      auth: {
        baseUrl: 'http://127.0.0.1:3100',
        signupEnabled: false,
        trustedProxies: []
      },
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
      BETTER_AUTH_URL: 'https://symbapedia.example',
      DATABASE_SSL_MODE: 'disable'
    })).toThrow('DATABASE_PRIVATE_NETWORK=true');

    expect(loadConfig({
      ...validEnvironment,
      NODE_ENV: 'production',
      BETTER_AUTH_URL: 'https://symbapedia.example',
      DATABASE_SSL_MODE: 'disable',
      DATABASE_PRIVATE_NETWORK: 'true'
    }).database.privateNetwork).toBe(true);
  });

  it('rejects missing and short Better Auth secrets without echoing their values', () => {
    const missing = { ...validEnvironment };
    delete missing.BETTER_AUTH_SECRET;

    expect(() => loadConfig(missing)).toThrow('BETTER_AUTH_SECRET must be configured.');

    const shortSecret = 'sensitive-short-secret';
    try {
      loadConfig({ ...validEnvironment, BETTER_AUTH_SECRET: shortSecret });
      throw new Error('expected configuration failure');
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      expect(error.message).toBe('BETTER_AUTH_SECRET must contain at least 32 characters.');
      expect(error.message).not.toContain(shortSecret);
    }
  });

  it('requires an exact absolute auth origin and HTTPS in production', () => {
    const missing = { ...validEnvironment };
    delete missing.BETTER_AUTH_URL;
    expect(() => loadConfig(missing)).toThrow('BETTER_AUTH_URL must be configured.');
    expect(() => loadConfig({ ...validEnvironment, BETTER_AUTH_URL: 'not a URL' }))
      .toThrow('BETTER_AUTH_URL must be a valid absolute application origin.');
    expect(() => loadConfig({ ...validEnvironment, BETTER_AUTH_URL: 'https://example.test/api/auth' }))
      .toThrow('BETTER_AUTH_URL must be an exact HTTP(S) application origin');
    expect(() => loadConfig({ ...validEnvironment, BETTER_AUTH_URL: 'https://example.test/another-path' }))
      .toThrow('BETTER_AUTH_URL must be an exact HTTP(S) application origin');
    expect(() => loadConfig({
      ...validEnvironment,
      NODE_ENV: 'production',
      DATABASE_SSL_MODE: 'disable',
      DATABASE_PRIVATE_NETWORK: 'true',
      BETTER_AUTH_URL: 'http://example.test'
    })).toThrow('Production BETTER_AUTH_URL must use HTTPS.');
  });

  it('validates signup booleans and defaults signup to disabled', () => {
    expect(loadConfig(validEnvironment).auth.signupEnabled).toBe(false);
    expect(loadConfig({ ...validEnvironment, AUTH_SIGNUP_ENABLED: 'true' }).auth.signupEnabled).toBe(true);
    expect(() => loadConfig({ ...validEnvironment, AUTH_SIGNUP_ENABLED: 'yes' }))
      .toThrow('AUTH_SIGNUP_ENABLED must be true or false.');
  });

  it('accepts only explicit valid trusted proxy IPs and CIDRs', () => {
    const config = loadConfig({
      ...validEnvironment,
      BETTER_AUTH_TRUSTED_PROXIES: '192.0.2.10, 2001:db8::/64'
    });
    expect(config.auth.trustedProxies).toEqual(['192.0.2.10', '2001:db8::/64']);
    expect(config.trustProxy).toEqual(['192.0.2.10', '2001:db8::/64']);
    expect(() => loadConfig({ ...validEnvironment, BETTER_AUTH_TRUSTED_PROXIES: '192.0.2.999' }))
      .toThrow('BETTER_AUTH_TRUSTED_PROXIES must be a comma-separated list');
    expect(() => loadConfig({ ...validEnvironment, BETTER_AUTH_TRUSTED_PROXIES: '0.0.0.0/0' }))
      .toThrow('BETTER_AUTH_TRUSTED_PROXIES must be a comma-separated list');
    expect(() => loadConfig({ ...validEnvironment, TRUST_PROXY: 'true' }))
      .toThrow('TRUST_PROXY=true is not supported');
  });

  it('supports Better Auth 1.6.24 versioned secret rotation while retaining the singular baseline', () => {
    const rotated = loadConfig({
      ...validEnvironment,
      BETTER_AUTH_SECRETS: `2:${TEST_AUTH_SECRET}-current,1:${TEST_AUTH_SECRET}-previous`
    });
    expect(rotated.auth.secret).toBe(TEST_AUTH_SECRET);
    expect(rotated.auth.secrets).toEqual([
      { version: 2, value: `${TEST_AUTH_SECRET}-current` },
      { version: 1, value: `${TEST_AUTH_SECRET}-previous` }
    ]);

    const invalidValue = '3:too-short';
    try {
      loadConfig({ ...validEnvironment, BETTER_AUTH_SECRETS: invalidValue });
      throw new Error('expected configuration failure');
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      expect(error.message).not.toContain(invalidValue);
    }
  });
});
