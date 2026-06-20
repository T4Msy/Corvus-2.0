import { NextResponse } from "next/server";
import { getServerConfig } from "@/lib/config";
import {
  apiError,
  getSupabaseRequestContext,
  isApiError,
} from "@/integrations/supabase/request";
import { checkRateLimit, clientIpFromHeaders } from "@/lib/rate-limit";
import type { AgentMode } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_INPUT_CHARS = 4_000;
const RATE_LIMIT_MAX = 15; // requisições por janela
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minuto
const VALID_MODES: ReadonlySet<AgentMode> = new Set(["corvus", "fenrir"]);

const OPENAI_CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions";

/**
 * Refinador de prompt. Recebe uma ideia crua do usuário e devolve um prompt
 * reescrito — claro, estruturado e em pt-BR — pronto para ser enviado ao Corvus.
 *
 * Roda isolado do fluxo de chat (não toca n8n nem polui a conversa). Usa OpenAI
 * direto; sem OPENAI_API_KEY, devolve erro orientado ao operador.
 */
export async function POST(req: Request) {
  const ctx = await getSupabaseRequestContext(req);
  if (isApiError(ctx)) return ctx;

  // Rate limit por usuário autenticado (cai para IP por segurança).
  const limitKey = ctx.userId || clientIpFromHeaders(req.headers) || "anon";
  const limit = checkRateLimit(
    `enhance:${limitKey}`,
    RATE_LIMIT_MAX,
    RATE_LIMIT_WINDOW_MS
  );
  if (!limit.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "rate_limited",
          message: `Muitas refinações em sequência. Aguarde ${limit.retryAfterSeconds}s e tente de novo.`,
        },
      },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("validation", "Corpo da requisição inválido.", 400);
  }

  const raw = (body as { text?: unknown })?.text;
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text) {
    return apiError("validation", "Escreva uma ideia para aprimorar.", 400);
  }
  if (text.length > MAX_INPUT_CHARS) {
    return apiError(
      "validation",
      `Texto muito longo (limite de ${MAX_INPUT_CHARS} caracteres).`,
      400
    );
  }

  const modeRaw = (body as { mode?: unknown })?.mode;
  const mode: AgentMode =
    typeof modeRaw === "string" && VALID_MODES.has(modeRaw as AgentMode)
      ? (modeRaw as AgentMode)
      : "corvus";

  const apiKey = getServerConfig().audio.openAiApiKey;
  if (!apiKey) {
    return apiError(
      "unavailable",
      "Refinador indisponível: configure OPENAI_API_KEY no servidor.",
      503
    );
  }

  try {
    const prompt = await enhancePrompt({ text, mode, apiKey });
    return NextResponse.json({ ok: true, prompt });
  } catch (err) {
    return apiError(
      "upstream",
      err instanceof Error
        ? err.message
        : "Não foi possível aprimorar o prompt agora.",
      502
    );
  }
}

async function enhancePrompt(args: {
  text: string;
  mode: AgentMode;
  apiKey: string;
}): Promise<string> {
  const config = getServerConfig();
  const modeLabel =
    args.mode === "fenrir"
      ? "modo Fenrir (criativo e expansivo)"
      : "modo Corvus (institucional, preciso e objetivo)";

  const response = await fetch(OPENAI_CHAT_COMPLETIONS_URL, {
    method: "POST",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${args.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.audio.responseFallbackModel,
      temperature: 0.4,
      max_tokens: 600,
      messages: [
        {
          role: "system",
          content:
            "Você é um engenheiro de prompts da Masayoshi (MSY). Sua tarefa é reescrever a ideia crua do usuário em um prompt melhor para o agente Corvus, " +
            `que vai operar em ${modeLabel}. ` +
            "Regras: (1) Escreva SEMPRE em pt-BR. (2) Preserve a intenção e todos os detalhes específicos que o usuário deu — nunca invente fatos, nomes ou números. " +
            "(3) Deixe o pedido claro, completo e bem estruturado: explicite o objetivo, o que deve ser entregue e, quando ajudar, o formato esperado (lista, tabela, passo a passo). " +
            "(4) Se a ideia for vaga, torne-a específica de forma razoável, sem extrapolar o escopo. (5) Mantenha conciso — um bom prompt, não um texto longo. " +
            "(6) Responda APENAS com o prompt final reescrito, em texto puro, sem aspas, sem títulos como 'Prompt:', sem explicações e sem comentários.",
        },
        {
          role: "user",
          content: `Ideia crua do usuário:\n${args.text}`,
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

  const prompt = sanitize(data?.choices?.[0]?.message?.content ?? "");
  if (!prompt) throw new Error("O refinador retornou uma resposta vazia.");
  return prompt;
}

/** Remove rótulos e aspas externas que o modelo às vezes adiciona apesar das instruções. */
function sanitize(value: string): string {
  let text = value.trim();
  text = text.replace(/^(prompt|prompt final|prompt aprimorado)\s*:\s*/i, "");
  if (text.length > 1 && /^["'“”]/.test(text) && /["'“”]$/.test(text)) {
    text = text.slice(1, -1).trim();
  }
  return text;
}
