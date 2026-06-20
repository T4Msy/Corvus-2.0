"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bot,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Loader2,
  Mic,
  Plus,
  Send,
  Sparkles,
  Square,
  TriangleAlert,
  Volume2,
  X,
  Zap,
} from "lucide-react";
import type {
  AgentMode,
  ConversationAttachment,
  SyncStatus as SyncStatusType,
} from "@/lib/types";

interface Props {
  mode: AgentMode;
  onModeChange: (m: AgentMode) => void;
  onSend: (text: string) => boolean | void;
  /** Texto injetado externamente no composer (ex.: pelo refinador). nonce dispara a aplicação. */
  injectedDraft?: { text: string; nonce: number };
  onAttachFile?: (file: File) => void;
  onAttachBlocked?: () => void;
  disabled: boolean;
  attachmentDisabled?: boolean;
  attachmentBusy?: boolean;
  attachments?: ConversationAttachment[];
  onOpenAttachment?: (attachment: ConversationAttachment) => void;
  onRemoveAttachment?: (attachment: ConversationAttachment) => void;
  dictationAccessToken?: string | null;
  dictationDisabled?: boolean;
  onDictationBlocked?: () => void;
  onDictationError?: (message: string) => void;
  syncStatus: SyncStatusType;
  showSuggestions?: boolean;
}

const MAX_HEIGHT = 200;
const REALTIME_SAMPLE_RATE = 24_000;
const HOME_SUGGESTIONS = [
  {
    label: "O que é Masayoshi",
    prompt:
      "Explique o que é a Masayoshi de forma clara, objetiva e institucional.",
  },
  {
    label: "Estrutura",
    prompt:
      "Explique a estrutura da Masayoshi, incluindo áreas, funcionamento e responsabilidades principais.",
  },
  {
    label: "Cargos",
    prompt:
      "Liste e explique os cargos da Masayoshi, com responsabilidades e função de cada posição.",
  },
];

