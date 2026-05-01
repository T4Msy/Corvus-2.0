"use client";

import { useEffect, useRef, useState } from "react";
import type { AgentMode } from "@/lib/types";

interface Props {
  mode: AgentMode;
  onModeChange: (m: AgentMode) => void;
  onSend: (text: string) => void;
  disabled: boolean;
}

const MAX_HEIGHT = 150;

export function ChatInput({ mode, onModeChange, onSend, disabled }: Props) {
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("click", handle);
    return () => document.removeEventListener("click", handle);
  }, []);

  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, MAX_HEIGHT) + "px";
  }, [value]);

  function commitSend() {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter = quebra de linha (default do textarea, NÃO chamamos preventDefault)
    // Ctrl+Enter ou Cmd+Enter = envia
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      commitSend();
    }
  }

  const placeholder =
    mode === "fenrir"
      ? "Modo Fenrir — criatividade da MSY... (Ctrl+Enter envia)"
      : "Faça sua pergunta ao Corvus... (Ctrl+Enter envia)";

  return (
    <div className="input-container">
      <div className="input-wrapper">
        <div className="model-selector" ref={wrapperRef}>
          <button
            type="button"
            className={`model-selector-btn${mode === "fenrir" ? " fenrir-active" : ""}`}
            aria-haspopup="listbox"
            aria-expanded={open}
            onClick={(e) => {
              e.stopPropagation();
              setOpen((v) => !v);
            }}
          >
            <span
              className={
                mode === "fenrir"
                  ? "model-selector-icon fenrir-icon"
                  : "model-selector-icon corvus-icon"
              }
            >
              {mode === "fenrir" ? <FenrirIcon /> : <CorvusIcon />}
            </span>
            <span className="model-selector-name">
              {mode === "fenrir" ? "Fenrir" : "Corvus"}
            </span>
            <svg
              className="model-selector-chevron"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>

          {open && (
            <div className="model-dropdown open" role="listbox">
              <div className="model-dropdown-header">Modo de resposta</div>
              <ModeOption
                active={mode === "corvus"}
                onClick={() => {
                  onModeChange("corvus");
                  setOpen(false);
                }}
                icon={<CorvusIcon />}
                iconClass="corvus-icon"
                name="Corvus"
                desc="Preciso e institucional"
              />
              <ModeOption
                active={mode === "fenrir"}
                onClick={() => {
                  onModeChange("fenrir");
                  setOpen(false);
                }}
                icon={<FenrirIcon />}
                iconClass="fenrir-icon"
                name="Fenrir"
                desc="Criativo e expansivo"
              />
            </div>
          )}
        </div>

        <textarea
          ref={taRef}
          rows={1}
          placeholder={placeholder}
          aria-label="Mensagem"
          autoComplete="off"
          spellCheck
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
        />

        <button
          className="btn-send"
          aria-label="Enviar mensagem"
          onClick={commitSend}
          disabled={disabled || !value.trim()}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>

      <p className="input-hint">
        © 2026 Masayoshi — Enter quebra linha · Ctrl+Enter ou botão envia
      </p>
    </div>
  );
}

function ModeOption({
  active,
  onClick,
  icon,
  iconClass,
  name,
  desc,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  iconClass: string;
  name: string;
  desc: string;
}) {
  return (
    <button
      type="button"
      className={`model-option${active ? " active" : ""}`}
      role="option"
      aria-selected={active}
      onClick={onClick}
    >
      <div className={`model-option-icon ${iconClass}`}>{icon}</div>
      <div className="model-option-info">
        <span className="model-option-name">{name}</span>
        <span className="model-option-desc">{desc}</span>
      </div>
      <div className="model-option-check">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M20 6L9 17l-5-5" />
        </svg>
      </div>
    </button>
  );
}

function CorvusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 8v4l3 3" />
    </svg>
  );
}

function FenrirIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
    </svg>
  );
}
