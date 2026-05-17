import { NextResponse } from "next/server";
import {
  apiError,
  getSupabaseRequestContext,
  isApiError,
} from "@/integrations/supabase/request";
import {
  deleteMessagesFrom,
  deriveConversationTitle,
  loadMessages,
  saveMessage,
  touchOwnedConversation,
  updateMessageByTimestamp,
  updateOwnedConversationMeta,
  upsertConversation,
  userCanAccessConversation,
} from "@/integrations/supabase/conversations";
import type {
  ChatMessage,
  Conversation,
  ConversationAttachment,
  MessageRole,
} from "@/lib/types";

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
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return "Erro desconhecido.";
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : fallback;
}

function asTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function parseAttachments(
  raw: unknown,
  conversationId: string
): ConversationAttachment[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item): ConversationAttachment | null => {
      if (!item || typeof item !== "object") return null;
      const value = item as Partial<ConversationAttachment>;
      const id = typeof value.id === "string" ? value.id.trim() : "";
      const path = typeof value.path === "string" ? value.path.trim() : "";
      const name = typeof value.name === "string" ? value.name.trim() : "";
      const type =
        typeof value.type === "string" && value.type.trim()
          ? value.type.trim()
          : "application/octet-stream";
      const size =
        typeof value.size === "number" && Number.isFinite(value.size)
          ? value.size
          : 0;
      const createdAt =
        typeof value.createdAt === "number" && Number.isFinite(value.createdAt)
          ? value.createdAt
          : Date.now();
      if (!id || !path || !name || size <= 0) return null;
      return {
        id,
        conversationId,
        path,
        url: typeof value.url === "string" ? value.url : null,
        name,
        type,
        size,
        createdAt,
      };
    })
    .filter((item): item is ConversationAttachment => Boolean(item));
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
    pinned: typeof value.pinned === "boolean" ? value.pinned : false,
    favorite: typeof value.favorite === "boolean" ? value.favorite : false,
    tags: asTags(value.tags),
    summary: typeof value.summary === "string" ? value.summary : "",
    archived: typeof value.archived === "boolean" ? value.archived : false,
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
    if (!allowed) return NextResponse.json({ ok: true, messages: [] });

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
    attachments: parseAttachments(rawMessage.attachments, conversationId),
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
    let allowed: boolean;
    try {
      allowed = await userCanAccessConversation(
        context.db,
        conversationId,
        context.userId
      );
    } catch (err) {
      return apiError(
        "conversation_access_check_failed",
        `Falha ao verificar conversa: ${errorMessage(err)}`,
        500
      );
    }
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
      try {
        allowed = await userCanAccessConversation(
          context.db,
          conversationId,
          context.userId
        );
      } catch (err) {
        return apiError(
          "conversation_access_recheck_failed",
          `Falha ao verificar conversa criada: ${errorMessage(err)}`,
          500
        );
      }
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

export async function PATCH(req: Request, { params }: RouteContext) {
  const context = await getSupabaseRequestContext(req);
  if (isApiError(context)) return context;

  const { conversationId } = await params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  const createdAt =
    typeof body.createdAt === "number" && Number.isFinite(body.createdAt)
      ? body.createdAt
      : null;
  const text = typeof body.text === "string" ? body.text.trim() : "";

  if (!createdAt) return apiError("validation", "createdAt obrigatorio.", 400);
  if (!text) return apiError("validation", "Texto obrigatorio.", 400);

  try {
    const allowed = await userCanAccessConversation(context.db, conversationId, context.userId);
    if (!allowed) return apiError("not_found", "Conversa nao encontrada.", 404);

    await updateMessageByTimestamp(context.db, conversationId, createdAt, text);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(
      "message_update_failed",
      err instanceof Error ? err.message : "Nao foi possivel atualizar mensagem.",
      500
    );
  }
}

export async function DELETE(req: Request, { params }: RouteContext) {
  const context = await getSupabaseRequestContext(req);
  if (isApiError(context)) return context;

  const { conversationId } = await params;
  const { searchParams } = new URL(req.url);
  const fromParam = searchParams.get("from");
  const fromMs = fromParam ? Number(fromParam) : NaN;

  if (!Number.isFinite(fromMs)) {
    return apiError("validation", "Parametro 'from' (timestamp ms) obrigatorio.", 400);
  }

  try {
    const allowed = await userCanAccessConversation(context.db, conversationId, context.userId);
    if (!allowed) return apiError("not_found", "Conversa nao encontrada.", 404);

    await deleteMessagesFrom(context.db, conversationId, fromMs);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(
      "messages_delete_failed",
      err instanceof Error ? err.message : "Nao foi possivel excluir mensagens.",
      500
    );
  }
}
