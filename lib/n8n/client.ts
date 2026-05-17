/**
 * Client server-side para o webhook do n8n.
 *
 * Responsabilidades:
 * - timeout via AbortController
 * - retry exponencial em erros transitórios (rede / 5xx / 429)
 * - normalização da resposta do workflow
 * - jamais expor a URL do webhook ao browser (este módulo é server-only)
 */

import "server-only";
import { getServerConfig } from "@/lib/config";
import type {
  ChatRequestBody,
  ChatErrorCode,
  ChatErrorResponse,
  ChatSuccessResponse,
} from "@/lib/types";

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

interface N8nEnvelope {
  ok?: boolean;
  reply?: string;
  output?: string;
  text?: string;
  response?: string;
  message?: string;
  meta?: ChatSuccessResponse["meta"];
  error?: string;
  code?: string;
  retryable?: boolean;
  json?: unknown;
}

function buildError(
  code: ChatErrorCode,
  message: string,
  retryable: boolean
): ChatErrorResponse {
  return { ok: false, error: { code, message, retryable } };
}

async function callOnce(
  url: string,
  payload: ChatRequestBody,
  timeoutMs: number,
  secret: string
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      method: "POST",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "corvus-v3/1.0 (+vercel)",
        ...(secret ? { "X-Corvus-Secret": secret } : {}),
      },
      body: JSON.stringify(payload),
    });
  } finally {
    clearTimeout(timer);
  }
}

function normalizeBody(raw: unknown): ChatSuccessResponse | null {
  if (typeof raw === "string") {
    const reply = raw.trim();
    return reply ? { ok: true, reply } : null;
  }

  // n8n pode retornar item único ou array.
  const itemRaw: unknown = Array.isArray(raw) ? raw[0] : raw;
  const itemWithJson = itemRaw as N8nEnvelope;
  const item: N8nEnvelope | undefined =
    itemWithJson && typeof itemWithJson === "object" && "json" in itemWithJson
      ? (itemWithJson.json as N8nEnvelope)
      : (itemRaw as N8nEnvelope);
  if (!item || typeof item !== "object") return null;

  const reply =
    item.reply ??
    item.output ??
    item.text ??
    item.response ??
    item.message ??
    "";

  if (!reply || typeof reply !== "string") return null;

  return {
    ok: true,
    reply,
    meta: item.meta,
  };
}

function parseResponseText(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const unfenced = trimmed
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    const withoutTrailingCommas = unfenced.replace(/,\s*([}\]])/g, "$1");
    return JSON.parse(withoutTrailingCommas);
  }
}

function asErrorCode(value: unknown, fallback: ChatErrorCode): ChatErrorCode {
  const valid: ChatErrorCode[] = [
    "validation",
    "upstream_unreachable",
    "upstream_timeout",
    "upstream_4xx",
    "upstream_5xx",
    "upstream_invalid_response",
    "internal",
  ];
  return typeof value === "string" && valid.includes(value as ChatErrorCode)
    ? (value as ChatErrorCode)
    : fallback;
}

export async function sendChatToN8n(
  payload: ChatRequestBody
): Promise<ChatSuccessResponse | ChatErrorResponse> {
  let n8n: ReturnType<typeof getServerConfig>["n8n"];
  try {
    n8n = getServerConfig().n8n;
  } catch (err) {
    return buildError(
      "internal",
      err instanceof Error
        ? err.message
        : "Configuracao do webhook n8n indisponivel.",
      false
    );
  }
  const { webhookUrl, webhookSecret, timeoutMs, maxRetries } = n8n;

  let lastError: ChatErrorResponse | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await callOnce(webhookUrl, payload, timeoutMs, webhookSecret);

      if (res.ok) {
        if (res.status === 204 || res.status === 205) {
          return buildError(
            "upstream_invalid_response",
            "Workflow respondeu sem conteudo.",
            false
          );
        }

        const text = await res.text();
        if (!text.trim()) {
          return buildError(
            "upstream_invalid_response",
            "Workflow respondeu com corpo vazio.",
            false
          );
        }

        let parsed: unknown;
        try {
          parsed = parseResponseText(text);
        } catch {
          const normalizedText = normalizeBody(text);
          if (normalizedText) return normalizedText;
          return buildError(
            "upstream_invalid_response",
            "Workflow respondeu em formato invalido.",
            false
          );
        }

        if (
          parsed &&
          typeof parsed === "object" &&
          !Array.isArray(parsed) &&
          (parsed as N8nEnvelope).ok === false
        ) {
          const envelope = parsed as N8nEnvelope;
          return buildError(
            asErrorCode(envelope.code, "upstream_5xx"),
            envelope.error || envelope.message || "Workflow retornou erro.",
            typeof envelope.retryable === "boolean" ? envelope.retryable : true
          );
        }

        const normalized = normalizeBody(parsed);
        if (!normalized) {
          return buildError(
            "upstream_invalid_response",
            "Workflow respondeu sem campo 'reply' reconhecível.",
            false
          );
        }
        return normalized;
      }

      // HTTP error
      if (RETRYABLE_STATUS.has(res.status) && attempt < maxRetries) {
        await sleep(backoff(attempt));
        continue;
      }

      const code: ChatErrorCode = res.status >= 500 ? "upstream_5xx" : "upstream_4xx";
      return buildError(
        code,
        `Workflow retornou HTTP ${res.status}.`,
        res.status >= 500
      );
    } catch (err) {
      const isAbort = err instanceof DOMException && err.name === "AbortError";
      if (isAbort) {
        if (attempt < maxRetries) {
          await sleep(backoff(attempt));
          continue;
        }
        return buildError(
          "upstream_timeout",
          `Tempo esgotado após ${timeoutMs}ms.`,
          true
        );
      }
      lastError = buildError(
        "upstream_unreachable",
        err instanceof Error ? err.message : "Erro desconhecido de rede.",
        true
      );
      if (attempt < maxRetries) {
        await sleep(backoff(attempt));
        continue;
      }
      return lastError;
    }
  }

  return (
    lastError ??
    buildError("internal", "Falha ao chamar o n8n após retries.", true)
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoff(attempt: number): number {
  // 250ms, 500ms, 1s, 2s ...
  return 250 * 2 ** attempt;
}
