import "server-only";

import { NextResponse } from "next/server";
import {
  createAdminSupabaseClient,
  createServerSupabaseClient,
  hasServerSupabaseServiceRole,
} from "@/integrations/supabase/server";
import type { CorvusSupabaseClient } from "@/integrations/supabase/types";

export type SupabaseRequestContext = {
  token: string;
  userId: string;
  db: CorvusSupabaseClient;
};

export type ApiErrorBody = {
  ok: false;
  error: {
    code: string;
    message: string;
  };
};

export function apiError(
  code: string,
  message: string,
  status = 400
): NextResponse<ApiErrorBody> {
  return NextResponse.json(
    {
      ok: false,
      error: { code, message },
    },
    { status }
  );
}

export function bearerToken(req: Request): string {
  const header = req.headers.get("authorization") ?? "";
  const [scheme, token] = header.split(" ");
  return scheme?.toLowerCase() === "bearer" && token ? token.trim() : "";
}

export async function getSupabaseRequestContext(
  req: Request
): Promise<SupabaseRequestContext | NextResponse<ApiErrorBody>> {
  const token = bearerToken(req);
  if (!token) {
    return apiError("auth_required", "Sessao Supabase ausente.", 401);
  }

  const authClient = createServerSupabaseClient(token);
  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data.user) {
    return apiError("auth_invalid", "Sessao Supabase invalida ou expirada.", 401);
  }

  return {
    token,
    userId: data.user.id,
    db: hasServerSupabaseServiceRole()
      ? createAdminSupabaseClient()
      : createServerSupabaseClient(token),
  };
}

export function isApiError(
  value: SupabaseRequestContext | NextResponse<ApiErrorBody>
): value is NextResponse<ApiErrorBody> {
  return value instanceof Response;
}
