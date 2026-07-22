# Batch 4A runtime handoff

This directory deliberately does not select a hosting provider or contain a
production deployment. Batch 4B starts only after the selected Linux runtime
and managed PostgreSQL service have been provisioned or verified against the
architecture gate in `docs/architecture/online-character-contract.md`.

The selected runtime must serve the built static site and reverse-proxy only
`/api/*` to Fastify on a loopback or private interface. It must not statically
serve, SPA-fallback, or proxy-cache API paths. HTTPS terminates before traffic
reaches the application. Runtime secrets, including `DATABASE_URL`, are never
part of the static build or client environment.

Before a release is promoted, run `npm run db:migrate` exactly once with the
release's runtime secrets, then verify `GET /api/v1/health`. Process
supervision must use graceful restarts so Fastify can close its PostgreSQL pool.
The concrete reverse proxy, supervisor, release switch, secret facility,
PostgreSQL TLS/private-network policy, monitoring, backup/restore proof, and
migration wiring are Batch 4B work after the external prerequisite is met.
