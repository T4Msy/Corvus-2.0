import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/integrations/supabase/server";
import { createAttachmentSignedUrl } from "@/integrations/supabase/storage";
import { getServerConfig } from "@/lib/config";
import {
  answerAudioTranscriptFallback,
  buildAudioContext,
  formatAudioContext,
  isSupportedAudioType,
  transcribeAudioBuffer,
} from "@/lib/audio/openai";
import {
  buildDocumentContext,
  extractDocumentText,
  formatDocumentContext,
  isSupportedDocumentType,
  supportedDocumentLabel,
} from "@/lib/documents/extract";
import { sendChatToN8n } from "@/lib/n8n/client";
import { checkRateLimit, clientIpFromHeaders } from "@/lib/rate-limit";
import { redactSecrets, safeUpstreamReason } from "@/lib/security/redact";
import {
  analyzeImagesWithOpenAI,
  directVisionReply,
  looksLikeImageRefusal,
} from "@/lib/vision/openai";
import type {
  AgentMode,
  ChatAttachment,
  ChatErrorResponse,
  ChatRequestBody,
  ChatResponse,
  N8nAudioAttachment,
  N8nDocumentAttachment,
  N8nImageAttachment,
  UserContext,
} from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_MESSAGE_CHARS = 8_000;
const RATE_LIMIT_MAX = 20; // requisições por janela
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minuto
const MAX_IMAGE_ATTACHMENTS = 4;
const MAX_DOCUMENT_ATTACHMENTS = 4;
const MAX_AUDIO_ATTACHMENTS = 3;
const MAX_INLINE_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_AUDIO_DOWNLOAD_BYTES = 25 * 1024 * 1024;
const IMAGE_URL_EXPIRES_IN = 10 * 60;
const DOCUMENT_URL_EXPIRES_IN = 10 * 60;
const AUDIO_URL_EXPIRES_IN = 10 * 60;
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

