import { NextResponse } from "next/server";
import {
  apiError,
  getSupabaseRequestContext,
  isApiError,
} from "@/integrations/supabase/request";
import {
  deleteOwnedConversationRecord,
  patchOwnedConversationMeta,
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
  const patch: {
    title?: string;
    updatedAt: number;
    pinned?: boolean;
    favorite?: boolean;
    tags?: string[];
    summary?: string;
    archived?: boolean;
  } = {
    updatedAt:
      typeof body.updatedAt === "number" && Number.isFinite(body.updatedAt)
        ? body.updatedAt
        : Date.now(),
  };

  if ("title" in body) {
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title) return apiError("validation", "Titulo obrigatorio.", 400);
    patch.title = title;
  }
  if (typeof body.pinned === "boolean") patch.pinned = body.pinned;
  if (typeof body.favorite === "boolean") patch.favorite = body.favorite;
  if (Array.isArray(body.tags)) {
    patch.tags = body.tags
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 8);
  }
  if (typeof body.summary === "string") patch.summary = body.summary.trim();
  if (typeof body.archived === "boolean") patch.archived = body.archived;

  const hasPatch = Object.keys(patch).some((key) => key !== "updatedAt");
  if (!hasPatch) {
    return apiError("validation", "Nenhum metadado enviado.", 400);
  }

  try {
    const allowed = await userCanAccessConversation(
      context.db,
      conversationId,
      context.userId
    );
    if (!allowed) return apiError("not_found", "Conversa nao encontrada.", 404);

    await patchOwnedConversationMeta(
      context.db,
      conversationId,
      context.userId,
      patch
    );
    return NextResponse.json({ ok: true, patch });
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
