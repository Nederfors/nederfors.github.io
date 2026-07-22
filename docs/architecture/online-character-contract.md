# Online character architecture contract

Status: accepted architecture gate, 2026-07-22. This document authorizes the
Batch 4 foundation only; it does not authorize backend or account features in
this decision task.

## Decision

Symbapedia will use one production architecture: an application-capable Linux
runtime terminates HTTPS for `symbapedia.se`, serves the existing Vite/PWA
artifact, and reverse-proxies same-origin `/api/*` requests to Fastify.
Fastify uses Drizzle ORM and `pg` to reach managed PostgreSQL over an encrypted,
non-browser connection.

```text
                         symbapedia.se
                               |
                      HTTPS reverse proxy
                               |
              +----------------+----------------+
              |                |                |
          / and assets       /data/*          /api/*
          static dist/     static rules     Fastify process
                                                  |
                                             Drizzle + pg
                                                  |
                                       managed PostgreSQL
```

The existing STRATO product may host this topology only if the account is
verified to be a VPS/application product that passes every capability in the
hosting gate below. If it is classic STRATO Webhosting, it is not eligible and
an application-capable Linux VPS/managed runtime must be provisioned. This is a
host-selection condition, not a second backend design: the routes, process,
database, deployment, and client contracts remain the single topology above.

The repository does not identify the purchased STRATO plan. Its generated
SFTP username, password, host, and static upload workflow establish webspace
access only. STRATO documents that classic Webhosting cannot run Node.js and
that Node requires a server product with administrative control. STRATO also
documents MySQL/MariaDB, rather than PostgreSQL, for Webhosting packages.
Consequently, the current static deployment must not be treated as proof that
Fastify can run there.

Primary evidence checked for this gate:

