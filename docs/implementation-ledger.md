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

### Resolve and install

Resolve current stable, mutually supported releases from primary documentation
at implementation time and commit the resulting lockfile:

- `fastify`
- `drizzle-orm`
- `pg`
- `drizzle-kit` as development tooling

Do not install `better-auth` or `@better-auth/drizzle-adapter` (or its
then-current replacement) until Batch 6.

### Implement

- A testable Fastify application factory and a separate production bootstrap.
- Validated runtime configuration with fail-fast handling for bind address,
  port, proxy trust, environment, and PostgreSQL connection settings.
- A bounded `pg` pool and Drizzle connection. Production PostgreSQL uses
  a private network, or certificate-verified TLS plus a network allowlist.
- Drizzle Kit configuration, committed repeatable migrations, and a one-shot
  deployment migration command. The Batch 4 baseline contains no application
  domain tables; if the migrator needs a committed baseline to prove execution,
  it is a no-domain migration plus the migration journal.
- `GET /api/v1/health` as a non-sensitive readiness probe with a bounded
  PostgreSQL check and `503` on failure.
- Structured logging, common error handling, graceful shutdown, and pool close.
- Production release/reverse-proxy configuration for the one selected runtime:
  HTTPS, static `dist/`, `/api/*` proxying, supervision/restart, secret
  injection, logs, external readiness monitoring, and application rollback.
- A Vite development proxy for `/api` so application code remains same-origin
  and production CORS is unnecessary.
- The early `/api/` service-worker bypass and tests proving neither
  `/api/v1/*` nor `/api/auth/*` enters Cache Storage; preserve `/data` rule
  caching and existing PWA/offline tests.
- CI/deployment validation for the pinned Node LTS, configuration failure,
  migration execution, PostgreSQL connectivity, health success/failure,
  reverse-proxy routing, and post-deploy readiness.
- Deployment documentation covering migration ordering, immutable release
  rollback, PostgreSQL backup retention/PITR, and a restore drill.

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

## Later boundaries

Batch 6 revalidates and installs Better Auth and its current Drizzle/PostgreSQL
adapter, implements the account/hosted-character vertical slice and
verification/recovery email integration, and owns the recorded character CRUD
routes. Batch 9 may add synchronization/idempotency persistence only when its
revision/conflict work proves it necessary. Both continue to use Dexie as the
local working copy and the finite keep-local, keep-server, or duplicate
conflict model.

## Gate-task validation

This gate changed documentation only. It did not install packages, alter
`package.json` or `package-lock.json`, create server/schema files, change the
service worker, deploy a production artifact, run a migration, or change DNS or
hosting. The decision is grounded in the current local persistence, service
worker and PWA tests, Vite configuration, static build/deploy workflow, and
legacy-origin transfer implementation, plus the linked primary hosting and
library documentation.
