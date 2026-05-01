import { NextResponse } from "next/server";
import {
  apiError,
  getSupabaseRequestContext,
  isApiError,
} from "@/integrations/supabase/request";
import {
  loadOrCreateProfile,
  updateProfile,
  type ProfileUpdate,
} from "@/integrations/supabase/profile";
import type { ThemePreference } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_THEMES: ReadonlySet<ThemePreference> = new Set([
  "dark",
  "light",
  "system",
]);

function asTrimmedString(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export async function GET(req: Request) {
  const context = await getSupabaseRequestContext(req);
  if (isApiError(context)) return context;

  try {
    const fallbackName =
      req.headers.get("x-corvus-fallback-name")?.trim() || "Membro";
    const result = await loadOrCreateProfile(
      context.db,
      context.userId,
      fallbackName
    );
    return NextResponse.json({ ok: true, profile: result.profile, error: result.error });
  } catch (err) {
    return apiError(
      "profile_load_failed",
      err instanceof Error ? err.message : "Falha ao carregar perfil.",
      500
    );
  }
}

export async function PATCH(req: Request) {
  const context = await getSupabaseRequestContext(req);
  if (isApiError(context)) return context;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return apiError("validation", "Body deve ser JSON.", 400);
  }

  const patch: ProfileUpdate = {};

  if ("nome" in body) {
    const v = asTrimmedString(body.nome);
    if (v !== undefined) patch.nome = v;
  }
  if ("nome_interno" in body) {
    const v = asTrimmedString(body.nome_interno);
    if (v !== undefined) patch.nome_interno = v;
  }
  if ("avatar_url" in body) {
    const v = asTrimmedString(body.avatar_url);
    if (v !== undefined) patch.avatar_url = v;
  }
  if ("theme_preference" in body) {
    const raw = body.theme_preference;
    if (typeof raw !== "string" || !VALID_THEMES.has(raw as ThemePreference)) {
      return apiError(
        "validation",
        "theme_preference deve ser dark, light ou system.",
        400
      );
    }
    patch.theme_preference = raw as ThemePreference;
  }

  try {
    const profile = await updateProfile(context.db, context.userId, patch);
    return NextResponse.json({ ok: true, profile });
  } catch (err) {
    return apiError(
      "profile_update_failed",
      err instanceof Error ? err.message : "Falha ao atualizar perfil.",
      500
    );
  }
}
