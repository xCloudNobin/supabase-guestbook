import { NextResponse } from "next/server";
import {
  createMessage,
  deleteMessage,
  isPositiveId,
  listMessages,
  parseMessageInput,
  parseUpdateInput,
  updateMessage,
} from "../../../lib/messages";
import { getSupabaseClient } from "../../../lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = getSupabaseClient();
  if (!supabase) return NextResponse.json({ configured: false, messages: [] });

  const { messages, error } = await listMessages(20);
  if (error) return NextResponse.json({ configured: true, messages: [], error }, { status: 500 });
  return NextResponse.json({ configured: true, messages });
}

export async function POST(request: Request) {
  const supabase = getSupabaseClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });

  const body = (await request.json()) as { name?: unknown; message?: unknown };
  const parsed = parseMessageInput(body);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const result = await createMessage(parsed.name, parsed.message);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 500 });

  return NextResponse.json({ message: result.value }, { status: 201 });
}

export async function PATCH(request: Request) {
  const supabase = getSupabaseClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });

  const body = (await request.json()) as { id?: unknown; name?: unknown; message?: unknown };
  if (!isPositiveId(body.id)) {
    return NextResponse.json({ error: "A valid message id is required." }, { status: 400 });
  }

  const parsed = parseUpdateInput(body);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const result = await updateMessage(body.id, parsed);
  if ("error" in result) {
    const status = result.notFound ? 404 : 500;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({ message: result.value });
}

export async function DELETE(request: Request) {
  const supabase = getSupabaseClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });

  const { searchParams } = new URL(request.url);
  const id = Number(searchParams.get("id"));
  if (!isPositiveId(id)) {
    return NextResponse.json({ error: "A valid message id is required." }, { status: 400 });
  }

  const result = await deleteMessage(id);
  if ("error" in result) {
    const status = result.notFound ? 404 : 500;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({ deleted: result.value });
}