function tooManyRequests(retryAfterSeconds: number): NextResponse<ChatErrorResponse> {
  return NextResponse.json<ChatErrorResponse>(
    {
      ok: false,
      error: {
        code: "validation",
        message: `Muitas requisições em sequência. Aguarde ${retryAfterSeconds}s e tente novamente.`,
        retryable: true,
      },
    },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
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

function isSupportedDocument(attachment: ChatAttachment): boolean {
  return isSupportedDocumentType(attachment.type, attachment.name);
}

function isSupportedAudio(attachment: ChatAttachment): boolean {
  return isSupportedAudioType(attachment.type, attachment.name);
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

async function downloadAttachmentBuffer(
  signedUrl: string,
  expectedType: string,
  name: string
): Promise<Buffer> {
  const response = await fetch(signedUrl, { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Nao foi possivel baixar o audio anexado.");
  }

  // Guarda anti-OOM: rejeita arquivos grandes antes de materializar em memória.
  const declaredSize = Number(response.headers.get("content-length") || "0");
  if (declaredSize > MAX_AUDIO_DOWNLOAD_BYTES) {
    throw new Error("Audio anexado excede o tamanho maximo permitido.");
  }

  const contentType = (response.headers.get("content-type") || expectedType).toLowerCase();
  if (
    contentType &&
    !contentType.startsWith("audio/") &&
    !contentType.startsWith("video/") &&
    !isSupportedAudioType(expectedType, name)
  ) {
    throw new Error("Arquivo anexado nao parece ser audio valido.");
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > MAX_AUDIO_DOWNLOAD_BYTES) {
    throw new Error("Audio anexado excede o tamanho maximo permitido.");
  }
  return buffer;
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

async function answerWithServerFallback(args: {
  message: string;
  modo: AgentMode;
  userContext: UserContext;
}): Promise<string> {
  const config = getServerConfig();
  const apiKey = config.openAiApiKey;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY ausente para fallback do Corvus.");
  }

  const modeLabel =
    args.modo === "fenrir"
      ? "modo Fenrir, com visao criativa e expansiva"
      : "modo Corvus, com tom institucional, preciso e objetivo";
  const userLabel = [
    args.userContext.nome ? `Nome: ${args.userContext.nome}` : "",
    args.userContext.cargo ? `Cargo: ${args.userContext.cargo}` : "",
    args.userContext.sigla ? `Sigla: ${args.userContext.sigla}` : "",
    args.userContext.tipo ? `Tipo: ${args.userContext.tipo}` : "",
  ]
    .filter(Boolean)
    .join(" | ");

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.audio.responseFallbackModel,
      temperature: args.modo === "fenrir" ? 0.75 : 0.35,
      max_tokens: 900,
      messages: [
        {
          role: "system",
          content:
            `Voce e o Corvus (${modeLabel}). Responda em pt-BR. ` +
            "Seja util, direto e bem estruturado. Nao mencione n8n, workflow, fallback, erro tecnico ou infraestrutura. " +
            "Quando o pedido envolver comparacao, ranking, cargos, estrutura, plano, decisao ou analise, use organizacao clara e tabela markdown quando ajudar.",
        },
        {
          role: "user",
          content: [userLabel ? `Contexto do usuario: ${userLabel}` : "", args.message]
            .filter(Boolean)
            .join("\n\n"),
        },
      ],
    }),
  });

  const data = (await response.json().catch(() => null)) as
    | {
        error?: { message?: string };
        choices?: Array<{ message?: { content?: string } }>;
      }
    | null;

  if (!response.ok) {
    throw new Error(
      data?.error?.message || `OpenAI retornou HTTP ${response.status}.`
    );
  }

  const reply = data?.choices?.[0]?.message?.content?.trim() || "";
  if (!reply) throw new Error("OpenAI retornou resposta vazia.");
  return reply;
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

  const token = bearerToken(req);
  // Segurança: nunca confiar no `userId` do body. Sem JWT válido, a identidade é
  // "anonymous" (modo convidado) — impede forjar a identidade de outro usuário.
  let resolvedUserId = "anonymous";
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

  // Rate limiting best-effort: por usuário autenticado, ou por IP no modo convidado.
  const rateKey =
    resolvedUserId !== "anonymous"
      ? `user:${resolvedUserId}`
      : `ip:${clientIpFromHeaders(req.headers)}`;
  const rate = checkRateLimit(rateKey, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS);
  if (!rate.ok) {
    return tooManyRequests(rate.retryAfterSeconds);
  }

  const conversationId = asString(b.conversationId, "");
  const attachments = parseAttachments(b.attachments);
  const supportedImageAttachments = attachments.filter(isSupportedImage);
  const supportedDocumentAttachments = attachments.filter(
    (attachment) => !isSupportedImage(attachment) && isSupportedDocument(attachment)
  );
  const supportedAudioAttachments = attachments.filter(
    (attachment) =>
      !isSupportedImage(attachment) &&
      !isSupportedDocument(attachment) &&
      isSupportedAudio(attachment)
  );
  const unsupportedAttachments = attachments.filter(
    (attachment) =>
      !isSupportedImage(attachment) &&
      !isSupportedDocument(attachment) &&
      !isSupportedAudio(attachment)
  );
  let imageAttachments: N8nImageAttachment[] = [];
  let documentAttachments: N8nDocumentAttachment[] = [];
  let audioAttachments: N8nAudioAttachment[] = [];
  let documentContext: ReturnType<typeof buildDocumentContext> = null;
  let audioContext: ReturnType<typeof buildAudioContext> = null;
  let visualContext:
    | Awaited<ReturnType<typeof analyzeImagesWithOpenAI>>
    | null = null;

  if (attachments.length > 0) {
    if (!token || !userSupabase) {
      return bad("Anexos exigem sessao autenticada.", 401);
    }
    if (!conversationId) {
      return bad("Conversa obrigatoria para enviar anexos.");
    }
    if (unsupportedAttachments.length > 0) {
      const names = unsupportedAttachments
        .map((attachment) => attachment.name)
        .slice(0, 4)
        .join(", ");
      return bad(
        `Tipo de anexo ainda nao suportado para analise: ${names}. Use imagens, audio, PDF, DOCX, TXT, MD, CSV ou JSON.`
      );
    }
  }

  if (supportedImageAttachments.length > 0) {
    const supabase = userSupabase;
    if (!supabase) return bad("Anexos exigem sessao autenticada.", 401);

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
            supabase,
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

    if (process.env.CORVUS_SERVER_VISION_FALLBACK === "true") {
      visualContext = await analyzeImagesWithOpenAI(message, imageAttachments);
    }
  }

  if (supportedDocumentAttachments.length > 0) {
    const supabase = userSupabase;
    if (!supabase) return bad("Anexos exigem sessao autenticada.", 401);

    const acceptedDocuments = supportedDocumentAttachments
      .filter((attachment) =>
        attachmentBelongsToConversation(attachment, resolvedUserId, conversationId)
      )
      .slice(0, MAX_DOCUMENT_ATTACHMENTS);

    if (acceptedDocuments.length === 0) {
      return bad(
        "Nenhum documento valido foi anexado. Use arquivos da conversa atual."
      );
    }

    documentAttachments = await Promise.all(
      acceptedDocuments.map(async (attachment): Promise<N8nDocumentAttachment> => {
        const signedUrl = await createAttachmentSignedUrl(
          supabase,
          attachment.path,
          undefined,
          DOCUMENT_URL_EXPIRES_IN
        );
        if (!signedUrl) {
          return {
            name: attachment.name,
            type: attachment.type,
            size: attachment.size,
            signedUrl: "",
            extractionError: "Nao foi possivel gerar acesso temporario.",
          };
        }

        try {
          const extracted = await extractDocumentText(signedUrl, attachment);
          return {
            name: attachment.name,
            type: attachment.type,
            size: attachment.size,
            signedUrl,
            url: signedUrl,
            text: extracted.text,
            ...(extracted.truncated
              ? { extractionError: "Conteudo truncado por limite de tamanho." }
              : {}),
          };
        } catch (err) {
          return {
            name: attachment.name,
            type: attachment.type,
            size: attachment.size,
            signedUrl,
            url: signedUrl,
            extractionError: redactSecrets(
              err instanceof Error
                ? err.message
                : `Nao foi possivel extrair texto do ${supportedDocumentLabel(
                    attachment.type,
                    attachment.name
                  )}.`
            ),
          };
        }
      })
    );

    documentContext = buildDocumentContext(documentAttachments);
    if (!documentContext) {
      const rawReason = documentAttachments
        .map((attachment) => attachment.extractionError)
        .filter(Boolean)
        .join(" ");
      const reason = safeUpstreamReason(
        rawReason,
        "O documento nao retornou texto legivel."
      );
      return bad(`Nao foi possivel analisar o documento anexado. ${reason}`);
    }
  }

  if (supportedAudioAttachments.length > 0) {
    const supabase = userSupabase;
    if (!supabase) return bad("Anexos exigem sessao autenticada.", 401);

    const acceptedAudio = supportedAudioAttachments
      .filter((attachment) =>
        attachmentBelongsToConversation(attachment, resolvedUserId, conversationId)
      )
      .slice(0, MAX_AUDIO_ATTACHMENTS);

    if (acceptedAudio.length === 0) {
      return bad(
        "Nenhum audio valido foi anexado. Use MP3, M4A, OGG, OGA, Opus, WAV, WebM ou MP4 da conversa atual."
      );
    }

    audioAttachments = await Promise.all(
      acceptedAudio.map(async (attachment): Promise<N8nAudioAttachment> => {
        const signedUrl = await createAttachmentSignedUrl(
          supabase,
          attachment.path,
          undefined,
          AUDIO_URL_EXPIRES_IN
        );
        if (!signedUrl) {
          return {
            name: attachment.name,
            type: attachment.type,
            size: attachment.size,
            signedUrl: "",
            transcriptionError: "Nao foi possivel gerar acesso temporario.",
          };
        }

        try {
          const buffer = await downloadAttachmentBuffer(
            signedUrl,
            attachment.type,
            attachment.name
          );
          const transcribed = await transcribeAudioBuffer({
            buffer,
            name: attachment.name,
            type: attachment.type,
          });
          return {
            ...transcribed,
            signedUrl,
            url: signedUrl,
          };
        } catch (err) {
          return {
            name: attachment.name,
            type: attachment.type,
            size: attachment.size,
            signedUrl,
            url: signedUrl,
            transcriptionError: redactSecrets(
              err instanceof Error
                ? err.message
                : "Nao foi possivel transcrever o audio anexado."
            ),
          };
        }
      })
    );

    audioContext = buildAudioContext(audioAttachments);
    if (!audioContext) {
      const rawReason = audioAttachments
        .map((attachment) => attachment.transcriptionError)
        .filter(Boolean)
        .join(" ");
      const reason = safeUpstreamReason(
        rawReason,
        "O audio nao retornou fala legivel."
      );
      return bad(`Nao foi possivel analisar o audio anexado. ${reason}`);
    }
  }

  const contextBlocks = [
    visualContext ? `[Contexto visual analisado]\n${visualContext.text}` : "",
    documentContext
      ? `[Contexto dos documentos]\n${formatDocumentContext(documentContext)}`
      : "",
    audioContext ? `[Contexto de audio]\n${formatAudioContext(audioContext)}` : "",
  ].filter(Boolean);
  const messageForN8n =
    contextBlocks.length > 0
      ? `${message}\n\n${contextBlocks.join("\n\n")}`
      : message;

  const payload: ChatRequestBody = {
    message: messageForN8n,
    conversationId,
    sessionId: asString(b.sessionId, conversationId),
    userId: resolvedUserId,
    modo,
    userContext: parseUserContext(b.userContext),
    ...(imageAttachments.length > 0
      ? {
          imageAttachments,
          images: imageAttachments,
          imageUrls: imageAttachments.map(
            (attachment) =>
              attachment.dataUrl ||
              attachment.imageUrl ||
              attachment.url ||
              attachment.signedUrl
          ),
          imageUrl:
            imageAttachments[0].dataUrl ||
            imageAttachments[0].imageUrl ||
            imageAttachments[0].url ||
            imageAttachments[0].signedUrl,
          hasImages: true,
          ...(visualContext
            ? {
                visualContext: visualContext.context,
                visualCtxString: visualContext.text,
                usedVision: true,
              }
            : {}),
        }
      : {}),
    ...(documentAttachments.length > 0 && documentContext
      ? {
          documentAttachments,
          documents: documentAttachments,
          documentContext,
          documentCtxString: formatDocumentContext(documentContext),
          hasDocuments: true,
        }
      : {}),
    ...(audioAttachments.length > 0 && audioContext
      ? {
          audioAttachments,
          audioContext,
          audioCtxString: formatAudioContext(audioContext),
          hasAudio: true,
          usedAudioTranscription: true,
        }
      : {}),
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

  if (
    !result.ok &&
    result.error.code === "upstream_invalid_response" &&
    audioContext?.text
  ) {
    const audioOnlyMessage = [
      message.trim(),
      `Transcricao do audio:\n${audioContext.text}`,
    ]
      .filter(Boolean)
      .join("\n\n");

    result = await sendChatToN8n({
      message: audioOnlyMessage,
      conversationId,
      sessionId: payload.sessionId,
      userId: resolvedUserId,
      modo,
      userContext: payload.userContext,
    });

    if (!result.ok && result.error.code === "upstream_invalid_response") {
      const transcript = audioContext.audios
        .map((audio) => audio.text)
        .filter(Boolean)
        .join("\n\n");
      const fallbackReply = await answerAudioTranscriptFallback({
        message,
        transcript,
      }).catch(() => "");

      result = {
        ok: true,
        reply:
          fallbackReply ||
          "Recebi o audio, mas nao consegui gerar uma resposta completa agora. Pode me dizer o que voce quer fazer com esse trecho?",
        meta: {
          agent: "Corvus",
          usedAudio: true,
          upstreamFallback: "audio_response",
        },
      };
    }
  }

  if (!result.ok && result.error.code === "upstream_invalid_response") {
    const originalError = result.error;
    try {
      const fallbackReply = await answerWithServerFallback({
        message: messageForN8n,
        modo,
        userContext: payload.userContext,
      });
      result = {
        ok: true,
        reply: fallbackReply,
        meta: {
          agent: modo === "fenrir" ? "Fenrir" : "Corvus",
          upstreamFallback: "openai_direct",
        },
      };
    } catch {
      result = {
        ok: false,
        error: {
          ...originalError,
          message:
            "O workflow do n8n respondeu sem conteudo. Verifique se N8N_WEBHOOK_URL aponta para o webhook de producao ativo e se o node 'Respond to Webhook' esta conectado ao final do fluxo.",
        },
      };
    }
  }

  if (!result.ok) {
    return NextResponse.json<ChatErrorResponse>(result, {
      status: statusForError(result),
    });
  }

  if (
    imageAttachments.length > 0 &&
    looksLikeImageRefusal(result.reply)
  ) {
    const fallbackVision =
      visualContext ?? (await analyzeImagesWithOpenAI(message, imageAttachments));
    const visionError =
      typeof result.meta?.visionError === "string"
        ? result.meta.visionError
        : "";

    if (fallbackVision) {
      return NextResponse.json(
        {
          ok: true,
          reply: directVisionReply(fallbackVision.text),
          meta: {
            ...(result.meta ?? {}),
            usedVision: true,
            visionFallback: true,
          },
        },
        { status: 200 }
      );
    }

    if (!visualContext) {
      return NextResponse.json<ChatErrorResponse>(
        {
          ok: false,
          error: {
            code: "upstream_invalid_response",
            message:
              (visionError && redactSecrets(visionError)) ||
              "O workflow recebeu a imagem, mas nao retornou contexto visual. Verifique o Vision Analyzer no n8n.",
            retryable: false,
          },
        },
        { status: 502 }
      );
    }
  }

  return NextResponse.json(result, { status: 200 });
}

export function GET() {
  return NextResponse.json(
    { ok: false, error: "Use POST." },
    { status: 405, headers: { Allow: "POST" } }
  );
}
