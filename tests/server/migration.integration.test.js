import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../server/app.js';
import { loadConfig } from '../../server/config.js';
import { createDatabaseClient } from '../../server/db/client.js';
import { runMigrations } from '../../server/db/migrate.js';
import { TEST_AUTH_SECRET, TEST_AUTH_ORIGIN, testEnvironment } from './helpers.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (testDatabaseUrl) {
  describe.sequential('Drizzle migration and Better Auth PostgreSQL integration', () => {
    const unique = randomUUID();
    const email = `batch6-${unique}@example.test`;
    const disabledEmail = `batch6-disabled-${unique}@example.test`;
    const rejectedOriginEmail = `batch6-origin-${unique}@example.test`;
    const password = `correct-${unique}-Password!`;
    const wrongPassword = `wrong-${unique}-Password!`;
    const config = loadConfig(testEnvironment({
      DATABASE_URL: testDatabaseUrl,
      AUTH_SIGNUP_ENABLED: 'true'
    }));
    const migrationDatabase = createDatabaseClient(config);
    const appDatabase = createDatabaseClient(config);
    const logLines = [];
    const app = buildApp({
      config,
      database: appDatabase,
      logger: { level: 'trace', stream: { write: line => logLines.push(line) } }
    });
    let signupCookie;

    async function authRequest(options) {
      const response = await app.inject(options);
      expect(response.headers['cache-control']).toBe('no-store');
      return response;
    }

    function sessionCookie(response) {
      const values = Array.isArray(response.headers['set-cookie'])
        ? response.headers['set-cookie']
        : [response.headers['set-cookie']];
      const sessionValue = values.find(value => value?.startsWith('better-auth.session_token='));
      expect(sessionValue).toBeTruthy();
      return sessionValue.split(';', 1)[0];
    }

    function post(url, payload, { cookie, origin = TEST_AUTH_ORIGIN } = {}) {
      return authRequest({
        method: 'POST',
        url,
        headers: {
          origin,
          ...(cookie ? { cookie } : {})
        },
        payload
      });
    }

    beforeAll(async () => {
      await runMigrations({ config, database: migrationDatabase });
      await runMigrations({ config, database: migrationDatabase });
      await app.ready();
    });

    afterAll(async () => {
      await appDatabase.pool.query('DELETE FROM "user" WHERE email = ANY($1::text[])', [
        email,
        disabledEmail,
        rejectedOriginEmail
      ]);
      await app.close();
      await migrationDatabase.close();
    });

    it('runs committed migrations twice and creates only the four Better Auth tables', async () => {
      const { rows } = await migrationDatabase.pool.query(`
        SELECT tablename
        FROM pg_tables
        WHERE schemaname = 'public'
        ORDER BY tablename
      `);
      expect(rows.map(row => row.tablename)).toEqual(['account', 'session', 'user', 'verification']);

      const migrationTable = await migrationDatabase.pool.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'drizzle'
          AND table_name = '__drizzle_migrations'
      `);
      expect(migrationTable.rows).toEqual([{ table_name: '__drizzle_migrations' }]);

      const migrations = await migrationDatabase.pool.query(`
        SELECT id, hash, created_at
        FROM drizzle.__drizzle_migrations
        ORDER BY id
      `);
      expect(migrations.rows).toEqual([
        { id: 1, hash: expect.any(String), created_at: '1784678400000' },
        { id: 2, hash: expect.any(String), created_at: '1784729446345' }
      ]);
    });

    it('signs up with a credential account, hashed password, database session, and usable cookie', async () => {
      const response = await post('/api/auth/sign-up/email', {
        name: 'Batch Six User',
        email,
        password
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        user: { name: 'Batch Six User', email, emailVerified: false }
      });
      signupCookie = sessionCookie(response);
      const setCookie = Array.isArray(response.headers['set-cookie'])
        ? response.headers['set-cookie'].join('\n')
        : response.headers['set-cookie'];
      expect(setCookie).toContain('HttpOnly');
      expect(setCookie).toContain('SameSite=Lax');
      expect(setCookie).not.toContain('Domain=');

      const { rows } = await appDatabase.pool.query(`
        SELECT u.id, u.email, a.provider_id, a.account_id, a.password,
               count(s.id)::int AS session_count
        FROM "user" u
        JOIN account a ON a.user_id = u.id
        LEFT JOIN session s ON s.user_id = u.id
        WHERE u.email = $1
        GROUP BY u.id, u.email, a.provider_id, a.account_id, a.password
      `, [email]);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        email,
        provider_id: 'credential',
        account_id: rows[0].id,
        session_count: 1
      });
      expect(rows[0].password).toEqual(expect.any(String));
      expect(rows[0].password).not.toBe(password);
      expect(rows[0].password).not.toContain(password);

      const sessionResponse = await authRequest({
        method: 'GET',
        url: '/api/auth/get-session',
        headers: { cookie: signupCookie, origin: TEST_AUTH_ORIGIN }
      });
      expect(sessionResponse.statusCode).toBe(200);
      expect(sessionResponse.json()).toMatchObject({
        user: { email },
        session: { userId: rows[0].id }
      });
    });

    it('signs out and invalidates the database-backed session', async () => {
      const signOut = await post('/api/auth/sign-out', {}, { cookie: signupCookie });
      expect(signOut.statusCode).toBe(200);
      expect(signOut.json()).toEqual({ success: true });

      const lookup = await authRequest({
        method: 'GET',
        url: '/api/auth/get-session',
        headers: { cookie: signupCookie, origin: TEST_AUTH_ORIGIN }
      });
      expect(lookup.statusCode).toBe(200);
      expect(lookup.json()).toBeNull();

      const sessions = await appDatabase.pool.query(`
        SELECT count(*)::int AS count
        FROM session s
        JOIN "user" u ON u.id = s.user_id
        WHERE u.email = $1
      `, [email]);
      expect(sessions.rows).toEqual([{ count: 0 }]);
    });

    it('rejects a wrong password generically and logs no sensitive auth values', async () => {
      const response = await post('/api/auth/sign-in/email', { email, password: wrongPassword });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({
        code: 'INVALID_EMAIL_OR_PASSWORD',
        message: 'Invalid email or password'
      });
      const serialized = `${response.body}\n${logLines.join('\n')}`;
      for (const sensitive of [password, wrongPassword, TEST_AUTH_SECRET, testDatabaseUrl, signupCookie]) {
        expect(serialized).not.toContain(sensitive);
      }
    });

    it('logs in with the correct password and issues another usable session', async () => {
      const login = await post('/api/auth/sign-in/email', { email, password });
      expect(login.statusCode).toBe(200);
      expect(login.json()).toMatchObject({ user: { email }, redirect: false });
      const loginCookie = sessionCookie(login);

      const lookup = await authRequest({
        method: 'GET',
        url: '/api/auth/get-session',
        headers: { cookie: loginCookie, origin: TEST_AUTH_ORIGIN }
      });
      expect(lookup.statusCode).toBe(200);
      expect(lookup.json()).toMatchObject({ user: { email } });
    });

    it('rejects a disallowed request origin before creating an account', async () => {
      const response = await post('/api/auth/sign-up/email', {
        name: 'Rejected Origin',
        email: rejectedOriginEmail,
        password
      }, { origin: 'https://attacker.example' });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({ code: 'INVALID_ORIGIN', message: 'Invalid origin' });
      const created = await appDatabase.pool.query('SELECT id FROM "user" WHERE email = $1', [rejectedOriginEmail]);
      expect(created.rows).toEqual([]);
    });

    it('rejects signup when AUTH_SIGNUP_ENABLED is false', async () => {
      const disabledConfig = loadConfig(testEnvironment({ DATABASE_URL: testDatabaseUrl }));
      const disabledDatabase = createDatabaseClient(disabledConfig);
      const disabledApp = buildApp({ config: disabledConfig, database: disabledDatabase, logger: false });
      try {
        const response = await disabledApp.inject({
          method: 'POST',
          url: '/api/auth/sign-up/email',
          headers: { origin: TEST_AUTH_ORIGIN },
          payload: { name: 'Disabled Signup', email: disabledEmail, password }
        });
        expect(response.statusCode).toBe(400);
        expect(response.headers['cache-control']).toBe('no-store');
        expect(response.json()).toEqual({
          code: 'EMAIL_PASSWORD_SIGN_UP_DISABLED',
          message: 'Email and password sign up is not enabled'
        });
      } finally {
        await disabledApp.close();
      }

      const created = await appDatabase.pool.query('SELECT id FROM "user" WHERE email = $1', [disabledEmail]);
      expect(created.rows).toEqual([]);
    });

    it('leaves verification-email and password-reset delivery unconfigured and sends nothing', async () => {
      const verification = await post('/api/auth/send-verification-email', { email });
      expect(verification.statusCode).toBe(400);
      expect(verification.json()).toEqual({
        code: 'VERIFICATION_EMAIL_NOT_ENABLED',
        message: "Verification email isn't enabled"
      });

      const reset = await post('/api/auth/request-password-reset', { email });
      expect(reset.statusCode).toBe(400);
      expect(reset.json()).toEqual({
        code: 'RESET_PASSWORD_DISABLED',
        message: "Reset password isn't enabled"
      });

      const resetTokens = await appDatabase.pool.query(`
        SELECT identifier
        FROM verification
        WHERE identifier LIKE 'reset-password:%'
      `);
      expect(resetTokens.rows).toEqual([]);
    });
  });
} else {
  describe.skip('Drizzle migration and Better Auth PostgreSQL integration', () => {
    it('requires TEST_DATABASE_URL (PostgreSQL-backed auth scenarios skipped locally)', () => {});
  });
}
