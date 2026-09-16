import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    status: "ok",
    supabaseConfigured: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY),
  });
}