export function ChatInput({
  mode,
  onModeChange,
  onSend,
  injectedDraft,
  onAttachFile,
  onAttachBlocked,
  disabled,
  attachmentDisabled,
  attachmentBusy,
  attachments = [],
  onOpenAttachment,
  onRemoveAttachment,
  dictationAccessToken,
  dictationDisabled,
  onDictationBlocked,
  onDictationError,
  syncStatus,
  showSuggestions = false,
}: Props) {
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  const [dictationStatus, setDictationStatus] = useState<
    "idle" | "connecting" | "recording"
  >("idle");
  const [compactPlaceholder, setCompactPlaceholder] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const dictationRef = useRef<DictationSession | null>(null);
  const dictationBaseRef = useRef("");
  const committedTextRef = useRef("");
  const partialTextRef = useRef("");
  const trimmedValue = value.trim();
  const sendLocked = disabled && trimmedValue.length > 0;
  const hasAttachments = attachments.length > 0;
  const dictating = dictationStatus !== "idle";

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!pickerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 520px)");
    const updatePlaceholder = () => setCompactPlaceholder(media.matches);
    updatePlaceholder();
    media.addEventListener("change", updatePlaceholder);
    return () => media.removeEventListener("change", updatePlaceholder);
  }, []);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, MAX_HEIGHT)}px`;
  }, [value]);

  // Aplica texto injetado externamente (refinador). Reage só à mudança de nonce
  // para não sobrescrever o que o usuário digita.
  const injectedNonce = injectedDraft?.nonce ?? 0;
  useEffect(() => {
    if (!injectedDraft || injectedNonce === 0) return;
    setValue(injectedDraft.text);
    const ta = textareaRef.current;
    if (ta) {
      ta.focus();
      const len = injectedDraft.text.length;
      requestAnimationFrame(() => ta.setSelectionRange(len, len));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [injectedNonce]);

  useEffect(() => {
    return () => {
      void stopDictation();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function commitSend() {
    const text = value.trim();
    if ((!text && !hasAttachments) || disabled) return;
    const accepted = onSend(text);
    if (accepted !== false) setValue("");
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter: nova linha (default do textarea)
    // Ctrl+Enter ou Cmd+Enter: envia
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      commitSend();
    }
  }

  async function startDictation() {
    if (dictationDisabled || !dictationAccessToken) {
      onDictationBlocked?.();
      return;
    }
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      onDictationError?.("Este navegador não suporta ditado por microfone.");
      return;
    }

    setDictationStatus("connecting");
    dictationBaseRef.current = value;
    committedTextRef.current = "";
    partialTextRef.current = "";

    try {
      const tokenResponse = await fetch("/api/audio/realtime-token", {
        method: "POST",
        headers: {
          ...(dictationAccessToken
            ? { Authorization: `Bearer ${dictationAccessToken}` }
            : {}),
        },
      });
      const tokenData = (await tokenResponse.json().catch(() => null)) as
        | RealtimeTokenResponse
        | null;
      if (!tokenResponse.ok || !tokenData?.ok) {
        throw new Error(
          tokenData && !tokenData.ok
            ? tokenData.error.message
            : "Não foi possível iniciar o ditado."
        );
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const session = await openDictationSession({
        stream,
        tokenData,
        onOpen: () => setDictationStatus("recording"),
        onMessage: handleDictationMessage,
        onError: (message) => {
          onDictationError?.(message);
          void stopDictation();
        },
      });
      dictationRef.current = session;
    } catch (err) {
      setDictationStatus("idle");
      onDictationError?.(
        err instanceof Error ? err.message : "Não foi possível iniciar o ditado."
      );
    }
  }

  async function stopDictation() {
    const session = dictationRef.current;
    dictationRef.current = null;
    session?.stop();
    setDictationStatus("idle");
    partialTextRef.current = "";
  }

  function handleDictationMessage(event: RealtimeTranscriptEvent) {
    if (event.type === "conversation.item.input_audio_transcription.delta") {
      // Os deltas sao fragmentos de token (ex.: "Prec" + "iso"). Concatena CRU —
      // sem trim e sem inserir espaco, senao corta palavras no meio ("Prec iso").
      // O proprio modelo ja emite o espaco quando comeca uma palavra nova.
      partialTextRef.current += event.delta || "";
      renderDictationText();
      return;
    }
    if (event.type === "conversation.item.input_audio_transcription.completed") {
      const text = event.transcript || event.text || "";
      if (text.trim()) {
        committedTextRef.current = appendDictatedText(
          committedTextRef.current,
          text
        );
      }
      partialTextRef.current = "";
      renderDictationText();
    }
  }

  function renderDictationText() {
    const current = [committedTextRef.current, partialTextRef.current]
      .filter(Boolean)
      .join(" ")
      .trim();
    if (!current) return;
    setValue(mergeDictationValue(dictationBaseRef.current, current));
  }

  return (
    <motion.footer
      className="composer-shell rebuilt-composer"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="composer-dock">
        {hasAttachments && (
          <div className="composer-attachment-strip" aria-label="Arquivos anexados">
            {attachments.map((attachment) => (
              <div className="composer-attachment-chip" key={attachment.id}>
                <span className="composer-attachment-icon" aria-hidden="true">
                  {attachment.type.startsWith("image/") ? (
                    <ImageIcon size={14} />
                  ) : isAudioAttachment(attachment) ? (
                    <Volume2 size={14} />
                  ) : (
                    <FileText size={14} />
                  )}
                </span>
                <span className="composer-attachment-copy">
                  <strong>
                    {attachment.type.startsWith("image/")
                      ? "Imagem anexada"
                      : isAudioAttachment(attachment)
                        ? "Áudio anexado"
                      : "Arquivo anexado"}
                  </strong>
                  <small>
                    {attachment.name} · {formatFileSize(attachment.size)}
                  </small>
                </span>
                {onOpenAttachment && (
                  <button
                    type="button"
                    aria-label="Abrir anexo"
                    title="Abrir anexo"
                    onClick={() => onOpenAttachment(attachment)}
                  >
                    <ExternalLink size={13} />
                  </button>
                )}
                {onRemoveAttachment && (
                  <button
                    type="button"
                    aria-label="Remover anexo"
                    title="Remover anexo"
                    onClick={() => onRemoveAttachment(attachment)}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        <div className="composer-input-row">
          <div className="composer-text-field">
            <textarea
              ref={textareaRef}
              rows={1}
              className="composer-textarea"
              placeholder={
                compactPlaceholder
                  ? "Como posso ajudar?"
                  : "Como posso ajudar você hoje?"
              }
              aria-label="Mensagem"
              spellCheck
              value={value}
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={handleKeyDown}
            />
          </div>
          <div className="composer-input-meta" aria-hidden="true">
            <span>{mode === "fenrir" ? "Modo Fenrir" : "Modo Corvus"}</span>
            <small>Enter cria linha · Ctrl+Enter envia</small>
          </div>
        </div>

        <div className="composer-toolbar">
          <div className="composer-tool-group">
            <input
              ref={fileRef}
              type="file"
              className="sr-only"
              aria-label="Selecionar arquivo"
              accept="image/*,.pdf,.docx,.txt,.md,.csv,.json,audio/*,video/mp4,.mp3,.m4a,.ogg,.oga,.opus,.wav,.webm,.mp4,.mpeg,.mpga"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) onAttachFile?.(file);
              }}
            />
            <button
              type="button"
              className={`attachment-button attachment-file-button${
                attachmentDisabled ? " restricted" : ""
              }`}
              aria-label="Anexar arquivo"
              title="Anexar arquivo"
              disabled={attachmentBusy}
              onClick={() => {
                if (attachmentDisabled) {
                  onAttachBlocked?.();
                  return;
                }
                fileRef.current?.click();
              }}
            >
              {attachmentBusy ? <Loader2 size={16} /> : <Plus size={18} />}
              <span>{attachmentBusy ? "..." : "Anexos"}</span>
            </button>
            <div
              className="agent-picker compact-agent-picker"
              data-agent-mode={mode}
              ref={pickerRef}
            >
              <button
                type="button"
                className="agent-picker-button"
                aria-haspopup="listbox"
                aria-expanded={open}
                title="Selecionar agente"
                onClick={(event) => {
                  event.stopPropagation();
                  setOpen((current) => !current);
                }}
              >
                <span className="agent-picker-mobile-icon" aria-hidden="true">
                  {mode === "fenrir" ? <Zap size={16} /> : <Bot size={16} />}
                </span>
                <span className="agent-picker-copy">
                  <strong>{mode === "fenrir" ? "Fenrir" : "Corvus"}</strong>
                </span>
                <ChevronDown size={12} />
              </button>

              <AnimatePresence>
                {open && (
                  <motion.div
                    className="agent-menu"
                    role="listbox"
                    initial={{ opacity: 0, y: 6, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 6, scale: 0.98 }}
                    transition={{ duration: 0.14 }}
                  >
                    <ModeOption
                      active={mode === "corvus"}
                      icon={<Bot size={15} />}
                      label="Corvus"
                      description="Institucional · preciso"
                      onClick={() => {
                        onModeChange("corvus");
                        setOpen(false);
                      }}
                    />
                    <ModeOption
                      active={mode === "fenrir"}
                      icon={<Zap size={15} />}
                      label="Fenrir"
                      description="Criativo · expansivo"
                      onClick={() => {
                        onModeChange("fenrir");
                        setOpen(false);
                      }}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <SyncStatus status={syncStatus} />
          </div>

          <div className="composer-tool-group composer-send-group">
            <button
              type="button"
              className={`attachment-button attachment-voice-button dictation-button${
                dictating ? " recording" : ""
              }${dictationDisabled ? " restricted" : ""}`}
              aria-label={dictating ? "Parar ditado" : "Iniciar ditado"}
              title={dictating ? "Parar ditado" : "Ditado por voz"}
              disabled={dictationStatus === "connecting"}
              onClick={() => {
                if (dictating) {
                  void stopDictation();
                  return;
                }
                void startDictation();
              }}
            >
              {dictationStatus === "connecting" ? (
                <Loader2 size={16} />
              ) : dictating ? (
                <Square size={15} />
              ) : (
                <Mic size={16} />
              )}
              <span>
                {dictationStatus === "connecting"
                  ? "..."
                  : dictating
                    ? "Gravando"
                    : "Voz"}
              </span>
            </button>
            <button
              type="button"
              className="send-button"
              aria-label="Enviar"
              title="Enviar (Ctrl+Enter)"
              disabled={disabled || (!trimmedValue && !hasAttachments)}
              onClick={commitSend}
            >
              {sendLocked ? (
                <Loader2 size={16} className="spin-icon" />
              ) : disabled ? (
                <Sparkles size={16} />
              ) : (
                <Send size={16} />
              )}
              <span>{sendLocked ? "..." : "Enviar"}</span>
            </button>
          </div>
        </div>
      </div>
      {showSuggestions && (
        <div className="home-suggestion-row" aria-label="Sugestões">
          {HOME_SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion.label}
              type="button"
              className="home-suggestion-pill"
              disabled={disabled}
              onClick={() => onSend(suggestion.prompt)}
            >
              <span>{suggestion.label}</span>
            </button>
          ))}
        </div>
      )}
    </motion.footer>
  );
}

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  );
  const value = bytes / 1024 ** index;
  return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${
    units[index]
  }`;
}

