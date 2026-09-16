"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type Message = {
  id: number;
  name: string;
  message: string;
  created_at: string;
};

type MessagesResponse = {
  configured: boolean;
  messages: Message[];
  error?: string;
};

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);

  const loadMessages = useCallback(async () => {
    const response = await fetch("/api/messages", { cache: "no-store" });
    const data = (await response.json()) as MessagesResponse;
    setConfigured(data.configured);
    setMessages(data.messages ?? []);
    if (!response.ok && data.error) setStatus(data.error);
  }, []);

  useEffect(() => {
    loadMessages().catch(() => setStatus("Could not reach the API."));
  }, [loadMessages]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setStatus("");

    try {
      const response = await fetch("/api/messages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, message }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not save the message.");
      setName("");
      setMessage("");
      setStatus("Message saved.");
      await loadMessages();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save the message.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main>
      <header className="hero">
        <p className="eyebrow">TypeScript · Supabase · xCloud</p>
        <h1>Supabase Guestbook</h1>
        <p>A small full-stack app with a typed Next.js UI, API routes, and a Supabase database.</p>
      </header>

      {configured === false ? (
        <aside className="notice">
          <strong>Supabase setup needed</strong>
          <span>Add the two environment variables documented in the repository to enable messages.</span>
        </aside>
      ) : null}

      <section className="grid">
        <form className="card" onSubmit={submit}>
          <h2>Leave a message</h2>
          <label>
            Name
            <input value={name} onChange={(event) => setName(event.target.value)} maxLength={60} required />
          </label>
          <label>
            Message
            <textarea value={message} onChange={(event) => setMessage(event.target.value)} maxLength={280} required />
          </label>
          <button disabled={saving || configured !== true}>{saving ? "Saving…" : "Sign guestbook"}</button>
          <p className="status" aria-live="polite">{status}</p>
        </form>

        <section className="card messages">
          <h2>Recent messages</h2>
          {configured === null ? <p>Loading…</p> : null}
          {configured && messages.length === 0 ? <p>No messages yet. Be the first.</p> : null}
          {messages.map((item) => (
            <article key={item.id}>
              <div>
                <strong>{item.name}</strong>
                <time dateTime={item.created_at}>{new Date(item.created_at).toLocaleDateString()}</time>
              </div>
              <p>{item.message}</p>
            </article>
          ))}
        </section>
      </section>
    </main>
  );
}
