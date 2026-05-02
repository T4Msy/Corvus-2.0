import { NextResponse } from "next/server";
import {
  apiError,
  getSupabaseRequestContext,
  isApiError,
} from "@/integrations/supabase/request";
import { searchConversations } from "@/integrations/supabase/conversations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const context = await getSupabaseRequestContext(req);
  if (isApiError(context)) return context;

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return apiError("validation", "Consulta muito curta (mínimo 2 caracteres).", 400);
  }

  try {
    const conversations = await searchConversations(context.db, context.userId, q);
    return NextResponse.json({ ok: true, conversations });
  } catch (err) {
    return apiError(
      "search_failed",
      err instanceof Error ? err.message : "Não foi possível executar a busca.",
      500
    );
  }
}