type RealtimeTokenResponse =
  | {
      ok: true;
      token: string;
      expiresAt?: number;
      model: string;
      language: string;
      locale: string;
      audioFormat: string;
      sampleRate: number;
      websocketUrl: string;
    }
  | {
      ok: false;
      error: { code: string; message: string };
    };

type RealtimeTranscriptEvent = {
  type?: string;
  delta?: string;
  text?: string;
  transcript?: string;
  error?: string;
  message?: string;
};

type DictationSession = {
  stop: () => void;
};

async function openDictationSession(args: {
  stream: MediaStream;
  tokenData: Extract<RealtimeTokenResponse, { ok: true }>;
  onOpen: () => void;
  onMessage: (event: RealtimeTranscriptEvent) => void;
  onError: (message: string) => void;
}): Promise<DictationSession> {
  const url = `${args.tokenData.websocketUrl}?intent=transcription`;
  const socket = new WebSocket(url, [
    "realtime",
    `openai-insecure-api-key.${args.tokenData.token}`,
  ]);
  const audioContext = new window.AudioContext();
  const source = audioContext.createMediaStreamSource(args.stream);
  const processor = audioContext.createScriptProcessor(4096, 1, 1);

  let opened = false;
  let stopped = false;

  socket.onopen = () => {
    opened = true;
    args.onOpen();
  };
  socket.onerror = () => {
    if (!stopped) args.onError("Falha na conexao do ditado.");
  };
  socket.onclose = () => {
    if (!stopped && !opened) args.onError("Ditado encerrado antes de iniciar.");
  };
  socket.onmessage = (event) => {
    const parsed = parseRealtimeEvent(event.data);
    if (!parsed) return;
    if (parsed.type === "error") {
      args.onError(parsed.error || parsed.message || "Erro no ditado.");
      return;
    }
    args.onMessage(parsed);
  };

  processor.onaudioprocess = (event) => {
    if (stopped || socket.readyState !== WebSocket.OPEN) return;
    const input = event.inputBuffer.getChannelData(0);
    const downsampled = downsampleToRealtimeRate(input, audioContext.sampleRate);
    if (downsampled.length === 0) return;
    socket.send(
      JSON.stringify({
        type: "input_audio_buffer.append",
        audio: pcm16ToBase64(downsampled),
      })
    );
  };

  source.connect(processor);
  processor.connect(audioContext.destination);

  return {
    stop: () => {
      stopped = true;
      try {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(
            JSON.stringify({
              type: "input_audio_buffer.commit",
            })
          );
        }
      } catch {
        /* conexao encerrada */
      }
      source.disconnect();
      processor.disconnect();
      args.stream.getTracks().forEach((track) => track.stop());
      void audioContext.close().catch(() => undefined);
      if (
        socket.readyState === WebSocket.OPEN ||
        socket.readyState === WebSocket.CONNECTING
      ) {
        socket.close();
      }
    },
  };
}

