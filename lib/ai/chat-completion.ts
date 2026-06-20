import "server-only";
import { getServerConfig } from "@/lib/config";
import { redactSecrets } from "@/lib/security/redact";

const OPENAI_CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions";
const DEFAULT_TIMEOUT_MS = 30_000;

export interface ChatMessageInput {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatCompletionArgs {
  messages: ChatMessageInput[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

/** Erro de upstream com status — permite ao chamador distinguir 401/429/etc. */
export class ChatCompletionError extends Error {
  constructor(
    readonly status: number,
    detail?: string
  ) {
    super(detail || `HTTP ${status}`);
    this.name = "ChatCompletionError";
  }
}

/**
 * Executa um chat-completion da OpenAI. Se `N8N_LLM_WEBHOOK_URL` estiver
 * configurado, vai PELO n8n (que usa a credencial OpenAI do próprio n8n — a que
 * funciona). Caso contrário, chama a OpenAI direto com `OPENAI_API_KEY` (legado).
 *
 * Centraliza todos os caminhos de chat-completion do app para que o "Aprimorar",
 * o fallback do chat e os fallbacks de áudio dependam da MESMA chave que funciona.
 */
export async function runChatCompletion(
  args: ChatCompletionArgs
): Promise<string> {
  const config = getServerConfig();
  const payload = {
    model: args.model || config.audio.responseFallbackModel,
    temperature: args.temperature ?? 0.4,
    max_tokens: args.maxTokens ?? 600,
    messages: args.messages,
  };
  const timeoutMs = args.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  if (config.n8n.llmWebhookUrl) {
    return runViaN8n(
      config.n8n.llmWebhookUrl,
      config.n8n.webhookSecret,
      payload,
      timeoutMs
    );
  }
  return runViaOpenAI(config.openAiApiKey, payload, timeoutMs);
}

/** True quando o proxy n8n está ativo (não precisamos de OPENAI_API_KEY local). */
export function chatCompletionConfigured(): boolean {
  const config = getServerConfig();
  return Boolean(config.n8n.llmWebhookUrl || config.openAiApiKey);
}

async function runViaN8n(
  url: string,
  secret: string,
  payload: Record<string, unknown>,
  timeoutMs: number
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
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

    const text = await res.text();
    if (!res.ok) {
      throw new ChatCompletionError(
        res.status,
        `n8n LLM proxy: ${redactSecrets(text.slice(0, 200))}`
      );
    }
    const out = extractCompletionText(text);
    if (!out) {
      throw new ChatCompletionError(502, "n8n LLM proxy retornou vazio.");
    }
    return out;
  } finally {
    clearTimeout(timer);
  }
}

async function runViaOpenAI(
  apiKey: string,
  payload: Record<string, unknown>,
  timeoutMs: number
): Promise<string> {
  if (!apiKey) {
    throw new ChatCompletionError(503, "OPENAI_API_KEY ausente no servidor.");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(OPENAI_CHAT_COMPLETIONS_URL, {
      method: "POST",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = (await res.json().catch(() => null)) as {
      error?: { message?: string };
      choices?: Array<{ message?: { content?: string } }>;
    } | null;

    if (!res.ok) {
      throw new ChatCompletionError(
        res.status,
        redactSecrets(data?.error?.message || `HTTP ${res.status}`)
      );
    }
    const out = (data?.choices?.[0]?.message?.content ?? "").trim();
    if (!out) throw new ChatCompletionError(502, "OpenAI retornou vazio.");
    return out;
  } finally {
    clearTimeout(timer);
  }
}

/** Aceita {text}/{reply}/{output}, array com 1 item, ou a resposta crua da OpenAI. */
function extractCompletionText(rawText: string): string {
  const trimmed = rawText.trim();
  if (!trimmed) return "";

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return trimmed;
  }

  const item = Array.isArray(parsed) ? parsed[0] : parsed;
  if (!item || typeof item !== "object") return "";
  const obj = item as Record<string, unknown>;

  const direct =
    textValue(obj.text) ||
    textValue(obj.reply) ||
    textValue(obj.output) ||
    textValue(obj.content);
  if (direct) return direct;

  const choices = obj.choices as
    | Array<{ message?: { content?: unknown } }>
    | undefined;
  return textValue(choices?.[0]?.message?.content);
}

function textValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
