import { NextResponse } from "next/server";
import {
  apiError,
  getSupabaseRequestContext,
  isApiError,
} from "@/integrations/supabase/request";
import {
  createLocalConversation,
  listConversations,
  upsertConversation,
} from "@/integrations/supabase/conversations";
import type { Conversation } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : fallback;
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return "Erro desconhecido.";
}

export async function GET(req: Request) {
  const context = await getSupabaseRequestContext(req);
  if (isApiError(context)) return context;

  try {
    const conversations = await listConversations(context.db, context.userId);
    return NextResponse.json({ ok: true, conversations });
  } catch (err) {
    return apiError(
      "conversations_fetch_failed",
      err instanceof Error ? err.message : "Nao foi possivel carregar conversas.",
      500
    );
  }
}

export async function POST(req: Request) {
  const context = await getSupabaseRequestContext(req);
  if (isApiError(context)) return context;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const now = Date.now();
  const fallback = createLocalConversation();
  const conversation: Conversation = {
    id: asString(body.id, fallback.id),
    title: asString(body.title, "Nova conversa"),
    sessionId: asString(body.sessionId, fallback.sessionId),
    createdAt: asNumber(body.createdAt, now),
    updatedAt: asNumber(body.updatedAt, now),
    messages: [],
  };

  try {
    await upsertConversation(context.db, conversation, context.userId);
    return NextResponse.json({ ok: true, conversation }, { status: 201 });
  } catch (err) {
    return apiError(
      "conversation_create_failed",
      `Nao foi possivel criar conversa: ${errorMessage(err)}`,
      500
    );
  }
}
