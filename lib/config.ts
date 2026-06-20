/**
 * Configuração central. Carrega variáveis de ambiente e valida uma vez.
 * - `serverConfig` só pode ser importado em código server-side.
 * - `clientConfig` só contém valores prefixados com NEXT_PUBLIC_*.
 */

function required(name: string, value: string | undefined): string {
  if (!value || value.trim() === "") {
    throw new Error(
      `[corvus/config] Variável de ambiente ausente: ${name}. Veja .env.local.example.`
    );
  }
  return value.trim();
}

function optional(value: string | undefined, fallback: string): string {
  return value && value.trim() !== "" ? value.trim() : fallback;
}

function asInt(value: string | undefined, fallback: number): number {
  const n = Number.parseInt(value ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

let warnedMissingSecret = false;
function warnIfWebhookUnauthenticated(secret: string): void {
  if (secret || warnedMissingSecret) return;
  warnedMissingSecret = true;
  console.warn(
    "[corvus/config] N8N_WEBHOOK_SECRET ausente: o webhook n8n será chamado SEM autenticação " +
      "(header X-Corvus-Secret omitido). Recomenda-se configurar o secret e o Header Auth no node Webhook."
  );
}

export const clientConfig = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "",
} as const;

export function getServerConfig() {
  if (typeof window !== "undefined") {
    throw new Error("[corvus/config] serverConfig acessado no browser.");
  }
  const webhookSecret = optional(process.env.N8N_WEBHOOK_SECRET, "");
  warnIfWebhookUnauthenticated(webhookSecret);
  return {
    n8n: {
      webhookUrl: required("N8N_WEBHOOK_URL", process.env.N8N_WEBHOOK_URL),
      webhookSecret,
      timeoutMs: asInt(process.env.N8N_TIMEOUT_MS, 30_000),
      maxRetries: asInt(process.env.N8N_MAX_RETRIES, 2),
      // Opcional: webhook dedicado de transcrição de áudio. Quando setado, o
      // áudio é transcrito PELO n8n (usando a credencial OpenAI do próprio n8n),
      // e o app NÃO precisa de OPENAI_API_KEY para ditado. Vazio ⇒ usa OpenAI
      // direto via OPENAI_API_KEY (comportamento legado).
      transcriptionWebhookUrl: optional(
        process.env.N8N_TRANSCRIPTION_WEBHOOK_URL,
        ""
      ),
    },
    supabase: {
      url: required(
        "NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_URL",
        process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
      ),
      anonKey: required(
        "NEXT_PUBLIC_SUPABASE_ANON_KEY ou SUPABASE_ANON_KEY",
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
          process.env.SUPABASE_ANON_KEY
      ),
      serviceRoleKey: optional(process.env.SUPABASE_SERVICE_ROLE_KEY, ""),
    },
    // Chave ÚNICA da OpenAI. Usada por TODOS os caminhos: transcrição/ditado de
    // áudio, visão, fallback do chat e o refinador de prompt. Não existe "chave
    // de áudio" separada — é uma só. Para usar chaves distintas no futuro, criar
    // uma nova env var dedicada aqui (ex.: OPENAI_AUDIO_API_KEY).
    openAiApiKey: optional(process.env.OPENAI_API_KEY, ""),
    audio: {
      transcriptionModel: optional(
        process.env.OPENAI_TRANSCRIPTION_MODEL,
        "gpt-4o-transcribe"
      ),
      realtimeTranscriptionModel: optional(
        process.env.OPENAI_REALTIME_TRANSCRIPTION_MODEL,
        "gpt-realtime-whisper"
      ),
      responseFallbackModel: optional(
        process.env.OPENAI_AUDIO_FALLBACK_MODEL,
        "gpt-4o-mini"
      ),
      language: optional(process.env.AUDIO_STT_LANGUAGE, "pt"),
      locale: optional(process.env.AUDIO_STT_LOCALE, "pt-BR"),
    },
  } as const;
}

export type ServerConfig = ReturnType<typeof getServerConfig>;
