import "server-only";
import { runChatCompletion } from "@/lib/ai/chat-completion";
import { getServerConfig } from "@/lib/config";
import { redactSecrets } from "@/lib/security/redact";
import type { AudioTranscriptContext, N8nAudioAttachment } from "@/lib/types";

const MAX_TRANSCRIPT_CHARS_PER_FILE = 24_000;
const MAX_AUDIO_CONTEXT_CHARS = 32_000;
const OPENAI_TRANSCRIPTION_URL = "https://api.openai.com/v1/audio/transcriptions";
const OPENAI_REALTIME_CLIENT_SECRET_URL =
  "https://api.openai.com/v1/realtime/client_secrets";
const REALTIME_SAMPLE_RATE = 24_000;

const AUDIO_PROMPT =
  "Transcreva em português do Brasil. Preserve linguagem informal, pausas naturais e sentido contextual. Prefira palavras comuns quando fizerem sentido pelo contexto, como rodeio, festa, agradável, fechar e dar dez. Não traduza nomes próprios.";
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

// Extensões que a API de transcrição da OpenAI reconhece. ".opus" NÃO está aqui
// (áudio de WhatsApp): mesmo sendo Ogg/Opus por dentro, a OpenAI rejeita pelo
// nome e devolve vazio. Por isso normalizamos o nome do arquivo antes de enviar.
const OPENAI_AUDIO_EXTENSIONS = new Set([
  "flac",
  "m4a",
  "mp3",
  "mp4",
  "mpeg",
  "mpga",
  "oga",
  "ogg",
  "wav",
  "webm",
]);

/**
 * Devolve um nome de arquivo com extensão que a OpenAI aceita. Se a extensão
 * original já for válida, mantém. Caso contrário (ex.: .opus do WhatsApp),
 * mapeia para a extensão aceita equivalente pelo container/MIME real.
 */
export function openAiSafeAudioName(name: string, type: string): string {
  const ext = extensionOf(name);
  if (OPENAI_AUDIO_EXTENSIONS.has(ext)) return name || `audio.${ext}`;

  const t = (type || "").toLowerCase();
  let target = "ogg";
  if (ext === "opus" || t.includes("opus") || t.includes("ogg") || ext === "oga") {
    target = "ogg"; // Opus/Ogg → .ogg (aceito), preserva o áudio
  } else if (t.includes("mpeg") || t.includes("mp3") || ext === "mpga") {
    target = "mp3";
  } else if (t.includes("mp4") || t.includes("m4a") || t.includes("aac")) {
    target = "m4a";
  } else if (t.includes("wav") || t.includes("wave")) {
    target = "wav";
  } else if (t.includes("webm")) {
    target = "webm";
  } else if (t.includes("flac")) {
    target = "flac";
  }

  const base = (name || "audio").replace(/\.[^.]+$/, "").trim() || "audio";
  return `${base}.${target}`;
}

