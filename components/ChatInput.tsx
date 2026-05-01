"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bot, ChevronDown, Send, Sparkles, Zap } from "lucide-react";
import type { AgentMode } from "@/lib/types";

interface Props {
  mode: AgentMode;
  onModeChange: (m: AgentMode) => void;
  onSend: (text: string) => void;
  disabled: boolean;
}

const MAX_HEIGHT = 200;

export function ChatInput({ mode, onModeChange, onSend, disabled }: Props) {
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

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
    if (!text || disabled) return;
    onSend(text);
    setValue("");
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
      className="composer-shell"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="composer">
        <div className="agent-picker" ref={pickerRef}>
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
            {mode === "fenrir" ? <Zap size={15} /> : <Bot size={15} />}
            <span>{mode === "fenrir" ? "Fenrir" : "Corvus"}</span>
            <ChevronDown size={13} />
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

        <textarea
          ref={textareaRef}
          rows={1}
          className="composer-textarea"
          placeholder={
            mode === "fenrir"
              ? "Acione Fenrir..."
              : "Pergunte ao Corvus..."
          }
          aria-label="Mensagem"
          spellCheck
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={handleKeyDown}
        />

        <div className="composer-actions">
          <button
            type="button"
            className="send-button"
            aria-label="Enviar"
            title="Enviar (Ctrl+Enter)"
            disabled={disabled || !value.trim()}
            onClick={commitSend}
          >
            {disabled ? <Sparkles size={16} /> : <Send size={16} />}
          </button>
        </div>
      </div>

      <p className="composer-hint">
        Enter quebra linha · Ctrl+Enter (ou botão) envia
      </p>
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
