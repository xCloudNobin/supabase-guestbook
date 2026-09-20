# Supabase Guestbook

A small full-stack TypeScript application built with Next.js (App Router), Supabase, and Docker Compose for xCloud.

It renders a **server-side (SSR)** list of guestbook messages and hydrates into an interactive client that can create, edit, and delete messages. All reads and writes go through Next.js server routes against a **real, persistent Supabase** data layer (PostgreSQL + PostgREST) self-hosted with Docker Compose — no mocks.

![stack](https://img.shields.io/badge/Next.js-16-blue.svg) ![stack](https://img.shields.io/badge/Supabase-persistent-green.svg) ![stack](https://img.shields.io/badge/Docker%20Compose-private%20stack-lightgrey.svg)

## Features

- **SSR data view** — the home page queries Supabase on the server and renders the message list into HTML before hydration.
- **Hydration / client interaction** — the embedded client component re-syncs with the server and drives the form, inline edit, and delete controls.
- **Server-side Supabase CRUD** — `POST` (create), `GET` (list), `PATCH` (edit), `DELETE` via Next.js route handlers, with validation on every write (400 on empty/oversized input).
- **Health / readiness** — `/api/health` is a liveness endpoint; `/api/ready` genuinely runs a query against the database (PostgREST → Postgres) and returns 503 when the DB path is broken.
- **Persistence** — messages are stored in the `supabase_db_v3` named volume and survive container and full-stack restarts.
- **Production checks** — `scripts/verify.sh` builds the bundle and verifies readiness, CRUD, validation, schema, SSR, and persistence across a restart against the real stack.

## Architecture

The production Compose stack runs the app with a private, persistent Supabase data layer:

- `supabase/postgres` — the database and Supabase PostgreSQL extensions (schema applied on first boot from `supabase/schema.sql`)
- PostgREST — the Supabase REST API used by `@supabase/supabase-js`
- nginx — routes the internal REST path; only the app is published
- the Next.js application as the only publicly exposed service

The guestbook does not need Auth, Studio, Storage, Realtime, or Analytics, so those services are intentionally omitted to fit a small server. The internal REST and database ports are not published.

## Supabase setup

1. Create a Supabase project (or use the bundled Compose stack).
2. Run `supabase/schema.sql` in the Supabase SQL editor (Compose applies it automatically).
3. Copy `.env.example` to `.env.local` and fill in the project URL and anon key.

The app starts without credentials when run outside Compose and displays a setup notice. Credentials are only read on the server.

## Local development

```bash
npm install
npm run dev
```

## Production

```bash
npm run build
npm start
```

Or start the complete app and Supabase data layer:

```bash
docker compose up --build
```

The Compose deployment publishes the app on port `8104` bound to `127.0.0.1`. Database data is persisted in the `supabase_db_v3` named volume. The database credential is scoped to the private Compose network; the database port is not published. Externalize and rotate it before exposing PostgreSQL outside that network.

### Compose image build on network-restricted (xCloud) hosts

Building the app image needs outbound access to the image and npm registries
inside the BuildKit network. On xCloud hosts that allow no egress from builds,
`docker compose up --build` stops at metadata resolution even though
`node:22-alpine`, Postgres, PostgREST, and nginx images are already local:

```text
failed to resolve source metadata for docker.io/library/node:22-alpine: ... i/o timeout
```

Everything else runs for real. To qualify the complete data layer on such a host,
start only the data stack and run the standalone Next.js server against it on the
loopback interface — this is exactly what `scripts/verify.sh` does:

```bash
bash scripts/verify.sh
```

On a host with normal build egress, the full stack runs as documented above.

## API

| Method | Path                    | Description                                        |
| ------ | ----------------------- | -------------------------------------------------- |
| GET    | `/api/messages`         | List the 20 most recent messages                  |
| POST   | `/api/messages`         | Create a message (`{ name, message }`, validated) |
| PATCH  | `/api/messages`         | Update a message (`{ id, name?, message? }`)      |
| DELETE | `/api/messages?id=ID`   | Delete a message                                  |
| GET    | `/api/health`           | Liveness (`status: ok`)                           |
| GET    | `/api/ready`            | Readiness — genuinely queries the database        |

## Verification

```bash
bash scripts/verify.sh
```

The script builds the Next.js standalone production bundle, starts the real
Postgres + PostgREST + nginx stack with `scripts/verify.compose.yml`
(publishing only the internal REST API on a loopback port), and runs the
standalone server against it. It is honest about the data layer — no mocks:

1. `/api/ready` passes only when the database is genuinely reachable,
2. server-side CRUD — `GET`, `POST`, `PATCH`, `DELETE` — against Postgres,
   with validated-write rejection (empty/oversized/typoed input → 400,
   missing rows → 404),
3. the `public.messages` schema (with RLS) is present in Postgres,
4. a seeded message persists across a full data-stack restart
   (`docker compose restart`) on the same named volume,
5. the standalone server serves the server-rendered page.

The script tears down the standalone server and the stack it started when done
(`VERIFY_KEEP_STACK=1` leaves the stack up). Required tools: `docker`,
`node`, `npm`, `curl`, `jq`. It never touches other Compose projects.

## Security notes

Like a public guestbook, the API intentionally allows anonymous reads, writes, and edits with row-level security policies that currently permit them. If you need ownership or moderation, add an `owner` column, wire up Supabase Auth, and narrow the RLS policies in `supabase/schema.sql`.

## License

[MIT](./LICENSE)