export async function createOpenAIRealtimeToken(): Promise<{
  token: string;
  expiresAt?: number;
}> {
  const config = getServerConfig();
  const audio = config.audio;

  // Corpo da sessão de transcrição realtime — idêntico para n8n ou OpenAI direto.
  const sessionBody = {
    session: {
      type: "transcription",
      audio: {
        input: {
          format: { type: "audio/pcm", rate: REALTIME_SAMPLE_RATE },
          noise_reduction: { type: "near_field" },
          transcription: {
            model: audio.realtimeTranscriptionModel,
            language: audio.language,
          },
        },
      },
      include: ["item.input_audio_transcription.logprobs"],
    },
  };

  // Proxy n8n quando configurado: o n8n emite o token efêmero com a credencial
  // OpenAI dele (a que funciona), e o navegador conecta no WebSocket com ele.
  if (config.n8n.realtimeWebhookUrl) {
    const res = await fetch(config.n8n.realtimeWebhookUrl, {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "corvus-v3/1.0 (+vercel)",
        ...(config.n8n.webhookSecret
          ? { "X-Corvus-Secret": config.n8n.webhookSecret }
          : {}),
      },
      body: JSON.stringify(sessionBody),
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(
        `n8n realtime token HTTP ${res.status}: ${redactSecrets(text.slice(0, 200))}`
      );
    }
    const parsed = parseRealtimeToken(safeJsonParse(text));
    if (!parsed.token) throw new Error("n8n nao retornou token de ditado.");
    return parsed;
  }

  if (!config.openAiApiKey) {
    throw new Error(MISSING_OPENAI_KEY_MESSAGE);
  }

  const response = await fetch(OPENAI_REALTIME_CLIENT_SECRET_URL, {
    method: "POST",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${config.openAiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(sessionBody),
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

  const parsed = parseRealtimeToken(data);
  if (!parsed.token) throw new Error("OpenAI nao retornou token de ditado.");
  return parsed;
}

/** Extrai {token, expiresAt} da resposta do client_secrets (OpenAI ou via n8n). */
function parseRealtimeToken(raw: unknown): {
  token: string;
  expiresAt?: number;
} {
  const data = (Array.isArray(raw) ? raw[0] : raw) as
    | Record<string, unknown>
    | undefined;
  if (!data || typeof data !== "object") return { token: "" };
  const clientSecret = (data.client_secret ?? data) as
    | Record<string, unknown>
    | undefined;
  const token =
    textValue(clientSecret?.value) ||
    textValue(clientSecret?.secret) ||
    textValue(data.value);
  const expiresAt =
    typeof clientSecret?.expires_at === "number"
      ? clientSecret.expires_at
      : undefined;
  return { token, expiresAt };
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
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

const N8N_TRANSCRIPTION_TIMEOUT_MS = 60_000;

/**
 * Transcreve o áudio PELO n8n: envia a signedUrl ao webhook dedicado, que baixa
 * o arquivo e chama a OpenAI usando a credencial guardada no próprio n8n. Assim o
 * app na Vercel não precisa de OPENAI_API_KEY para o ditado — a chave fica
 * centralizada no n8n, igual ao caminho que responde o Corvus.
 */
export async function transcribeAudioViaN8n(args: {
  signedUrl: string;
  name: string;
  type: string;
  size: number;
}): Promise<N8nAudioAttachment> {
  const config = getServerConfig();
  const webhookUrl = config.n8n.transcriptionWebhookUrl;
  if (!webhookUrl) {
    return n8nErrorAttachment(
      args,
      new Error("N8N_TRANSCRIPTION_WEBHOOK_URL ausente no servidor.")
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    N8N_TRANSCRIPTION_TIMEOUT_MS
  );
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "corvus-v3/1.0 (+vercel)",
        ...(config.n8n.webhookSecret
          ? { "X-Corvus-Secret": config.n8n.webhookSecret }
          : {}),
      },
      body: JSON.stringify({
        signedUrl: args.signedUrl,
        name: args.name,
        // Nome normalizado com extensão que a OpenAI aceita (.opus -> .ogg). O
        // n8n usa este campo para renomear o binário antes de enviar à OpenAI.
        filename: openAiSafeAudioName(args.name, args.type),
        type: args.type,
        language: config.audio.language,
        model: config.audio.transcriptionModel,
      }),
    });

    const text = await response.text();
    if (!response.ok) {
      throw new Error(
        extractN8nError(text) || `n8n retornou HTTP ${response.status}.`
      );
    }

    const transcript = extractN8nTranscript(text);
    if (!transcript) {
      throw new Error("n8n nao retornou transcricao utilizavel.");
    }

    return {
      name: args.name,
      type: args.type,
      size: args.size,
      signedUrl: "",
      text: normalizeTranscript(transcript),
      provider: "openai",
      model: config.audio.transcriptionModel,
      language: config.audio.language,
    };
  } catch (err) {
    return n8nErrorAttachment(args, err);
  } finally {
    clearTimeout(timer);
  }
}

function extractN8nTranscript(rawText: string): string {
  const trimmed = rawText.trim();
  if (!trimmed) return "";
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    // n8n pode responder texto puro com a transcrição.
    return trimmed;
  }
  const item = Array.isArray(parsed) ? parsed[0] : parsed;
  if (item && typeof item === "object") {
    const obj = item as Record<string, unknown>;
    return textValue(obj.text || obj.transcript || obj.output || obj.reply);
  }
  return textValue(parsed);
}

