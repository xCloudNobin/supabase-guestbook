import type { Metadata } from "next";
import { listMessages } from "../lib/messages";
import { getSupabaseClient } from "../lib/supabase";
import { Guestbook } from "./Guestbook";

export const metadata: Metadata = {
  title: "Supabase Guestbook",
  description: "A tiny TypeScript Server-Rendered app with a Supabase database, deployed with Docker on xCloud.",
};

export const dynamic = "force-dynamic";

export default async function Home() {
  const configured = Boolean(getSupabaseClient());
  const { messages, error } = await listMessages(20);

  return (
    <main>
      <header className="hero">
        <p className="eyebrow">TypeScript · Supabase · xCloud</p>
        <h1>Supabase Guestbook</h1>
        <p>A small full-stack app with a typed Next.js UI, API routes, and a Supabase database.</p>
      </header>

      {!configured ? (
        <aside className="notice">
          <strong>Supabase setup needed</strong>
          <span>Add the two environment variables documented in the repository to enable messages.</span>
        </aside>
      ) : null}

      <Guestbook initialMessages={messages ?? []} configured={configured} serverError={error} />
    </main>
  );
}
