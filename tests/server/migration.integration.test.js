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
    const otherEmail = `batch6-other-${unique}@example.test`;
    const cascadeEmail = `batch6-cascade-${unique}@example.test`;
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
    let activeCookie;
    let primaryUserId;
    let otherCookie;
    let otherUserId;

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

    function hostedDocument(name, overrides = {}) {
      return {
        format: 'symbapedia-character',
        formatVersion: 2,
        rulesetVersion: 3,
        name,
        data: {},
        ...overrides
      };
    }

    function characterRequest(method, url, { payload, cookie = activeCookie } = {}) {
      return authRequest({
        method,
        url,
        headers: {
          origin: TEST_AUTH_ORIGIN,
          ...(cookie ? { cookie } : {})
        },
        ...(payload === undefined ? {} : { payload })
      });
    }

    beforeAll(async () => {
      await runMigrations({ config, database: migrationDatabase });
      await runMigrations({ config, database: migrationDatabase });
      await app.ready();
    });

    afterAll(async () => {
      await appDatabase.pool.query('DELETE FROM "user" WHERE email = ANY($1::text[])', [
        [email, disabledEmail, rejectedOriginEmail, otherEmail, cascadeEmail]
      ]);
      await app.close();
      await migrationDatabase.close();
    });

    it('runs committed migrations twice and keeps the four Better Auth tables alongside characters', async () => {
      const { rows } = await migrationDatabase.pool.query(`
        SELECT tablename
        FROM pg_tables
        WHERE schemaname = 'public'
        ORDER BY tablename
      `);
      expect(rows.map(row => row.tablename)).toEqual(['account', 'characters', 'session', 'user', 'verification']);

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
        { id: 2, hash: expect.any(String), created_at: '1784729446345' },
        { id: 3, hash: expect.any(String), created_at: '1784731534519' }
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
      primaryUserId = rows[0].id;
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
      activeCookie = loginCookie;

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

    it('creates the hosted-character table with the intended columns, constraints, and indexes', async () => {
      const columns = await appDatabase.pool.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'characters'
        ORDER BY ordinal_position
      `);
      expect(columns.rows).toEqual([
        { column_name: 'owner_id', data_type: 'text', is_nullable: 'NO', column_default: null },
        { column_name: 'id', data_type: 'text', is_nullable: 'NO', column_default: null },
        { column_name: 'revision', data_type: 'integer', is_nullable: 'NO', column_default: '1' },
        { column_name: 'schema_version', data_type: 'integer', is_nullable: 'NO', column_default: null },
        { column_name: 'document_json', data_type: 'jsonb', is_nullable: 'NO', column_default: null },
        {
          column_name: 'created_at',
          data_type: 'timestamp with time zone',
          is_nullable: 'NO',
          column_default: 'now()'
        },
        {
          column_name: 'updated_at',
          data_type: 'timestamp with time zone',
          is_nullable: 'NO',
          column_default: 'now()'
        }
      ]);

      const constraints = await appDatabase.pool.query(`
        SELECT conname, contype, pg_get_constraintdef(oid) AS definition
        FROM pg_constraint
        WHERE conrelid = 'public.characters'::regclass
        ORDER BY conname
      `);
      expect(constraints.rows.map(row => row.conname)).toEqual([
        'characters_document_json_object_check',
        'characters_owner_id_id_pk',
        'characters_owner_id_user_id_fk',
        'characters_revision_check',
        'characters_schema_version_check'
      ]);
      const definitions = Object.fromEntries(constraints.rows.map(row => [row.conname, row]));
      expect(definitions.characters_owner_id_id_pk).toMatchObject({
        contype: 'p',
        definition: 'PRIMARY KEY (owner_id, id)'
      });
      expect(definitions.characters_owner_id_user_id_fk).toMatchObject({ contype: 'f' });
      expect(definitions.characters_owner_id_user_id_fk.definition).toContain('FOREIGN KEY (owner_id)');
      expect(definitions.characters_owner_id_user_id_fk.definition).toContain('REFERENCES "user"(id) ON DELETE CASCADE');
      expect(definitions.characters_revision_check.definition).toContain('revision >= 1');
      expect(definitions.characters_schema_version_check.definition).toContain('schema_version >= 1');
      expect(definitions.characters_document_json_object_check.definition)
        .toContain("jsonb_typeof(document_json) = 'object'::text");

      const indexes = await appDatabase.pool.query(`
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE schemaname = 'public' AND tablename = 'characters'
        ORDER BY indexname
      `);
      expect(indexes.rows.map(row => row.indexname)).toEqual([
        'characters_owner_id_id_pk',
        'characters_owner_updated_id_idx'
      ]);
      expect(indexes.rows[1].indexdef)
        .toContain('(owner_id, updated_at DESC NULLS LAST, id)');
    });

    it('returns 401 and no-store for unauthenticated hosted-character CRUD', async () => {
      const unauthenticatedRequests = [
        ['GET', '/api/v1/characters', undefined],
        ['POST', '/api/v1/characters', { id: 'unauthenticated', document: hostedDocument('No session') }],
        ['GET', '/api/v1/characters/unauthenticated', undefined],
        ['PUT', '/api/v1/characters/unauthenticated', {
          expectedRevision: 1,
          document: hostedDocument('No session')
        }],
        ['DELETE', '/api/v1/characters/unauthenticated', { expectedRevision: 1 }]
      ];

      for (const [method, url, payload] of unauthenticatedRequests) {
        const response = await characterRequest(method, url, { payload, cookie: null });
        expect(response.statusCode).toBe(401);
        expect(response.json()).toEqual({ error: 'unauthorized' });
      }
    });

    it('validates envelopes before persistence and keeps hosted metadata server-owned', async () => {
      const invalidId = `invalid-${unique}`;
      for (const invalidDocument of [
        { ...hostedDocument('Wrong format'), format: 'other-format' },
        { ...hostedDocument('Old format'), formatVersion: 1 },
        { ...hostedDocument('Array data'), data: [] },
        { format: 'symbapedia-character', formatVersion: 2 }
      ]) {
        const response = await characterRequest('POST', '/api/v1/characters', {
          payload: { id: invalidId, document: invalidDocument }
        });
        expect(response.statusCode).toBe(400);
      }
      const invalidRows = await appDatabase.pool.query(
        'SELECT id FROM characters WHERE owner_id = $1 AND id = $2',
        [primaryUserId, invalidId]
      );
      expect(invalidRows.rows).toEqual([]);

      const id = `authority-${unique}`;
      const wholeDocument = hostedDocument('Authority', {
        folderId: 'folder-1',
        futureEnvelopeField: { preserved: true },
        data: { unknownFutureData: ['preserved', 2] }
      });
      const created = await characterRequest('POST', '/api/v1/characters', {
        payload: {
          id,
          ownerId: 'client-owner',
          revision: 99,
          schemaVersion: 99,
          document: wholeDocument
        }
      });
      expect(created.statusCode).toBe(201);
      expect(created.json()).toMatchObject({
        character: { id, revision: 1, schemaVersion: 2, document: wholeDocument }
      });
      expect(created.json().character).not.toHaveProperty('ownerId');

      const stored = await appDatabase.pool.query(`
        SELECT owner_id, revision, schema_version, document_json
        FROM characters
        WHERE owner_id = $1 AND id = $2
      `, [primaryUserId, id]);
      expect(stored.rows).toEqual([{
        owner_id: primaryUserId,
        revision: 1,
        schema_version: 2,
        document_json: wholeDocument
      }]);

      const read = await characterRequest('GET', `/api/v1/characters/${id}`);
      expect(read.statusCode).toBe(200);
      expect(read.json().character.document).toEqual(wholeDocument);

      const duplicate = await characterRequest('POST', '/api/v1/characters', {
        payload: { id, document: hostedDocument('Duplicate') }
      });
      expect(duplicate.statusCode).toBe(409);
      expect(duplicate.json()).toEqual({ error: 'character_id_conflict' });

      const lastWriteWinsAttempt = await characterRequest('PUT', `/api/v1/characters/${id}`, {
        payload: { document: hostedDocument('Missing expected revision') }
      });
      expect(lastWriteWinsAttempt.statusCode).toBe(400);
      const unchanged = await characterRequest('GET', `/api/v1/characters/${id}`);
      expect(unchanged.json().character).toMatchObject({ revision: 1, document: wholeDocument });
    });

    it('isolates owners, permits per-owner duplicate IDs, and prevents cross-owner mutation', async () => {
      const signup = await post('/api/auth/sign-up/email', {
        name: 'Other Hosted Owner',
        email: otherEmail,
        password
      });
      expect(signup.statusCode).toBe(200);
      otherCookie = sessionCookie(signup);
      const otherUser = await appDatabase.pool.query('SELECT id FROM "user" WHERE email = $1', [otherEmail]);
      otherUserId = otherUser.rows[0].id;

      const sharedId = `authority-${unique}`;
      const otherSharedDocument = hostedDocument('Other owner same ID');
      const sameId = await characterRequest('POST', '/api/v1/characters', {
        cookie: otherCookie,
        payload: { id: sharedId, document: otherSharedDocument }
      });
      expect(sameId.statusCode).toBe(201);

      const otherOnlyId = `other-only-${unique}`;
      const otherOnlyDocument = hostedDocument('Other owner only');
      const otherOnly = await characterRequest('POST', '/api/v1/characters', {
        cookie: otherCookie,
        payload: { id: otherOnlyId, document: otherOnlyDocument }
      });
      expect(otherOnly.statusCode).toBe(201);

      const list = await characterRequest('GET', '/api/v1/characters');
      expect(list.statusCode).toBe(200);
      expect(list.json().characters.map(character => character.id)).toContain(sharedId);
      expect(list.json().characters.map(character => character.id)).not.toContain(otherOnlyId);
      expect(list.json().characters.every(character => !Object.hasOwn(character, 'ownerId'))).toBe(true);

      const crossOwnerGet = await characterRequest('GET', `/api/v1/characters/${otherOnlyId}`);
      expect(crossOwnerGet.statusCode).toBe(404);
      expect(crossOwnerGet.json()).toEqual({ error: 'not_found' });

      const crossOwnerPut = await characterRequest('PUT', `/api/v1/characters/${otherOnlyId}`, {
        payload: { expectedRevision: 1, document: hostedDocument('Cross-owner overwrite') }
      });
      expect(crossOwnerPut.statusCode).toBe(404);
      expect(crossOwnerPut.json()).toEqual({ error: 'not_found' });

      const crossOwnerDelete = await characterRequest('DELETE', `/api/v1/characters/${otherOnlyId}`, {
        payload: { expectedRevision: 1 }
      });
      expect(crossOwnerDelete.statusCode).toBe(404);
      expect(crossOwnerDelete.json()).toEqual({ error: 'not_found' });

      const deleteOwnShared = await characterRequest('DELETE', `/api/v1/characters/${sharedId}`, {
        payload: { expectedRevision: 1 }
      });
      expect(deleteOwnShared.statusCode).toBe(200);
      const otherStillExists = await characterRequest('GET', `/api/v1/characters/${sharedId}`, {
        cookie: otherCookie
      });
      expect(otherStillExists.statusCode).toBe(200);
      expect(otherStillExists.json().character.document).toEqual(otherSharedDocument);

      const ownerRows = await appDatabase.pool.query(`
        SELECT owner_id, id
        FROM characters
        WHERE id = $1
      `, [sharedId]);
      expect(ownerRows.rows).toEqual([{ owner_id: otherUserId, id: sharedId }]);
    });

    it('atomically accepts one concurrent whole-document update and rejects the other', async () => {
      const id = `concurrent-${unique}`;
      const initialDocument = hostedDocument('Concurrent initial', { data: { initialOnly: true } });
      const created = await characterRequest('POST', '/api/v1/characters', {
        payload: { id, document: initialDocument }
      });
      expect(created.statusCode).toBe(201);

      const documentA = hostedDocument('Concurrent A', {
        futureA: true,
        data: { winner: 'A', onlyA: [1] }
      });
      const documentB = hostedDocument('Concurrent B', {
        futureB: true,
        data: { winner: 'B', onlyB: [2] }
      });
      const updates = await Promise.all([
        characterRequest('PUT', `/api/v1/characters/${id}`, {
          payload: { expectedRevision: 1, document: documentA }
        }),
        characterRequest('PUT', `/api/v1/characters/${id}`, {
          payload: { expectedRevision: 1, document: documentB }
        })
      ]);
      expect(updates.map(response => response.statusCode).sort()).toEqual([200, 409]);
      const winner = updates.find(response => response.statusCode === 200);
      const loser = updates.find(response => response.statusCode === 409);
      expect(loser.json()).toEqual({ error: 'revision_conflict' });
      expect(winner.json().character.revision).toBe(2);

      const stored = await characterRequest('GET', `/api/v1/characters/${id}`);
      expect(stored.statusCode).toBe(200);
      expect(stored.json().character).toMatchObject({
        revision: 2,
        document: winner.json().character.document
      });
      expect([documentA, documentB]).toContainEqual(stored.json().character.document);

      const staleDelete = await characterRequest('DELETE', `/api/v1/characters/${id}`, {
        payload: { expectedRevision: 1 }
      });
      expect(staleDelete.statusCode).toBe(409);
      expect(staleDelete.json()).toEqual({ error: 'revision_conflict' });

      const afterStaleDelete = await characterRequest('GET', `/api/v1/characters/${id}`);
      expect(afterStaleDelete.json().character.revision).toBe(2);
      const currentDelete = await characterRequest('DELETE', `/api/v1/characters/${id}`, {
        payload: { expectedRevision: 2 }
      });
      expect(currentDelete.statusCode).toBe(200);
      expect(currentDelete.json().character.document).toEqual(winner.json().character.document);
      const deleted = await characterRequest('GET', `/api/v1/characters/${id}`);
      expect(deleted.statusCode).toBe(404);
    });

    it('orders owner lists deterministically by update time and ID', async () => {
      const firstId = `list-a-${unique}`;
      const secondId = `list-b-${unique}`;
      await characterRequest('POST', '/api/v1/characters', {
        payload: { id: firstId, document: hostedDocument('List A') }
      });
      await characterRequest('POST', '/api/v1/characters', {
        payload: { id: secondId, document: hostedDocument('List B') }
      });
      const updated = await characterRequest('PUT', `/api/v1/characters/${firstId}`, {
        payload: { expectedRevision: 1, document: hostedDocument('List A updated') }
      });
      expect(updated.statusCode).toBe(200);

      const list = await characterRequest('GET', '/api/v1/characters');
      expect(list.statusCode).toBe(200);
      const characters = list.json().characters;
      expect(characters.map(character => character.id)).not.toContain(`other-only-${unique}`);
      for (let index = 1; index < characters.length; index += 1) {
        const previous = characters[index - 1];
        const current = characters[index];
        const timestampOrder = Date.parse(previous.updatedAt) - Date.parse(current.updatedAt);
        expect(timestampOrder > 0 || (timestampOrder === 0 && previous.id <= current.id)).toBe(true);
      }
    });

    it('enforces JSON object storage and cascades characters when a Better Auth user is deleted', async () => {
      await expect(appDatabase.pool.query(`
        INSERT INTO characters (owner_id, id, schema_version, document_json)
        VALUES ($1, $2, $3, $4::jsonb)
      `, [primaryUserId, `scalar-${unique}`, 2, JSON.stringify('not-an-object')]))
        .rejects.toMatchObject({ code: '23514', constraint: 'characters_document_json_object_check' });

      const cascadeSignup = await post('/api/auth/sign-up/email', {
        name: 'Cascade Owner',
        email: cascadeEmail,
        password
      });
      const cascadeCookie = sessionCookie(cascadeSignup);
      const cascadeUser = await appDatabase.pool.query('SELECT id FROM "user" WHERE email = $1', [cascadeEmail]);
      const cascadeUserId = cascadeUser.rows[0].id;
      const cascadeId = `cascade-${unique}`;
      const created = await characterRequest('POST', '/api/v1/characters', {
        cookie: cascadeCookie,
        payload: { id: cascadeId, document: hostedDocument('Cascade character') }
      });
      expect(created.statusCode).toBe(201);

      await appDatabase.pool.query('DELETE FROM "user" WHERE id = $1', [cascadeUserId]);
      const remaining = await appDatabase.pool.query(
        'SELECT id FROM characters WHERE owner_id = $1',
        [cascadeUserId]
      );
      expect(remaining.rows).toEqual([]);
    });
  });
} else {
  describe.skip('Drizzle migration and Better Auth PostgreSQL integration', () => {
    it('requires TEST_DATABASE_URL (PostgreSQL-backed auth scenarios skipped locally)', () => {});
  });
}
