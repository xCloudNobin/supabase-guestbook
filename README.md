# Supabase Guestbook

A basic TypeScript application built with Next.js, Supabase, and Docker for xCloud.

## Supabase setup

1. Create a Supabase project.
2. Run `supabase/schema.sql` in the Supabase SQL editor.
3. Copy `.env.example` to `.env.local` and fill in the project URL and anon key.

The app starts without credentials and displays a setup notice. Credentials are only read on the server.

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

Or build and run the container:

```bash
docker build -t supabase-guestbook .
docker run --rm -p 3000:3000 --env-file .env.local supabase-guestbook
```
