import { NextResponse } from "next/server";
import { getSupabaseClient } from "../../../lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return NextResponse.json(
      { status: "unavailable", supabaseConfigured: false, db: "unconfigured" },
      { status: 503 },
    );
  }

  const started = Date.now();
  const { error } = await supabase.from("messages").select("id").limit(1);
  const latencyMs = Date.now() - started;

  if (error) {
    return NextResponse.json(
      { status: "unavailable", supabaseConfigured: true, db: "error", error: error.message, latencyMs },
      { status: 503 },
    );
  }

  return NextResponse.json({
    status: "ok",
    supabaseConfigured: true,
    db: "reachable",
    latencyMs,
  });
}
