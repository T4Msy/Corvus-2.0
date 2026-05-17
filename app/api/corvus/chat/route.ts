import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/integrations/supabase/server";
import { createAttachmentSignedUrl } from "@/integrations/supabase/storage";
import { sendChatToN8n } from "@/lib/n8n/client";
import type {
  AgentMode,
  ChatAttachment,
  ChatErrorResponse,
  ChatRequestBody,
  ChatResponse,
  N8nImageAttachment,
  UserContext,
} from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_MESSAGE_CHARS = 8_000;
const MAX_IMAGE_ATTACHMENTS = 4;
const MAX_INLINE_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_URL_EXPIRES_IN = 10 * 60;
const VALID_MODES: ReadonlySet<AgentMode> = new Set(["corvus", "fenrir"]);
const SUPPORTED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
]);

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

function parseAttachments(raw: unknown): ChatAttachment[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item): ChatAttachment | null => {
      if (!item || typeof item !== "object") return null;
      const value = item as Partial<ChatAttachment>;
      const id = asString(value.id).trim();
      const path = asString(value.path).trim();
      const name = asString(value.name).trim();
      const type = asString(value.type, "application/octet-stream").trim();
      const size = typeof value.size === "number" ? value.size : 0;
      if (!id || !path || !name || !size) return null;
      return { id, path, name, type, size };
    })
    .filter((item): item is ChatAttachment => Boolean(item));
}

function isSupportedImage(attachment: ChatAttachment): boolean {
  return SUPPORTED_IMAGE_TYPES.has(attachment.type.toLowerCase());
}

function attachmentBelongsToConversation(
  attachment: ChatAttachment,
  userId: string,
  conversationId: string
): boolean {
  const expectedPrefix = `${userId}/${conversationId}/`;
  return attachment.path.startsWith(expectedPrefix);
}

async function createImageDataUrl(
  signedUrl: string,
  type: string,
  size: number
): Promise<string | undefined> {
  if (size > MAX_INLINE_IMAGE_BYTES) return undefined;

  try {
    const response = await fetch(signedUrl, { cache: "no-store" });
    if (!response.ok) return undefined;

    const contentType = response.headers.get("content-type") || type;
    if (!contentType.toLowerCase().startsWith("image/")) return undefined;

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > MAX_INLINE_IMAGE_BYTES) return undefined;

    return `data:${contentType};base64,${buffer.toString("base64")}`;
  } catch {
    return undefined;
  }
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
  let userSupabase: ReturnType<typeof createServerSupabaseClient> | null = null;

  if (token) {
    try {
      userSupabase = createServerSupabaseClient(token);
      const { data, error } = await userSupabase.auth.getUser(token);
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

  const conversationId = asString(b.conversationId, "");
  const attachments = parseAttachments(b.attachments);
  const supportedImageAttachments = attachments.filter(isSupportedImage);
  let imageAttachments: N8nImageAttachment[] = [];

  if (supportedImageAttachments.length > 0) {
    if (!token || !userSupabase) {
      return bad("Anexos exigem sessao autenticada.", 401);
    }
    if (!conversationId) {
      return bad("Conversa obrigatoria para enviar anexos.");
    }

    const acceptedImages = supportedImageAttachments
      .filter((attachment) =>
        attachmentBelongsToConversation(attachment, resolvedUserId, conversationId)
      )
      .slice(0, MAX_IMAGE_ATTACHMENTS);

    if (acceptedImages.length === 0) {
      return bad(
        "Nenhuma imagem valida foi anexada. Use PNG, JPG, WebP ou GIF da conversa atual."
      );
    }

    imageAttachments = (
      await Promise.all(
        acceptedImages.map(async (attachment): Promise<N8nImageAttachment | null> => {
          const signedUrl = await createAttachmentSignedUrl(
            userSupabase,
            attachment.path,
            undefined,
            IMAGE_URL_EXPIRES_IN
          );
          if (!signedUrl) return null;
          const dataUrl = await createImageDataUrl(
            signedUrl,
            attachment.type,
            attachment.size
          );
          return {
            name: attachment.name,
            type: attachment.type,
            size: attachment.size,
            signedUrl,
            imageUrl: signedUrl,
            url: signedUrl,
            ...(dataUrl ? { dataUrl } : {}),
          };
        })
      )
    ).filter((item): item is N8nImageAttachment => Boolean(item));

    if (imageAttachments.length === 0) {
      return bad("Nao foi possivel gerar acesso temporario para a imagem.");
    }
  }

  const payload: ChatRequestBody = {
    message,
    conversationId,
    sessionId: asString(b.sessionId, conversationId),
    userId: resolvedUserId,
    modo,
    userContext: parseUserContext(b.userContext),
    ...(imageAttachments.length > 0 ? { imageAttachments } : {}),
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
