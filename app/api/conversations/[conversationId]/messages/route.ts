import { NextResponse } from "next/server";
import {
  apiError,
  getSupabaseRequestContext,
  isApiError,
} from "@/integrations/supabase/request";
import {
  deriveConversationTitle,
  loadMessages,
  saveMessage,
  touchOwnedConversation,
  updateOwnedConversationMeta,
  userCanAccessConversation,
} from "@/integrations/supabase/conversations";
import type { ChatMessage, MessageRole } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ conversationId: string }>;
};

function parseRole(value: unknown): MessageRole {
  return value === "corvus" || value === "assistant" ? "corvus" : "user";
}

const DEFAULT_TITLE = "Nova conversa";

export async function GET(req: Request, { params }: RouteContext) {
  const context = await getSupabaseRequestContext(req);
  if (isApiError(context)) return context;

  const { conversationId } = await params;

  try {
    const allowed = await userCanAccessConversation(
      context.db,
      conversationId,
      context.userId
    );
    if (!allowed) return apiError("not_found", "Conversa nao encontrada.", 404);

    const messages = await loadMessages(context.db, conversationId);
    return NextResponse.json({ ok: true, messages });
  } catch (err) {
    return apiError(
      "messages_fetch_failed",
      err instanceof Error ? err.message : "Nao foi possivel carregar mensagens.",
      500
    );
  }
}

export async function POST(req: Request, { params }: RouteContext) {
  const context = await getSupabaseRequestContext(req);
  if (isApiError(context)) return context;

  const { conversationId } = await params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const rawMessage =
    body.message && typeof body.message === "object"
      ? (body.message as Record<string, unknown>)
      : body;
  const text = typeof rawMessage.text === "string" ? rawMessage.text.trim() : "";
  if (!text) return apiError("validation", "Texto da mensagem obrigatorio.", 400);

  const createdAt =
    typeof rawMessage.createdAt === "number" &&
    Number.isFinite(rawMessage.createdAt)
      ? rawMessage.createdAt
      : Date.now();
  const message: ChatMessage = {
    role: parseRole(rawMessage.role),
    text,
    createdAt,
  };

  const requestedTitle =
    typeof body.title === "string" && body.title.trim()
      ? body.title.trim()
      : "";
  const title =
    requestedTitle && requestedTitle !== DEFAULT_TITLE
      ? requestedTitle
      : message.role === "user"
        ? deriveConversationTitle(message.text)
        : "";
  const updatedAt =
    typeof body.updatedAt === "number" && Number.isFinite(body.updatedAt)
      ? body.updatedAt
      : Date.now();

  try {
    const allowed = await userCanAccessConversation(
      context.db,
      conversationId,
      context.userId
    );
    if (!allowed) return apiError("not_found", "Conversa nao encontrada.", 404);

    if (message.role === "corvus" && (!title || title === DEFAULT_TITLE)) {
      await touchOwnedConversation(
        context.db,
        conversationId,
        context.userId,
        updatedAt
      );
    } else {
      await updateOwnedConversationMeta(
        context.db,
        conversationId,
        context.userId,
        title || DEFAULT_TITLE,
        updatedAt
      );
    }

    await saveMessage(context.db, conversationId, message);

    return NextResponse.json({ ok: true, message }, { status: 201 });
  } catch (err) {
    return apiError(
      "message_save_failed",
      err instanceof Error ? err.message : "Nao foi possivel salvar mensagem.",
      500
    );
  }
}
