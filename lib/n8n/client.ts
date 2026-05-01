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
  // n8n pode retornar item único ou array.
  const item: N8nEnvelope | undefined = Array.isArray(raw)
    ? (raw[0] as N8nEnvelope)
    : (raw as N8nEnvelope);
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

export async function sendChatToN8n(
  payload: ChatRequestBody
): Promise<ChatSuccessResponse | ChatErrorResponse> {
  const { n8n } = getServerConfig();
  const { webhookUrl, webhookSecret, timeoutMs, maxRetries } = n8n;

  let lastError: ChatErrorResponse | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await callOnce(webhookUrl, payload, timeoutMs, webhookSecret);

      if (res.ok) {
        const text = await res.text();
        let parsed: unknown;
        try {
          parsed = JSON.parse(text);
        } catch {
          return buildError(
            "upstream_invalid_response",
            "Workflow respondeu em formato inválido (não-JSON).",
            false
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
