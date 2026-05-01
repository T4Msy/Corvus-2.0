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
  upsertConversation,
  userCanAccessConversation,
} from "@/integrations/supabase/conversations";
import type { ChatMessage, Conversation, MessageRole } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ conversationId: string }>;
};

function parseRole(value: unknown): MessageRole {
  return value === "corvus" || value === "assistant" ? "corvus" : "user";
}

const DEFAULT_TITLE = "Nova conversa";

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Erro desconhecido.";
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : fallback;
}

function parseConversation(
  raw: unknown,
  conversationId: string,
  title: string,
  updatedAt: number
): Conversation | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const sessionId =
    typeof value.sessionId === "string" && value.sessionId.trim()
      ? value.sessionId.trim()
      : "";
  if (!sessionId) return null;

  return {
    id: conversationId,
    title:
      typeof value.title === "string" && value.title.trim()
        ? value.title.trim()
        : title || DEFAULT_TITLE,
    sessionId,
    createdAt: asNumber(value.createdAt, updatedAt),
    updatedAt,
    messages: [],
  };
}

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
  const fallbackConversation = parseConversation(
    body.conversation,
    conversationId,
    title,
    updatedAt
  );

  try {
    let allowed = await userCanAccessConversation(
      context.db,
      conversationId,
      context.userId
    );
    if (!allowed && fallbackConversation) {
      try {
        await upsertConversation(
          context.db,
          fallbackConversation,
          context.userId
        );
      } catch (err) {
        return apiError(
          "conversation_upsert_failed",
          `Falha ao criar conversa antes da mensagem: ${errorMessage(err)}`,
          500
        );
      }
      allowed = await userCanAccessConversation(
        context.db,
        conversationId,
        context.userId
      );
    }
    if (!allowed) return apiError("not_found", "Conversa nao encontrada.", 404);

    try {
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
    } catch (err) {
      return apiError(
        "conversation_meta_update_failed",
        `Falha ao atualizar conversa: ${errorMessage(err)}`,
        500
      );
    }

    try {
      await saveMessage(context.db, conversationId, message);
    } catch (err) {
      return apiError(
        "message_insert_failed",
        `Falha ao inserir mensagem: ${errorMessage(err)}`,
        500
      );
    }

    return NextResponse.json({ ok: true, message }, { status: 201 });
  } catch (err) {
    return apiError(
      "message_save_failed",
      err instanceof Error ? err.message : "Nao foi possivel salvar mensagem.",
      500
    );
  }
}
