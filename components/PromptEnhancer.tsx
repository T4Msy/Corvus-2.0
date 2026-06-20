"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowUpRight,
  Loader2,
  Sparkles,
  TriangleAlert,
  Wand2,
  X,
} from "lucide-react";
import type { AgentMode } from "@/lib/types";

interface Props {
  open: boolean;
  mode: AgentMode;
  accessToken?: string | null;
  online?: boolean;
  onClose: () => void;
  /** Insere o prompt aprimorado no composer (sem enviar). */
  onUseDraft: (text: string) => void;
  /** Envia o prompt aprimorado imediatamente. */
  onSendNow: (text: string) => void;
}

const EXAMPLES = [
  "explica os cargos da MSY",
  "resumo da estrutura pra um novo membro",
  "texto de anúncio de reunião",
];

export function PromptEnhancer({
  open,
  mode,
  accessToken,
  online = true,
  onClose,
  onUseDraft,
  onSendNow,
}: Props) {
  const [input, setInput] = useState("");
  const [result, setResult] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Reseta o estado ao fechar para a próxima abertura começar limpa.
  useEffect(() => {
    if (open) {
      const id = window.setTimeout(() => inputRef.current?.focus(), 40);
      return () => window.clearTimeout(id);
    }
    setInput("");
    setResult("");
    setError(null);
    setBusy(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  async function runEnhance() {
    const text = input.trim();
    if (!text || busy) return;
    if (!online) {
      setError("Você está offline. Reconecte para aprimorar.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/corvus/enhance", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ text, mode }),
      });
      const data = (await res.json().catch(() => null)) as
        | { ok: true; prompt: string }
        | { ok: false; error: { message: string } }
        | null;
      if (!res.ok || !data || !data.ok) {
        setError(
          (data && !data.ok && data.error?.message) ||
            "Não foi possível aprimorar o prompt agora."
        );
        return;
      }
      setResult(data.prompt);
    } catch {
      setError("Falha de conexão ao aprimorar o prompt.");
    } finally {
      setBusy(false);
    }
  }

  function handleInputKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      void runEnhance();
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="dialog-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={onClose}
          role="presentation"
        >
          <motion.div
            ref={panelRef}
            className="dialog-panel enhancer-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Aprimorar prompt"
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
          >
            <header className="dialog-header">
              <div className="enhancer-heading">
                <span className="enhancer-heading-icon">
                  <Wand2 size={18} />
                </span>
                <div>
                  <h2>Aprimorar</h2>
                  <p>
                    Transforme uma ideia rápida num prompt claro e completo para o
                    {mode === "fenrir" ? " Fenrir" : " Corvus"}.
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="dialog-close"
                aria-label="Fechar"
                onClick={onClose}
              >
                <X size={18} />
              </button>
            </header>

            <div className="enhancer-body">
              <label className="enhancer-field">
                <span className="enhancer-field-label">Sua ideia</span>
                <textarea
                  ref={inputRef}
                  className="enhancer-input"
                  rows={3}
                  placeholder="Ex.: explica os cargos da MSY de um jeito que um novato entenda"
                  value={input}
                  maxLength={4000}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={handleInputKeyDown}
                />
              </label>

              {!result && !busy && (
                <div className="enhancer-examples" aria-label="Exemplos">
                  {EXAMPLES.map((example) => (
                    <button
                      key={example}
                      type="button"
                      className="enhancer-example-pill"
                      onClick={() => {
                        setInput(example);
                        inputRef.current?.focus();
                      }}
                    >
                      {example}
                    </button>
                  ))}
                </div>
              )}

              {error && (
                <div className="enhancer-error" role="alert">
                  <TriangleAlert size={14} />
                  <span>{error}</span>
                </div>
              )}

              <AnimatePresence>
                {result && (
                  <motion.div
                    className="enhancer-result"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8 }}
                    transition={{ duration: 0.18 }}
                  >
                    <div className="enhancer-result-head">
                      <Sparkles size={14} />
                      <span>Prompt aprimorado</span>
                      <small>edite à vontade antes de usar</small>
                    </div>
                    <textarea
                      className="enhancer-result-text"
                      rows={6}
                      value={result}
                      onChange={(event) => setResult(event.target.value)}
                      aria-label="Prompt aprimorado"
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <footer className="enhancer-footer">
              {result ? (
                <>
                  <button
                    type="button"
                    className="enhancer-secondary-btn"
                    onClick={() => void runEnhance()}
                    disabled={busy || !input.trim()}
                  >
                    {busy ? <Loader2 size={15} className="spin-icon" /> : <Wand2 size={15} />}
                    <span>Refazer</span>
                  </button>
                  <div className="enhancer-footer-actions">
                    <button
                      type="button"
                      className="enhancer-ghost-btn"
                      onClick={() => {
                        onUseDraft(result.trim());
                        onClose();
                      }}
                      disabled={!result.trim()}
                    >
                      Usar no composer
                    </button>
                    <button
                      type="button"
                      className="enhancer-primary-btn"
                      onClick={() => {
                        onSendNow(result.trim());
                        onClose();
                      }}
                      disabled={!result.trim()}
                    >
                      <ArrowUpRight size={15} />
                      <span>Enviar agora</span>
                    </button>
                  </div>
                </>
              ) : (
                <button
                  type="button"
                  className="enhancer-primary-btn enhancer-run-btn"
                  onClick={() => void runEnhance()}
                  disabled={busy || !input.trim()}
                >
                  {busy ? (
                    <Loader2 size={16} className="spin-icon" />
                  ) : (
                    <Wand2 size={16} />
                  )}
                  <span>{busy ? "Aprimorando…" : "Aprimorar"}</span>
                </button>
              )}
            </footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
