"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type Message = {
  id: number;
  name: string;
  message: string;
  created_at: string;
};

type MessagesResponse = {
  configured?: boolean;
  messages?: Message[];
  error?: string;
};

type GuestbookProps = {
  initialMessages: Message[];
  configured: boolean;
  serverError?: string;
};

export function Guestbook({ initialMessages, configured, serverError }: GuestbookProps) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState(serverError ?? "");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editMessage, setEditMessage] = useState("");

  const refresh = useCallback(async () => {
    const response = await fetch("/api/messages", { cache: "no-store" });
    const data = (await response.json()) as MessagesResponse;
    setMessages(data.messages ?? []);
    if (!response.ok && data.error) setStatus(data.error);
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/messages", { cache: "no-store", signal: controller.signal })
      .then((response) => response.json().then((data) => ({ response, data })))
      .then(({ response, data }) => {
        setMessages((data as MessagesResponse).messages ?? []);
        if (!response.ok) setStatus((data as MessagesResponse).error ?? "Could not load messages.");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setStatus("Could not reach the API.");
      });

    return () => controller.abort();
  }, []);

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
      await refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save the message.");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(item: Message) {
    setEditingId(item.id);
    setEditName(item.name);
    setEditMessage(item.message);
    setStatus("");
  }

  function cancelEdit() {
    setEditingId(null);
    setStatus("");
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (editingId === null) return;
    setSaving(true);
    setStatus("");

    try {
      const response = await fetch("/api/messages", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: editingId, name: editName, message: editMessage }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not update the message.");
      setEditingId(null);
      setStatus("Message updated.");
      await refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not update the message.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: number) {
    setSaving(true);
    setStatus("");

    try {
      const response = await fetch(`/api/messages?id=${id}`, { method: "DELETE" });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not delete the message.");
      setStatus("Message deleted.");
      await refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not delete the message.");
    } finally {
      setSaving(false);
    }
  }

  return (
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
        <button disabled={saving || !configured}>{saving ? "Saving…" : "Sign guestbook"}</button>
        <p className="status" aria-live="polite">{status}</p>
      </form>

      <section className="card messages">
        <h2>Recent messages</h2>
        {!configured ? <p>Configure Supabase to load messages.</p> : null}
        {configured && messages.length === 0 ? <p>No messages yet. Be the first.</p> : null}
        {messages.map((item) =>
          editingId === item.id ? (
            <form key={item.id} className="message edit-form" onSubmit={saveEdit}>
              <label>
                Name
                <input value={editName} onChange={(event) => setEditName(event.target.value)} maxLength={60} required />
              </label>
              <label>
                Message
                <textarea value={editMessage} onChange={(event) => setEditMessage(event.target.value)} maxLength={280} required />
              </label>
              <div className="edit-actions">
                <button type="submit" disabled={saving}>Save</button>
                <button type="button" className="ghost" onClick={cancelEdit} disabled={saving}>
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <article key={item.id}>
              <div>
                <div>
                  <strong>{item.name}</strong>
                  <time dateTime={item.created_at}>{new Date(item.created_at).toLocaleDateString()}</time>
                </div>
                <div className="message-actions">
                  <button type="button" onClick={() => startEdit(item)} disabled={saving}>
                    Edit
                  </button>
                  <button type="button" className="danger" onClick={() => remove(item.id)} disabled={saving}>
                    Delete
                  </button>
                </div>
              </div>
              <p>{item.message}</p>
            </article>
          ),
        )}
      </section>
    </section>
  );
}