function parseRealtimeEvent(value: unknown): RealtimeTranscriptEvent | null {
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object"
      ? (parsed as RealtimeTranscriptEvent)
      : null;
  } catch {
    return null;
  }
}

function downsampleToRealtimeRate(
  input: Float32Array,
  sampleRate: number
): Int16Array {
  if (sampleRate <= REALTIME_SAMPLE_RATE) return floatToPcm16(input);
  const ratio = sampleRate / REALTIME_SAMPLE_RATE;
  const length = Math.floor(input.length / ratio);
  const result = new Int16Array(length);
  for (let i = 0; i < length; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(Math.floor((i + 1) * ratio), input.length);
    let sum = 0;
    for (let j = start; j < end; j++) sum += input[j] ?? 0;
    const sample = sum / Math.max(1, end - start);
    result[i] = clampPcm16(sample);
  }
  return result;
}

function floatToPcm16(input: Float32Array): Int16Array {
  const result = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    result[i] = clampPcm16(input[i] ?? 0);
  }
  return result;
}

function clampPcm16(sample: number): number {
  const clamped = Math.max(-1, Math.min(1, sample));
  return clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
}

function pcm16ToBase64(samples: Int16Array): string {
  let binary = "";
  const bytes = new Uint8Array(samples.buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i] ?? 0);
  }
  return window.btoa(binary);
}

