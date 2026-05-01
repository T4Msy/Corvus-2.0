import { NextResponse } from "next/server";
import {
  apiError,
  getSupabaseRequestContext,
  isApiError,
} from "@/integrations/supabase/request";
import {
  deleteOwnedConversationRecord,
  updateOwnedConversationMeta,
  userCanAccessConversation,
} from "@/integrations/supabase/conversations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ conversationId: string }>;
};

export async function PATCH(req: Request, { params }: RouteContext) {
  const context = await getSupabaseRequestContext(req);
  if (isApiError(context)) return context;

  const { conversationId } = await params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const updatedAt =
    typeof body.updatedAt === "number" && Number.isFinite(body.updatedAt)
      ? body.updatedAt
      : Date.now();

  if (!title) return apiError("validation", "Titulo obrigatorio.", 400);

  try {
    const allowed = await userCanAccessConversation(
      context.db,
      conversationId,
      context.userId
    );
    if (!allowed) return apiError("not_found", "Conversa nao encontrada.", 404);

    await updateOwnedConversationMeta(
      context.db,
      conversationId,
      context.userId,
      title,
      updatedAt
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(
      "conversation_update_failed",
      err instanceof Error ? err.message : "Nao foi possivel atualizar conversa.",
      500
    );
  }
}

export async function DELETE(req: Request, { params }: RouteContext) {
  const context = await getSupabaseRequestContext(req);
  if (isApiError(context)) return context;

  const { conversationId } = await params;

  try {
    await deleteOwnedConversationRecord(
      context.db,
      conversationId,
      context.userId
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(
      "conversation_delete_failed",
      err instanceof Error ? err.message : "Nao foi possivel excluir conversa.",
      500
    );
  }
}