function extractN8nError(rawText: string): string {
  const trimmed = rawText.trim();
  if (!trimmed) return "";
  try {
    const parsed = JSON.parse(trimmed);
    const item = Array.isArray(parsed) ? parsed[0] : parsed;
    if (item && typeof item === "object") {
      const obj = item as Record<string, unknown>;
      return textValue(obj.error || obj.message);
    }
  } catch {
    // ignora — texto cru abaixo
  }
  return trimmed.slice(0, 300);
}

function n8nErrorAttachment(
  args: { name: string; type: string; size: number },
  err: unknown
): N8nAudioAttachment {
  return {
    name: args.name,
    type: args.type,
    size: args.size,
    signedUrl: "",
    provider: "openai",
    transcriptionError: redactSecrets(
      err instanceof Error ? err.message : "Falha ao transcrever audio via n8n."
    ),
  };
}

async function transcribeWithOpenAI(args: {
  buffer: Buffer;
  name: string;
  type: string;
}): Promise<N8nAudioAttachment> {
  const config = getServerConfig();
  const audio = config.audio;
  if (!config.openAiApiKey) throw new Error(MISSING_OPENAI_KEY_MESSAGE);

  const form = new FormData();
  form.append("model", audio.transcriptionModel);
  form.append("language", audio.language);
  form.append("prompt", AUDIO_PROMPT);
  form.append("response_format", "json");
  form.append(
    "file",
    bufferBlob(args.buffer, args.type),
    openAiSafeAudioName(args.name, args.type)
  );

  const response = await fetch(OPENAI_TRANSCRIPTION_URL, {
    method: "POST",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${config.openAiApiKey}`,
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
  const wantsTranscript = isTranscriptRequest(args.message);
  if (wantsTranscript) {
    const cleanTranscript =
      (await cleanAudioTranscript(args.transcript).catch(() => "")) ||
      args.transcript.trim();
    return `Foi falado:\n\n${cleanTranscript}`;
  }

  // Passa pelo proxy n8n quando configurado (credencial OpenAI do n8n).
  const content = await runChatCompletion({
    temperature: 0.35,
    maxTokens: 450,
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
  });
  return normalizeTranscript(content);
}

async function cleanAudioTranscript(transcript: string): Promise<string> {
  const content = await runChatCompletion({
    temperature: 0,
    maxTokens: 500,
    messages: [
      {
        role: "system",
        content:
          "Revise uma transcrição automática em pt-BR. Corrija apenas erros óbvios de reconhecimento de fala, pontuação e capitalização. Preserve as palavras, informalidade e hesitações do falante. Não resuma, não explique e não acrescente informações. Exemplo de correção contextual: Roday/Rodey -> rodeio quando o contexto for festa/evento.",
      },
      {
        role: "user",
        content: transcript.trim(),
      },
    ],
  });
  return normalizeTranscript(content);
}

function isTranscriptRequest(message: string): boolean {
  const normalized = message
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return [
    "o que foi falado",
    "o que falou",
    "oq foi falado",
    "oq falou",
    "que foi falado",
    "que falou",
    "o que falaram",
    "oq falaram",
    "falou nesse audio",
    "falou no audio",
    "falaram nesse audio",
    "falaram no audio",
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
  ].some((pattern) => normalized.includes(pattern)) ||
    (normalized.includes("audio") &&
      /\b(o que|oq|que)\b.*\b(falou|falaram|fala|diz|disse|dito)\b/.test(
        normalized
      ));
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
    transcriptionError: redactSecrets(
      err instanceof Error ? err.message : "Falha ao transcrever audio."
    ),
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
