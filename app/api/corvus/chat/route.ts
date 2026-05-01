import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/integrations/supabase/server";
import { sendChatToN8n } from "@/lib/n8n/client";
import type {
  AgentMode,
  ChatErrorResponse,
  ChatRequestBody,
  ChatResponse,
  UserContext,
} from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_MESSAGE_CHARS = 8_000;
const VALID_MODES: ReadonlySet<AgentMode> = new Set(["corvus", "fenrir"]);

function bad(message: string, status = 400): NextResponse<ChatErrorResponse> {
  return NextResponse.json<ChatErrorResponse>(
    { ok: false, error: { code: "validation", message, retryable: false } },
    { status }
  );
}

function bearerToken(req: Request): string {
  const header = req.headers.get("authorization") ?? "";
  const [scheme, token] = header.split(" ");
  return scheme?.toLowerCase() === "bearer" && token ? token.trim() : "";
}

function asString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function parseUserContext(raw: unknown): UserContext {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    nome: asString(obj.nome, "Convidado"),
    cargo: asString(obj.cargo, ""),
    sigla: asString(obj.sigla, ""),
    tipo: asString(obj.tipo, "convidado"),
  };
}

function statusForError(err: ChatErrorResponse): number {
  switch (err.error.code) {
    case "validation":
      return 400;
    case "upstream_4xx":
      return 502;
    case "upstream_5xx":
    case "upstream_unreachable":
    case "upstream_timeout":
    case "upstream_invalid_response":
      return 502;
    case "internal":
      return 500;
    default:
      return 500;
  }
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return bad("Body inválido — esperado JSON.");
  }

  const b = (body ?? {}) as Partial<ChatRequestBody> & Record<string, unknown>;

  const message = asString(b.message).trim();
  if (!message) return bad("Campo 'message' é obrigatório.");
  if (message.length > MAX_MESSAGE_CHARS) {
    return bad(`Mensagem excede limite de ${MAX_MESSAGE_CHARS} caracteres.`);
  }

  const modoRaw = asString(b.modo, "corvus") as AgentMode;
  const modo: AgentMode = VALID_MODES.has(modoRaw) ? modoRaw : "corvus";

  const requestedUserId = asString(b.userId, "anonymous");
  let resolvedUserId = requestedUserId;
  const token = bearerToken(req);

  if (token) {
    try {
      const supabase = createServerSupabaseClient(token);
      const { data, error } = await supabase.auth.getUser(token);
      if (error || !data.user) {
        return bad("Sessao Supabase invalida ou expirada.", 401);
      }
      resolvedUserId = data.user.id;
    } catch (err) {
      return bad(
        err instanceof Error
          ? err.message
          : "Falha ao validar sessao Supabase.",
        503
      );
    }
  }

  const payload: ChatRequestBody = {
    message,
    conversationId: asString(b.conversationId, ""),
    sessionId: asString(b.sessionId, asString(b.conversationId, "")),
    userId: resolvedUserId,
    modo,
    userContext: parseUserContext(b.userContext),
  };

  let result: ChatResponse;
  try {
    result = await sendChatToN8n(payload);
  } catch (err) {
    result = {
      ok: false,
      error: {
        code: "internal",
        message:
          err instanceof Error
            ? err.message
            : "Falha interna ao acionar o motor do Corvus.",
        retryable: false,
      },
    };
  }

  if (!result.ok) {
    return NextResponse.json<ChatErrorResponse>(result, {
      status: statusForError(result),
    });
  }
  return NextResponse.json(result, { status: 200 });
}

export function GET() {
  return NextResponse.json(
    { ok: false, error: "Use POST." },
    { status: 405, headers: { Allow: "POST" } }
  );
}
