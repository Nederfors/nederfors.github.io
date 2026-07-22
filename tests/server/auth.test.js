/* global Headers */
import { describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../server/app.js';
import { buildAuthOptions } from '../../server/auth/options.js';
import { getAuthSession } from '../../server/auth/session.js';
import { loadConfig } from '../../server/config.js';
import { TEST_AUTH_SECRET, testEnvironment } from './helpers.js';

describe('Better Auth foundation', () => {
  function database() {
    return { db: {}, close: vi.fn().mockResolvedValue() };
  }

  it('keeps password sessions database-backed and delivery callbacks unconfigured', () => {
    const options = buildAuthOptions(loadConfig(testEnvironment()));

    expect(options).toMatchObject({
      appName: 'Symbapedia',
      baseURL: 'http://127.0.0.1:3100',
      basePath: '/api/auth',
      secret: TEST_AUTH_SECRET,
      trustedOrigins: ['http://127.0.0.1:3100'],
      emailAndPassword: {
        enabled: true,
        disableSignUp: true,
        requireEmailVerification: false
      },
      session: { cookieCache: { enabled: false } },
      advanced: {
        ipAddress: { disableIpTracking: true },
        disableCSRFCheck: false,
        disableOriginCheck: false
      },
      onAPIError: { throw: true }
    });
    expect(options.emailAndPassword).not.toHaveProperty('sendResetPassword');
    expect(options).not.toHaveProperty('emailVerification');
    expect(options).not.toHaveProperty('socialProviders');
    expect(options.advanced).not.toHaveProperty('crossSubDomainCookies');
  });

  it('passes only validated proxy ranges to Better Auth IP handling', () => {
    const options = buildAuthOptions(loadConfig(testEnvironment({
      BETTER_AUTH_TRUSTED_PROXIES: '192.0.2.10,2001:db8::/64'
    })));

    expect(options.advanced.ipAddress).toEqual({
      trustedProxies: ['192.0.2.10', '2001:db8::/64']
    });
  });

  it('provides a narrow reusable server-side session lookup', async () => {
    const getSession = vi.fn().mockResolvedValue({
      session: { id: 'session-id' },
      user: { id: 'user-id' }
    });
    const result = await getAuthSession({
      auth: { api: { getSession } },
      request: { headers: { cookie: 'better-auth.session_token=token.signature' } }
    });

    expect(result).toEqual({ session: { id: 'session-id' }, user: { id: 'user-id' } });
    expect(getSession).toHaveBeenCalledOnce();
    expect(getSession.mock.calls[0][0].headers).toBeInstanceOf(Headers);
    expect(getSession.mock.calls[0][0].headers.get('cookie'))
      .toBe('better-auth.session_token=token.signature');
  });

  it('uses Better Auth 1.6.24 security and disabled-delivery errors at the Fastify boundary', async () => {
    const disabledApp = buildApp({
      config: loadConfig(testEnvironment()),
      database: database(),
      logger: false
    });
    const origin = 'http://127.0.0.1:3100';
    try {
      const signup = await disabledApp.inject({
        method: 'POST',
        url: '/api/auth/sign-up/email',
        headers: { origin },
        payload: { name: 'Test User', email: 'test@example.test', password: 'password123' }
      });
      expect(signup.statusCode).toBe(400);
      expect(signup.headers['cache-control']).toBe('no-store');
      expect(signup.json()).toEqual({
        code: 'EMAIL_PASSWORD_SIGN_UP_DISABLED',
        message: 'Email and password sign up is not enabled'
      });

      const verification = await disabledApp.inject({
        method: 'POST',
        url: '/api/auth/send-verification-email',
        headers: { origin },
        payload: { email: 'test@example.test' }
      });
      expect(verification.statusCode).toBe(400);
      expect(verification.json()).toEqual({
        code: 'VERIFICATION_EMAIL_NOT_ENABLED',
        message: "Verification email isn't enabled"
      });

      const reset = await disabledApp.inject({
        method: 'POST',
        url: '/api/auth/request-password-reset',
        headers: { origin },
        payload: { email: 'test@example.test' }
      });
      expect(reset.statusCode).toBe(400);
      expect(reset.json()).toEqual({
        code: 'RESET_PASSWORD_DISABLED',
        message: "Reset password isn't enabled"
      });
    } finally {
      await disabledApp.close();
    }

    const enabledApp = buildApp({
      config: loadConfig(testEnvironment({ AUTH_SIGNUP_ENABLED: 'true' })),
      database: database(),
      logger: false
    });
    try {
      const rejected = await enabledApp.inject({
        method: 'POST',
        url: '/api/auth/sign-up/email',
        headers: { origin: 'https://attacker.example' },
        payload: { name: 'Test User', email: 'test@example.test', password: 'password123' }
      });
      expect(rejected.statusCode).toBe(403);
      expect(rejected.json()).toEqual({ code: 'INVALID_ORIGIN', message: 'Invalid origin' });
    } finally {
      await enabledApp.close();
    }
  });
});
