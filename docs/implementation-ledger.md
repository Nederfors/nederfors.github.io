# Implementation ledger

## Preserved work

Batches 1-3 are complete. Their frontend mutation planning, proof tokens,
store semantics, state/DOM postconditions, exact-removal correctness, Dexie
queue behavior, and performance work are not reopened by the online-first
architecture. The local checkout is 26 commits ahead of the local
`origin/main` reference at this gate and is the authoritative starting point.
Unrelated working-tree changes present on 2026-07-22 remain untouched.

## Hosting/backend architecture gate

Decision: accepted with one external provisioning prerequisite.

- Production topology: one application-capable Linux runtime for
  `symbapedia.se`, serving the Vite/PWA and reverse-proxying same-origin `/api`
  to Fastify, plus managed PostgreSQL.
- STRATO condition: use the current STRATO product only if the customer account
  proves it is an application/VPS product and every capability gate in
  `docs/architecture/online-character-contract.md` passes. SFTP/SSH webspace
  access alone does not pass. Classic Webhosting is ineligible for the backend.
- Runtime: current patched Node 24 LTS baseline, revalidated against current
  Fastify support immediately before Batch 4 installation.
- Server libraries: Fastify, Drizzle ORM, `pg`, and Drizzle Kit.
- Authentication: Better Auth plus its then-current Drizzle adapter/package in
  Batch 6, not Batch 4.
- Email: a transactional email provider is the Batch 6 verification/recovery
  boundary.
- Static rules: remain versioned files under `/data`, outside PostgreSQL.
- Local/offline characters: Dexie remains first-class and immediately writable.

Unresolved external prerequisite: identify the purchased STRATO plan and either
prove the full gate or provision the one eligible Linux application runtime and
managed PostgreSQL. Record the PostgreSQL TLS/network policy, backup retention,
restore procedure, runtime secret facility, DNS/certificate path, and health
monitor before production deployment. This prerequisite does not change the
selected application architecture.

## Batch 4: server foundation

### Completed in Batch 4A

Primary documentation was rechecked at implementation time. Node 24.18.0 is
the current accepted Node 24 LTS patch; the committed lockfile resolves
Fastify 5.10.0, Drizzle ORM 0.45.2, `pg` 8.22.0, and Drizzle Kit 0.31.10.
No Better Auth package or adapter was installed.

- `server/app.js` creates Fastify without binding a port; `server/start.js`
  binds it and owns bounded signal shutdown. `server/routes/health.js` defines
  the only Batch 4 route, `GET /api/v1/health`.
- `server/config.js` validates environment, host, port, proxy trust, shutdown
  timing, PostgreSQL URL, pool/timeouts, and production TLS/private-network
  policy without including connection values in validation errors.
  The runtime contract is `NODE_ENV`, optional `HOST`/`PORT`/`TRUST_PROXY`,
  required `DATABASE_URL`, optional `DATABASE_POOL_MAX`,
  `DATABASE_IDLE_TIMEOUT_MS`, `DATABASE_CONNECTION_TIMEOUT_MS`,
  `DATABASE_STATEMENT_TIMEOUT_MS`, `DATABASE_HEALTHCHECK_TIMEOUT_MS`,
  `DATABASE_SSL_MODE`, `DATABASE_PRIVATE_NETWORK`, and `DATABASE_SSL_CA`.
  `DATABASE_URL` must not carry SSL switches: TLS/private-network policy has
  one explicit configuration boundary and is never a `VITE_*` value.
- `server/db/client.js` owns one bounded `pg` pool and Drizzle client. It uses
  verified TLS when configured, supports an explicitly declared private-network
  production connection, applies bounded query/connect timeouts, and closes the
  pool exactly once.
- `drizzle.config.js`, `drizzle/0000_baseline.sql`, and the journal establish a
  committed SQL migration path. `npm run db:migrate` uses Drizzle's PostgreSQL
  migrator and is repeatable; the no-domain `SELECT 1` baseline exists solely
  to prove migrator history. It creates only Drizzle's migration journal table,
  never application, auth, or character tables. `db:generate` and `db:check`
  remain the Drizzle Kit authoring/validation commands; schema push is not a
  release mechanism.
