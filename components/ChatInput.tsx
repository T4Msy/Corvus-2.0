"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bot,
  ChevronDown,
  Paperclip,
  Send,
  Sparkles,
  Zap,
} from "lucide-react";
import type { AgentMode } from "@/lib/types";

interface Props {
  mode: AgentMode;
  onModeChange: (m: AgentMode) => void;
  onSend: (text: string) => void;
  disabled: boolean;
  onAttachFile?: (file: File) => void;
}

const MAX_HEIGHT = 164;

export function ChatInput({
  mode,
  onModeChange,
  onSend,
  disabled,
  onAttachFile,
}: Props) {
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const selectorRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!selectorRef.current?.contains(event.target as Node)) setOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, MAX_HEIGHT)}px`;
  }, [value]);

  function commitSend() {
    const text = value.trim();
    if (!text || disabled) return;
    onSend(text);
    setValue("");
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      commitSend();
    }
  }

  return (
    <motion.footer
      className="composer-shell"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.36, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="composer">
        <div className="agent-picker" ref={selectorRef}>
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
            {mode === "fenrir" ? <Zap size={17} /> : <Bot size={17} />}
            <span>{mode === "fenrir" ? "Fenrir" : "Corvus"}</span>
            <ChevronDown size={15} />
          </button>

          <AnimatePresence>
            {open && (
              <motion.div
                className="agent-menu"
                role="listbox"
                initial={{ opacity: 0, y: 8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.98 }}
                transition={{ duration: 0.16 }}
              >
                <ModeOption
                  active={mode === "corvus"}
                  icon={<Bot size={18} />}
                  label="Corvus"
                  description="Institucional"
                  onClick={() => {
                    onModeChange("corvus");
                    setOpen(false);
                  }}
                />
                <ModeOption
                  active={mode === "fenrir"}
                  icon={<Zap size={18} />}
                  label="Fenrir"
                  description="Criativo"
                  onClick={() => {
                    onModeChange("fenrir");
                    setOpen(false);
                  }}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <textarea
          ref={textareaRef}
          rows={1}
          className="composer-textarea"
          placeholder={
            mode === "fenrir" ? "Acione Fenrir..." : "Pergunte ao Corvus..."
          }
          aria-label="Mensagem"
          spellCheck
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={handleKeyDown}
        />

        <input
          ref={fileRef}
          type="file"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file && onAttachFile) onAttachFile(file);
            event.currentTarget.value = "";
          }}
        />

        <div className="composer-actions">
          {onAttachFile && (
            <button
              type="button"
              className="icon-button ghost"
              title="Anexar arquivo"
              aria-label="Anexar arquivo"
              onClick={() => fileRef.current?.click()}
            >
              <Paperclip size={18} />
            </button>
          )}
          <button
            type="button"
            className="send-button"
            aria-label="Enviar"
            title="Enviar"
            disabled={disabled || !value.trim()}
            onClick={commitSend}
          >
            {disabled ? <Sparkles size={18} /> : <Send size={18} />}
          </button>
        </div>
      </div>
    </motion.footer>
  );
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
