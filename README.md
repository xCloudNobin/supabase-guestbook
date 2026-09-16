# Supabase Guestbook

A basic TypeScript application built with Next.js, Supabase, and Docker Compose for xCloud.

The production Compose stack runs the app with a private, persistent Supabase data layer:

- `supabase/postgres` for the database and Supabase PostgreSQL extensions
- PostgREST for the Supabase REST API used by `@supabase/supabase-js`
- the Next.js application as the only publicly exposed service

The guestbook does not need Auth, Studio, Storage, Realtime, or Analytics, so those services are intentionally omitted to fit a small server. The internal REST and database ports are not published.

## Supabase setup

1. Create a Supabase project.
2. Run `supabase/schema.sql` in the Supabase SQL editor.
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

The Compose deployment publishes the app on port `8102`. Database data is persisted in the `supabase_db` named volume.
