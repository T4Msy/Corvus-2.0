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
  Plus,
  Send,
  Sparkles,
  TriangleAlert,
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
  onAttachFile?: (file: File) => void;
  onAttachBlocked?: () => void;
  disabled: boolean;
  attachmentDisabled?: boolean;
  attachmentBusy?: boolean;
  attachments?: ConversationAttachment[];
  onOpenAttachment?: (attachment: ConversationAttachment) => void;
  onRemoveAttachment?: (attachment: ConversationAttachment) => void;
  syncStatus: SyncStatusType;
}

const MAX_HEIGHT = 200;

export function ChatInput({
  mode,
  onModeChange,
  onSend,
  onAttachFile,
  onAttachBlocked,
  disabled,
  attachmentDisabled,
  attachmentBusy,
  attachments = [],
  onOpenAttachment,
  onRemoveAttachment,
  syncStatus,
}: Props) {
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const trimmedValue = value.trim();
  const sendLocked = disabled && trimmedValue.length > 0;
  const hasAttachments = attachments.length > 0;

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!pickerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, MAX_HEIGHT)}px`;
  }, [value]);

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

  return (
    <motion.footer
      className="composer-shell rebuilt-composer"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="composer-dock">
        <div className="composer-input-row">
          <div className="composer-text-field">
            <textarea
              ref={textareaRef}
              rows={1}
              className="composer-textarea"
              placeholder="Como posso ajudar você hoje?"
              aria-label="Mensagem"
              spellCheck
              value={value}
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={handleKeyDown}
            />
            {hasAttachments && (
              <div className="composer-attachment-strip" aria-label="Arquivos anexados">
                {attachments.map((attachment) => (
                  <div className="composer-attachment-chip" key={attachment.id}>
                    <span className="composer-attachment-icon" aria-hidden="true">
                      {attachment.type.startsWith("image/") ? (
                        <ImageIcon size={14} />
                      ) : (
                        <FileText size={14} />
                      )}
                    </span>
                    <span className="composer-attachment-copy">
                      <strong>
                        {attachment.type.startsWith("image/")
                          ? "Imagem anexada"
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
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) onAttachFile?.(file);
              }}
            />
            <button
              type="button"
              className={`attachment-button${attachmentDisabled ? " restricted" : ""}`}
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
            <SyncStatus status={syncStatus} />
          </div>

          <div className="composer-tool-group composer-send-group">
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
