import { getSupabaseClient } from "./supabase";

export type Message = {
  id: number;
  name: string;
  message: string;
  created_at: string;
};

export type MessageResult<T> = { value: T } | { error: string; notFound?: boolean };

export const MESSAGE_NAME_MAX = 60;
export const MESSAGE_TEXT_MAX = 280;

export function parseMessageInput(body: { name?: unknown; message?: unknown }) {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";

  if (!name) return { error: "A name is required." };
  if (!message) return { error: "A message is required." };
  if (name.length > MESSAGE_NAME_MAX) {
    return { error: `Name must be ${MESSAGE_NAME_MAX} characters or fewer.` };
  }
  if (message.length > MESSAGE_TEXT_MAX) {
    return { error: `Message must be ${MESSAGE_TEXT_MAX} characters or fewer.` };
  }
  return { name, message };
}

export function parseUpdateInput(body: { name?: unknown; message?: unknown }) {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";

  if (!name && !message) {
    return { error: "Provide a name or a message to update." };
  }
  if (name.length > MESSAGE_NAME_MAX) {
    return { error: `Name must be ${MESSAGE_NAME_MAX} characters or fewer.` };
  }
  if (message.length > MESSAGE_TEXT_MAX) {
    return { error: `Message must be ${MESSAGE_TEXT_MAX} characters or fewer.` };
  }
  return { name: name || undefined, message: message || undefined };
}

export function isPositiveId(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

export async function listMessages(limit = 20): Promise<{ messages?: Message[]; error?: string }> {
  const supabase = getSupabaseClient();
  if (!supabase) return { error: "Supabase is not configured." };

  const { data, error } = await supabase
    .from("messages")
    .select("id,name,message,created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return { error: error.message };
  return { messages: (data ?? []) as Message[] };
}

export async function createMessage(name: string, message: string): Promise<MessageResult<Message>> {
  const supabase = getSupabaseClient();
  if (!supabase) return { error: "Supabase is not configured." };

  const { data, error } = await supabase
    .from("messages")
    .insert({ name, message })
    .select("id,name,message,created_at")
    .single();

  if (error) return { error: error.message };
  return { value: data as Message };
}

export async function updateMessage(
  id: number,
  patch: { name?: string; message?: string },
): Promise<MessageResult<Message>> {
  const supabase = getSupabaseClient();
  if (!supabase) return { error: "Supabase is not configured." };

  const { data, error } = await supabase
    .from("messages")
    .update(patch)
    .eq("id", id)
    .select("id,name,message,created_at");

  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "Message not found.", notFound: true };
  return { value: data[0] as Message };
}

export async function deleteMessage(id: number): Promise<MessageResult<{ id: number }>> {
  const supabase = getSupabaseClient();
  if (!supabase) return { error: "Supabase is not configured." };

  const { data, error } = await supabase.from("messages").delete().eq("id", id).select("id");

  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "Message not found.", notFound: true };
  return { value: { id: data[0].id as number } };
}