- [STRATO Node.js hosting](https://www.strato.de/server/node-js-hosting/) says
  classic Webhosting cannot run Node.js, while a root-controlled server can
  install the required Node version, use process supervision, and put Node
  behind an Nginx reverse proxy.
- [STRATO SSH/SFTP documentation](https://www.strato-hosting.co.uk/faq/hosting/how-to-use-ssh-sftp/)
  describes SFTP as encrypted webspace file transfer and optional SSH as a
  shell scoped to that webspace. Neither is evidence of root control or a
  persistent service facility.
- [STRATO Webhosting database documentation](https://www.strato-hosting.co.uk/faq/hosting/this-is-how-you-can-use-our-database/)
  documents MySQL/MariaDB connectivity and backups, not PostgreSQL.
- [STRATO VPS documentation](https://www.strato.de/server/vps/) documents full
  root control, fixed IP connectivity, and SSL availability. Those properties
  make a VPS an eligible application runtime, subject to the operational gate
  below.

`nederfors.github.io` may continue receiving the static artifact so the
origin-checked legacy transfer bridge remains available. It will not host the
production API or auth endpoints. `symbapedia.se` is the one authoritative
online origin.

## Hosting capability gate

The operator must identify the exact STRATO product in the customer account
before Batch 4 production deployment. A pass requires evidence for every row;
an unknown is a failure until verified.

| Capability | Minimum production contract | Evidence now |
| --- | --- | --- |
| Persistent Node process | A continuously running Node service, not CGI or an interactive SSH command | Not present in repository; classic STRATO Webhosting is documented as unsupported |
| Node runtime | Current supported LTS, pinned to an exact patch in deployment; Node 24 LTS is the decision-time baseline | CI uses Node 22 only; a root-controlled server can install the required line |
| Supervision/restart | Automatic restart after crash and boot, bounded shutdown, deploy-time restart, and logs; systemd or a managed equivalent | No current production facility; root/managed runtime required |
| Reverse proxy | Same-origin path routing, request limits/timeouts, forwarded-header trust, and no caching for `/api/*` | No current workflow/configuration evidence; Nginx or managed equivalent required |
| HTTPS termination | Valid automatically renewed certificate and HTTP-to-HTTPS redirect for `symbapedia.se` | STRATO products can supply SSL, but the selected runtime and live renewal path still require validation |
| Environment/secrets | Runtime-only secret injection with access control and rotation; no values in `dist/`, source, logs, or `VITE_*` variables | Current GitHub secrets cover SFTP only |
| PostgreSQL | Managed PostgreSQL reachable from the app runtime through a private network, or through verified TLS plus a network allowlist | STRATO Webhosting documents MySQL/MariaDB only; PostgreSQL service and connectivity are unprovisioned |
| Migrations | One-shot release job with a single runner, failure stopping rollout, and committed migration history | Not present |
| Backup/restore | Automated database backups with stated retention/PITR plus a tested restore procedure | Not present; webspace backups are not PostgreSQL backups |
| Rollback | Immutable application releases and previous-release switch; database changes use expand/contract or a forward repair/restore plan | Static SFTP mirror-delete is not a server rollback plan |
| Health/monitoring | External HTTPS readiness probe, process/database alerts, and centralized application logs | Not present |

The selected production class is therefore a Linux VPS/managed application
runtime plus managed PostgreSQL. A STRATO VPS is acceptable if the current
account is one or is provisioned and the complete gate passes. Classic
Webhosting remains suitable only as a static mirror and is not part of the
production request path after cutover.

## Runtime and library decisions

Fastify is the future HTTP application boundary. It owns `/api/v1` routing,
full request/response schemas, serialization, common error responses,
lifecycle hooks, structured logging, and health/readiness behavior. It does
not own RPG mutation planning, calculations, proof tokens, store semantics,
state/DOM postconditions, or exact-removal logic.

[Fastify v5 requires Node 20 or newer](https://fastify.dev/docs/latest/Guides/Migration-Guide-V5/),
and Fastify's [LTS policy](https://fastify.dev/docs/latest/Reference/LTS/)
tracks supported Node LTS lines. Node 20 is already end-of-life at the decision
date; the [Node release schedule](https://nodejs.org/en/about/previous-releases)
lists Node 24 as LTS. Batch 4 will therefore align development, CI server tests,
and production on the latest patched Node 24 LTS release unless primary
documentation at implementation time identifies a newer mutually supported
LTS. Fastify must not be downgraded to fit static/shared hosting.

Drizzle ORM with the `pg` driver is the server persistence layer for hosted,
mutable, user-specific state. Drizzle's current
[PostgreSQL documentation](https://orm.drizzle.team/docs/get-started/postgresql)
supports the `node-postgres` driver, and
[Drizzle Kit](https://orm.drizzle.team/docs/drizzle-kit-generate) can generate
committed SQL migrations that a release job applies. Static rule/catalog JSON
does not move to PostgreSQL.

Better Auth is reserved for the later account/hosted-character vertical slice.
Its current documentation has both a
[Fastify integration](https://better-auth.com/docs/integrations/fastify) and a
[separately installed Drizzle adapter](https://better-auth.com/docs/adapters/drizzle)
with PostgreSQL (`provider: "pg"`) support. Batch 6 must re-check the then-current
package and adapter requirements before installing them; Batch 4 does not
install, configure, generate tables for, or initialize Better Auth.

No remembered package version is part of this decision. Immediately before
installation, Batch 4 must resolve current stable, mutually supported releases
of `fastify`, `drizzle-orm`, `pg`, and `drizzle-kit` from primary documentation
and record the resolved lockfile. Batch 6 repeats that check for `better-auth`
and its adapter/package shape.

For verification and recovery email, the intended boundary is a transactional
email service called by Better Auth's email callbacks in Batch 6, not direct
mail logic in the client or Fastify routes. Better Auth documents callbacks for
[email verification and password reset](https://better-auth.com/docs/concepts/email).
Existing STRATO SMTP is not the selected production dependency; it can be
reconsidered only if sender authentication, rate limits, delivery monitoring,
DKIM/DMARC, and recovery-email reliability are explicitly verified.

## Routes and deployment responsibility

Production path ownership is:

```text
GET / and static asset paths     -> immutable/versioned Vite dist/
GET /data/*                      -> versioned/cacheable static rule data
/api/v1/*                        -> Fastify application API
/api/auth/*                      -> Better Auth handler in Batch 6
```

The reverse proxy terminates HTTPS, serves `dist/`, never directory-falls back
`/api/*` to `index.html`, never caches `/api/*`, and proxies only `/api/*` to a
Fastify listener bound to a private/loopback interface. Fastify trusts proxy
headers only from that known proxy. Same-origin cookies and fetches are the
default, so production does not require CORS.

Local development runs Vite and Fastify as separate processes, with Vite
proxying `/api` to the local Fastify port. Application code uses relative
`/api/...` URLs in both environments. CORS is not added merely to support local
development.

The current workflow's static artifact remains valid, but Batch 4 adds a
separate server release and deployment responsibility. The production order is
build/test, create immutable release, run the one-shot migration job, start or
restart the supervised service, switch the active static/server release, and
probe `https://symbapedia.se/api/v1/health`. A failed migration or health probe
stops promotion and triggers rollback to the previous application release. Database changes
must be backward-compatible across the rollout; destructive rollback uses a
documented forward repair or verified database restore, not an automatic down
migration.

`GET /api/v1/health` is Batch 4's only application endpoint. It is a readiness
check: it returns a small non-sensitive success response only when runtime
configuration is valid and PostgreSQL answers a bounded connectivity query,
otherwise `503`. Process supervision supplies liveness; the deployment and an
external monitor call readiness over HTTPS.

## Hosted data shape and API boundary

Hosted characters remain whole documents. The later starting shape is:

```text
characters
- id
- owner_id
- revision
- schema_version
- document_json JSONB
- created_at
- updated_at
```

This is a design contract, not permission to create the table in Batch 4.
Inventory, traits, abilities, powers, notes, and similar RPG content are not
normalized into relational tables without measured evidence of a requirement.
Server data is limited to Better Auth tables later, character ownership and
document metadata, and synchronization/idempotency metadata only if Batch 9
proves it necessary.

The intended application surface is recorded now but character endpoints are
not Batch 4 work:

```text
GET    /api/v1/health

GET    /api/v1/characters
POST   /api/v1/characters
GET    /api/v1/characters/:id
PUT    /api/v1/characters/:id
DELETE /api/v1/characters/:id
```

Every character operation later filters by the authenticated owner on the
server. Whole-document updates carry an explicit expected revision and use one
atomic revision-conditioned update that increments and returns the new
revision. A mismatch is a conflict, never a last-write-wins overwrite. The
exact HTTP carrier for the expected revision is left to the hosted-character
contract in that vertical slice.

## Authority and offline model

- Anonymous/local user: Dexie is authoritative; no hosted character is
  required.
- Authenticated and online: the server owns the authoritative hosted revision.
  Dexie remains the immediate working copy/cache, so edits do not wait for
  field-level network round trips.
- Authenticated and offline: Dexie remains usable. Completed local changes can
  become pending synchronization work rather than failing editing.
- Reconnect: later synchronization compares explicit server revisions. It
  never silently performs a destructive merge. The finite conflict choices
  remain **keep local**, **keep server**, or **duplicate**.

CRDTs, realtime collaboration, WebSockets, and server-side field merges are
outside the architecture.

## Persistence seam

`saveCharacterFields()` and its lazy field resolver remain unchanged. The
smallest future seam belongs after a successful local commit, not in the
UI/store and not before the IndexedDB transaction:

```text
UI/store
   -> existing persistence API and queue
      -> commitPendingWrites() succeeds in Dexie
         -> completed-character notification
            -> optional hosted/sync adapter
```

When the synchronization batch is implemented, `commitPendingWrites()` can
return the affected character IDs/operation kinds. `flushPendingWrites()` can
coalesce those results and notify a registered adapter only after all relevant
Dexie transactions succeed. The adapter consumes a cloned final whole
character document (or a deletion), not raw field patches. Hosted/network
failure must not turn a successful local flush into a failed edit.

This notification is a wake-up seam, not a premature durable outbox design.
Startup/reconnect revision comparison remains sufficient until Batch 9 proves
that additional IndexedDB synchronization/idempotency metadata is necessary.
The UI and store never import or address Fastify directly.

## Service-worker and HTTP cache boundary

Static application and rule assets may retain strong/versioned caching and
offline service-worker behavior. Mutable hosted state may not become
stale-authoritative:

- `/api/auth/*` responses use `Cache-Control: no-store` and are never answered
  from Cache Storage.
- `/api/v1/characters*` responses use `Cache-Control: no-store` and are never
  answered from Cache Storage.
- The reverse proxy does not cache `/api/*`.
- Offline character access comes from Dexie and explicit synchronization
  state, never an opaque cached API response.

The exact Batch 4 service-worker change is an early same-scope `/api/` path
bypass in the `fetch` handler before `isJsonRequest()`, navigation, or static
runtime caching. This is necessary because the current `isJsonRequest()` also
matches any request advertising `Accept: application/json`; without the bypass,
an API GET could enter `rulesAwareJson()` and the stale-while-revalidate JSON
cache. Batch 4 tests must prove that `/api/v1/*` and `/api/auth/*` GETs are not
intercepted or written to Cache Storage while `/data/*.json` retains its
existing offline behavior.

## Security and operations boundary

Later implementation must preserve all of these requirements:

- HTTPS only in production.
- Authentication uses Better Auth and HTTP-only, Secure, appropriate SameSite
  session cookies; no custom password, session, or token implementation.
- Same-origin deployment is preferred and is the selected topology.
- Every hosted-character operation enforces ownership server-side.
- Database credentials, auth secrets, and mail credentials exist only in the
  server/runtime secret store; they are never embedded in Vite/client bundles.
- PostgreSQL is not reachable from the browser/public network. Connections use
  verified TLS or a private network and least-privilege roles.
- SQL is parameterized/Drizzle-generated.
- Character writes use optimistic revisions and atomic revision-conditioned
  updates.
- Database migrations are committed, repeatable, run once per release, and
  observable.
- Automated backup retention and a successful restore drill are documented
  before any user-data migration.

## Explicit non-goals

This gate and Batch 4 do not implement signup/login, Better Auth or auth tables,
hosted-character CRUD, synchronization, an outbox, migration of existing local
characters, Projection Core, RPG mutation changes, static rule data in SQL,
realtime features, CRDTs, or field-level server merging.
