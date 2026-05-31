import "server-only";
import { getServerConfig } from "@/lib/config";
import type { AudioTranscriptContext, N8nAudioAttachment } from "@/lib/types";

const MAX_TRANSCRIPT_CHARS_PER_FILE = 24_000;
const MAX_AUDIO_CONTEXT_CHARS = 32_000;
const OPENAI_TRANSCRIPTION_URL = "https://api.openai.com/v1/audio/transcriptions";
const OPENAI_REALTIME_CLIENT_SECRET_URL =
  "https://api.openai.com/v1/realtime/client_secrets";
const OPENAI_CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions";
const REALTIME_SAMPLE_RATE = 24_000;

const AUDIO_PROMPT =
  "Vocabulário provável: Masayoshi, MSY, Corvus, Fenrir, Cipher, Conselho, T4, Xitter, Nevermind, Britannia, Ordem, Coordenador, Fundador, liderança, membro.";
const MISSING_OPENAI_KEY_MESSAGE =
  "Ditado indisponivel: configure OPENAI_API_KEY no ambiente do servidor e reinicie o app.";

export const SUPPORTED_AUDIO_TYPES = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/mpga",
  "audio/m4a",
  "audio/ogg",
  "audio/oga",
  "audio/opus",
  "audio/wav",
  "audio/wave",
  "audio/webm",
  "video/mp4",
]);

export function isSupportedAudioType(type: string, name: string): boolean {
  const normalized = type.toLowerCase();
  const extension = extensionOf(name);
  return (
    SUPPORTED_AUDIO_TYPES.has(normalized) ||
    ["mp3", "m4a", "ogg", "oga", "opus", "wav", "webm", "mp4", "mpeg", "mpga"].includes(extension)
  );
}

export async function createOpenAIRealtimeToken(): Promise<{
  token: string;
  expiresAt?: number;
}> {
  const audio = getServerConfig().audio;
  if (!audio.openAiApiKey) {
    throw new Error(MISSING_OPENAI_KEY_MESSAGE);
  }

  const response = await fetch(OPENAI_REALTIME_CLIENT_SECRET_URL, {
    method: "POST",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${audio.openAiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      session: {
        type: "transcription",
        audio: {
          input: {
            format: {
              type: "audio/pcm",
              rate: REALTIME_SAMPLE_RATE,
            },
            noise_reduction: {
              type: "near_field",
            },
            transcription: {
              model: audio.realtimeTranscriptionModel,
              language: audio.language,
            },
          },
        },
        include: ["item.input_audio_transcription.logprobs"],
      },
    }),
  });

  const data = (await response.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  const clientSecret = (data?.client_secret ?? data) as
    | Record<string, unknown>
    | undefined;
  const token =
    textValue(clientSecret?.value) ||
    textValue(clientSecret?.secret) ||
    textValue(data?.value);

  if (!response.ok || !token) {
    throw new Error(
      textValue((data?.error as Record<string, unknown> | undefined)?.message) ||
        textValue(data?.message) ||
        `OpenAI retornou HTTP ${response.status}.`
    );
  }

  const expiresAt =
    typeof clientSecret?.expires_at === "number"
      ? clientSecret.expires_at
      : undefined;
  return { token, expiresAt };
}

export async function transcribeAudioBuffer(args: {
  buffer: Buffer;
  name: string;
  type: string;
}): Promise<N8nAudioAttachment> {
  return transcribeWithOpenAI(args).catch((err) =>
    errorAttachment(args, "openai", err)
  );
}

