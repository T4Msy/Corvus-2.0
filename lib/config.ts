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

export const clientConfig = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "",
} as const;

export function getServerConfig() {
  if (typeof window !== "undefined") {
    throw new Error("[corvus/config] serverConfig acessado no browser.");
  }
  return {
    n8n: {
      webhookUrl: required("N8N_WEBHOOK_URL", process.env.N8N_WEBHOOK_URL),
      webhookSecret: optional(process.env.N8N_WEBHOOK_SECRET, ""),
      timeoutMs: asInt(process.env.N8N_TIMEOUT_MS, 30_000),
      maxRetries: asInt(process.env.N8N_MAX_RETRIES, 2),
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
    audio: {
      openAiApiKey: optional(process.env.OPENAI_API_KEY, ""),
      transcriptionModel: optional(
        process.env.OPENAI_TRANSCRIPTION_MODEL,
        "gpt-4o-transcribe"
      ),
      realtimeTranscriptionModel: optional(
        process.env.OPENAI_REALTIME_TRANSCRIPTION_MODEL,
        "gpt-4o-transcribe"
      ),
      language: optional(process.env.AUDIO_STT_LANGUAGE, "pt"),
      locale: optional(process.env.AUDIO_STT_LOCALE, "pt-BR"),
    },
  } as const;
}

export type ServerConfig = ReturnType<typeof getServerConfig>;
