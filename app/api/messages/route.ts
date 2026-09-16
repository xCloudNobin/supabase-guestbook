import { NextResponse } from "next/server";
import { getSupabaseClient } from "../../../lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = getSupabaseClient();
  if (!supabase) return NextResponse.json({ configured: false, messages: [] });

  const { data, error } = await supabase
    .from("messages")
    .select("id,name,message,created_at")
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    return NextResponse.json({ configured: true, messages: [], error: error.message }, { status: 500 });
  }

  return NextResponse.json({ configured: true, messages: data });
}

export async function POST(request: Request) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  const body = (await request.json()) as { name?: unknown; message?: unknown };
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";

  if (!name || !message || name.length > 60 || message.length > 280) {
    return NextResponse.json({ error: "Enter a name and a message up to 280 characters." }, { status: 400 });
  }

  const { error } = await supabase.from("messages").insert({ name, message });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true }, { status: 201 });
}
