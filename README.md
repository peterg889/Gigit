# Gigit

A three-sided marketplace connecting **bands & comedians**, **sound techs**, and **small venues** (bars, breweries, coffee shops, restaurants) for live entertainment booking.

## Documents

| Doc | What it covers |
|---|---|
| [`PRD.md`](PRD.md) | Product requirements — personas, business model, functional requirements |
| [`docs/engineering-spec.md`](docs/engineering-spec.md) | Architecture, the 11 load-bearing commitments, build plan |
| [`docs/m0-technical-spec.md`](docs/m0-technical-spec.md) | Component-level spec for the M0 walking skeleton (this codebase) |
| [`research/`](research/) | Competitive landscape, metro selection, AI-era features, outreach API wishlist |

## Codebase

pnpm monorepo:

```
packages/domain   pure TypeScript — booking state machine, fee schedule, sound-plan engine, zod schemas
packages/db       drizzle schema, transactional transition runner, events outbox, seed
apps/web          Next.js (App Router) — UI + all API routes
apps/worker       outbox dispatcher, pg-boss booking timers, timer reconciler
```

Key invariants (see engineering spec §5):
- Booking state changes happen ONLY through `runBookingTransition()` — one transaction: row lock → pure domain decision → versioned update → outbox event.
- Every side effect is data in the `events` table; the worker interprets it (at-least-once, idempotent).
- M0 runs the **full** state machine with a `NullPaymentGateway` (auto-succeeds); Stripe lands in M1 without touching the machine.

## Quickstart

```bash
docker compose up -d db        # Postgres 16 on :5433 (or use any local PG and set DATABASE_URL)
cp .env.example .env
pnpm install
pnpm db:migrate
pnpm db:seed                   # demo venue, performers, tech, open slots
pnpm dev                       # web on :3000 + worker
```

Sign in at `/login` — dev environments accept the OTP code `000000`.

## Tests

```bash
pnpm typecheck
pnpm test       # 150 domain tests (exhaustive state×event table) + db integration + web unit
```