async function transcribeWithOpenAI(args: {
  buffer: Buffer;
  name: string;
  type: string;
}): Promise<N8nAudioAttachment> {
  const audio = getServerConfig().audio;
  if (!audio.openAiApiKey) throw new Error(MISSING_OPENAI_KEY_MESSAGE);

  const form = new FormData();
  form.append("model", audio.transcriptionModel);
  form.append("language", audio.language);
  form.append("prompt", AUDIO_PROMPT);
  form.append("response_format", "json");
  form.append("file", bufferBlob(args.buffer, args.type), args.name);

  const response = await fetch(OPENAI_TRANSCRIPTION_URL, {
    method: "POST",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${audio.openAiApiKey}`,
    },
    body: form,
  });

  const data = (await response.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!response.ok) {
    throw new Error(
      textValue((data?.error as Record<string, unknown> | undefined)?.message) ||
        textValue(data?.message) ||
        `OpenAI retornou HTTP ${response.status}.`
    );
  }

  return {
    name: args.name,
    type: args.type,
    size: args.buffer.byteLength,
    signedUrl: "",
    text: normalizeTranscript(textValue(data?.text)),
    provider: "openai",
    model: audio.transcriptionModel,
    language: audio.language,
  };
}

export function buildAudioContext(
  audios: N8nAudioAttachment[]
): AudioTranscriptContext | null {
  const usable = audios
    .filter((audio) => audio.text?.trim())
    .map((audio) => {
      const trimmed = trimWithFlag(audio.text ?? "", MAX_TRANSCRIPT_CHARS_PER_FILE);
      return {
        name: audio.name,
        type: audio.type,
        size: audio.size,
        text: trimmed.text,
        provider: audio.provider ?? "openai",
        model: audio.model ?? "",
        language: audio.language ?? "",
        confidence: audio.confidence,
        truncated: trimmed.truncated,
      };
    });

  if (usable.length === 0) return null;

  const joined = usable
    .map((audio, index) =>
      [
        `Audio ${index + 1}: ${audio.name}`,
        `Tipo: ${audio.type || "application/octet-stream"}`,
        `Provedor: ${audio.provider}`,
        audio.model ? `Modelo: ${audio.model}` : "",
        audio.language ? `Idioma: ${audio.language}` : "",
        Number.isFinite(audio.confidence)
          ? `Confianca: ${audio.confidence}`
          : "",
        `Transcricao:\n${audio.text}`,
      ]
        .filter(Boolean)
        .join("\n")
    )
    .join("\n\n---\n\n");

  const trimmed = trimWithFlag(joined, MAX_AUDIO_CONTEXT_CHARS);
  const truncatedFiles = usable
    .filter((audio) => audio.truncated)
    .map((audio) => audio.name);
  const limitations = [
    trimmed.truncated ? "Contexto total de audio truncado por limite de tamanho." : "",
    truncatedFiles.length ? `Audios truncados: ${truncatedFiles.join(", ")}.` : "",
  ]
    .filter(Boolean)
    .join(" ");

  return {
    audios: usable.map(({ truncated, ...audio }) => audio),
    text: trimmed.text,
    limitations,
  };
}

export function formatAudioContext(context: AudioTranscriptContext): string {
  return [
    context.text ? `Transcricao dos audios:\n${context.text}` : "",
    context.limitations ? `Limitacoes: ${context.limitations}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function answerAudioTranscriptFallback(args: {
  message: string;
  transcript: string;
}): Promise<string> {
  const audio = getServerConfig().audio;
  if (!audio.openAiApiKey) throw new Error(MISSING_OPENAI_KEY_MESSAGE);
  const wantsTranscript = isTranscriptRequest(args.message);
  if (wantsTranscript) {
    return `Foi falado:\n\n${args.transcript.trim()}`;
  }

  const response = await fetch(OPENAI_CHAT_COMPLETIONS_URL, {
    method: "POST",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${audio.openAiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: audio.responseFallbackModel,
      temperature: 0.35,
      max_tokens: 450,
      messages: [
        {
          role: "system",
          content:
            "Voce e Corvus. Responda em pt-BR, de forma natural e direta, usando a transcricao do audio como a mensagem do usuario. Nao mencione workflow, n8n, fallback ou metadados tecnicos. Se o usuario pedir para transcrever, dizer o que foi falado, passar o texto do audio ou perguntar literalmente o conteudo dito, devolva a fala transcrita de forma limpa e fiel, sem resumir. Se o audio for conversa solta ou ambigua e nao houver pedido de transcricao, responda com uma leitura curta do que foi entendido e uma pergunta objetiva para continuar.",
        },
        {
          role: "user",
          content: [
            args.message.trim() ? `Mensagem digitada: ${args.message.trim()}` : "",
            `Audio transcrito:\n${args.transcript.trim()}`,
          ]
            .filter(Boolean)
            .join("\n\n"),
        },
      ],
    }),
  });

  const data = (await response.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!response.ok) {
    throw new Error(
      textValue((data?.error as Record<string, unknown> | undefined)?.message) ||
        textValue(data?.message) ||
        `OpenAI retornou HTTP ${response.status}.`
    );
  }

  const choices = data?.choices as
    | Array<{ message?: { content?: unknown } }>
    | undefined;
  return normalizeTranscript(textValue(choices?.[0]?.message?.content));
}

function isTranscriptRequest(message: string): boolean {
  const normalized = message
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return [
    "o que foi falado",
    "oq foi falado",
    "que foi falado",
    "o que falaram",
    "oq falaram",
    "transcrev",
    "transcricao",
    "transcrição",
    "texto do audio",
    "texto do áudio",
    "o que diz",
    "oq diz",
    "o que ele disse",
    "o que ela disse",
    "o que foi dito",
    "oq foi dito",
  ].some((pattern) => normalized.includes(pattern));
}

function errorAttachment(
  args: { buffer: Buffer; name: string; type: string },
  provider: "openai",
  err: unknown
): N8nAudioAttachment {
  return {
    name: args.name,
    type: args.type,
    size: args.buffer.byteLength,
    signedUrl: "",
    provider,
    transcriptionError:
      err instanceof Error ? err.message : "Falha ao transcrever audio.",
  };
}

function normalizeTranscript(text: string): string {
  return text.replace(/\u0000/g, "").replace(/[ \t]+\n/g, "\n").trim();
}

function trimWithFlag(
  value: string,
  maxChars: number
): { text: string; truncated: boolean } {
  if (value.length <= maxChars) return { text: value, truncated: false };
  return {
    text: `${value.slice(0, maxChars).trim()}\n\n[conteudo truncado]`,
    truncated: true,
  };
}

function textValue(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value.map(textValue).filter(Boolean).join(" ");
  if (value && typeof value === "object" && "message" in value) {
    return textValue((value as { message?: unknown }).message);
  }
  return "";
}

function bufferBlob(buffer: Buffer, type: string): Blob {
  const copy = new Uint8Array(buffer.byteLength);
  copy.set(buffer);
  return new Blob([copy], { type });
}

function extensionOf(name: string): string {
  const clean = name.toLowerCase().split("?")[0] ?? "";
  const parts = clean.split(".");
  return parts.length > 1 ? parts.pop() ?? "" : "";
}