function appendDictatedText(previous: string, next: string): string {
  const clean = next.trim();
  if (!clean) return previous;
  if (!previous.trim()) return clean;
  return `${previous.trimEnd()} ${clean}`;
}

function mergeDictationValue(base: string, dictated: string): string {
  const clean = dictated.trim();
  if (!base.trim()) return clean;
  return `${base.trimEnd()} ${clean}`;
}

function isAudioAttachment(attachment: ConversationAttachment): boolean {
  return attachment.type.startsWith("audio/") || attachment.type === "video/mp4";
}

function SyncStatus({
  status,
}: {
  status: SyncStatusType;
}) {
  if (status === "saving") {
    return (
      <span className="sync-status saving">
        <Loader2 size={12} />
        Salvando
      </span>
    );
  }
  if (status === "saved") {
    return (
      <span className="sync-status saved">
        <CheckCircle2 size={12} />
        Salvo
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className="sync-status error">
        <TriangleAlert size={12} />
        Revisar conexão
      </span>
    );
  }
  if (status === "offline") {
    return (
      <span className="sync-status offline">
        <TriangleAlert size={12} />
        Offline
      </span>
    );
  }
  return <span className="sync-status idle">Sessão pronta</span>;
}

function ModeOption({
  active,
  icon,
  label,
  description,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`agent-option${active ? " active" : ""}`}
      role="option"
      aria-selected={active}
      onClick={onClick}
    >
      <span className="agent-option-icon">{icon}</span>
      <span>
        <strong>{label}</strong>
        <small>{description}</small>
      </span>
    </button>
  );
}
