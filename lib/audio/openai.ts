import "server-only";
import { getServerConfig } from "@/lib/config";
import type { AudioTranscriptContext, N8nAudioAttachment } from "@/lib/types";

const MAX_TRANSCRIPT_CHARS_PER_FILE = 24_000;
const MAX_AUDIO_CONTEXT_CHARS = 32_000;
const OPENAI_TRANSCRIPTION_URL = "https://api.openai.com/v1/audio/transcriptions";
const OPENAI_REALTIME_CLIENT_SECRET_URL =
  "https://api.openai.com/v1/realtime/client_secrets";
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
    ["mp3", "m4a", "wav", "webm", "mp4", "mpeg", "mpga"].includes(extension)
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