- Vite proxies local `/api` traffic to `API_PROXY_TARGET` (default loopback
  Fastify), preserving same-origin relative client URLs. Production CORS was
  not added and static builds remain independent of server secrets.
- The service worker returns before `respondWith()` for every same-scope
  `/api/*` request. Unit coverage proves health, future character, and auth
  JSON requests do not reach Cache Storage while `/data/*.json` still caches.
- CI now runs Node 24.18.0, existing static validation, Drizzle metadata
  validation, server/config tests, and repeatable migration checks against an
  ephemeral PostgreSQL 16 service, including Fastify health success against
  that real disposable database. It contains no production database secret.
- `ops/README.md` is a portable operations handoff: loopback/private Fastify,
  HTTPS before the app, never-static/never-cached API paths, runtime-only
  secrets, migration-before-promotion, health readiness, and graceful restart.
  It intentionally contains no provider-specific deployment configuration.

### Batch 4B entry point and blocker

The external prerequisite remains unresolved: verify or provision the selected
application-capable Linux runtime and managed PostgreSQL, including its
TLS/private-network decision, secret facility, backup/restore proof, and
monitoring. Once that is complete, start Batch 4B from `ops/README.md` and the
architecture gate: add the verified concrete reverse proxy, process supervisor,
release switch, one-shot migration execution, readiness monitor, and rollback
runbook. Do not infer any of those production details from the static GitHub
Pages/STRATO deployment.

No hosted-character table or auth/user table is needed to prove Batch 4. The
health query, migration runner/journal, and deployment checks prove the
infrastructure without creating speculative domain schema.

### Expected starting files

Existing files to change:

- `package.json` and `package-lock.json`
- `vite.config.js`
- `sw.js`
- `.github/workflows/build.yaml`
- existing service-worker/PWA test suites

Expected new implementation areas (names may be adjusted only to match the
repository's JavaScript/ESM conventions):

- `server/config.js`
- `server/app.js`
- `server/start.js`
- `server/db/client.js`
- `server/routes/health.js`
- `drizzle.config.js`
- `drizzle/` for committed migrations
- production runtime/reverse-proxy configuration under one `ops/` area
- focused server configuration, health, and database integration tests

`js/persistence.js` is not a Batch 4 implementation file. Its later minimal
post-Dexie-commit adapter seam is specified in the architecture contract.

### Do not implement

- Signup, login, sessions, Better Auth setup, email delivery, or auth/user
  tables.
- Hosted-character CRUD or the recorded character table.
- Synchronization, durable outbox/idempotency metadata, conflict UI, or local
  data migration.
- Projection Core or any RPG mutation/planning/calculation change.
- Static rule/catalog data in PostgreSQL.
- CORS for the selected same-origin production topology.

## Batch 6 account and hosted-character boundary

Tasks 1-2 are complete: Better Auth 1.6.24 and its Drizzle/PostgreSQL schema
are configured behind same-origin `/api/auth/*`, and the owned,
revision-checked hosted-character CRUD routes exist on the server.

Task 3 is complete: the vanilla browser client now provides a small account
surface for session lookup, email/password login, signup, and logout. It uses
HTTP-only Better Auth session cookies, stays same-origin, and does not connect
or mutate Dexie characters or call hosted-character routes. Signup remains
controlled exclusively by the server rollout setting and production signup is
still disabled by default.

Task 4, verification/recovery email and its transactional email provider, is
the remaining Batch 6 boundary. Production signup stays disabled until that
work is complete. Batch 9 may add synchronization/idempotency persistence only
when its revision/conflict work proves it necessary. Dexie remains the local
working copy throughout.

## Gate-task validation

This gate changed documentation only. It did not install packages, alter
`package.json` or `package-lock.json`, create server/schema files, change the
service worker, deploy a production artifact, run a migration, or change DNS or
hosting. The decision is grounded in the current local persistence, service
worker and PWA tests, Vite configuration, static build/deploy workflow, and
legacy-origin transfer implementation, plus the linked primary hosting and
library documentation.
