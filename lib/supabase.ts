import { createClient } from "@supabase/supabase-js";

export function getSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;

  if (!url || !anonKey) return null;

  const internalFetch: typeof fetch = (input, init) => {
    const headers = new Headers(init?.headers);
    headers.delete("authorization");
    return fetch(input, { ...init, headers });
  };

  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    ...(process.env.SUPABASE_INTERNAL_NO_AUTH === "true"
      ? { global: { fetch: internalFetch } }
      : {}),
  });
}
