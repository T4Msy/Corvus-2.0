"use client";

import { useEffect, useMemo, useRef } from "react";
import { marked } from "marked";
import Image from "next/image";
import type { ChatMessage, UserProfile } from "@/lib/types";

interface Props {
  messages: ChatMessage[];
  pending: boolean;
  error: { message: string; retryable: boolean } | null;
  onRetry: () => void;
  profile: UserProfile | null;
  logoSrc: string;
  showWelcome: boolean;
  welcomeName: string;
  onSuggest: (prompt: string) => void;
}

const SUGESTOES_PADRAO: { prompt: string; label: string }[] = [
  { prompt: "O que é a Ordem Masayoshi?", label: "O que é a MSY?" },
  { prompt: "Quais são os valores da Ordem Masayoshi?", label: "Valores da MSY" },
  { prompt: "Como funciona a estrutura da MSY?", label: "Estrutura da MSY" },
];

export function ChatMessages({
  messages,
  pending,
  error,
  onRetry,
  profile,
  logoSrc,
  showWelcome,
  welcomeName,
  onSuggest,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, pending, error]);

  const inicialUsuario = useMemo(() => {
    const nome = profile?.nome_interno || profile?.nome || "U";
    return nome.charAt(0).toUpperCase();
  }, [profile]);

  return (
    <div
      ref={containerRef}
      className="chat-messages"
      role="log"
      aria-live="polite"
      aria-label="Conversa"
    >
      {showWelcome && messages.length === 0 && !pending && (
        <div className="welcome-section">
          <h2 className="welcome-title">{welcomeName}</h2>
          <p className="welcome-subtitle">
            Agente oficial da MSY. Posso te ajudar com informações sobre a Ordem
            Masayoshi, estrutura, valores e muito mais.
          </p>
          <div className="suggestions-grid">
            {SUGESTOES_PADRAO.map((s) => (
              <div
                key={s.prompt}
                className="suggestion-card welcome-card"
                onClick={() => onSuggest(s.prompt)}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 6v6l4 2" />
                </svg>
                <p>{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {messages.map((m, i) => (
        <MessageBubble
          key={`${m.createdAt}-${i}`}
          message={m}
          logoSrc={logoSrc}
          inicialUsuario={inicialUsuario}
        />
      ))}

      {pending && <TypingIndicator logoSrc={logoSrc} />}

      {error && (
        <div className="message corvus" data-error="true">
          <div className="message-content">
            <div className="message-error">
              <strong>Falha no envio.</strong> {error.message}
              {error.retryable && (
                <button
                  type="button"
                  className="retry-btn"
                  onClick={onRetry}
                  style={{
                    marginLeft: 8,
                    padding: "4px 10px",
                    cursor: "pointer",
                  }}
                >
                  Tentar novamente
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MessageBubble({
  message,
  logoSrc,
  inicialUsuario,
}: {
  message: ChatMessage;
  logoSrc: string;
  inicialUsuario: string;
}) {
  const timestamp = useMemo(
    () =>
      new Date(message.createdAt).toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
      }),
    [message.createdAt]
  );

  const isCorvus = message.role === "corvus";
  const html = useMemo(() => {
    if (!isCorvus) return null;
    try {
      return marked.parse(message.text, { async: false }) as string;
    } catch {
      return message.text;
    }
  }, [isCorvus, message.text]);

  return (
    <div className={`message ${message.role}`}>
      <div className="message-avatar" aria-hidden="true">
        {isCorvus ? (
          <Image src={logoSrc} alt="" width={28} height={28} />
        ) : (
          <span>{inicialUsuario}</span>
        )}
      </div>
      <div className="message-content">
        {isCorvus && html ? (
          <div
            className="message-text"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ) : (
          <div className="message-text">{message.text}</div>
        )}
        <span className="message-timestamp">{timestamp}</span>
      </div>
    </div>
  );
}

function TypingIndicator({ logoSrc }: { logoSrc: string }) {
  return (
    <div className="message corvus typing">
      <div className="message-avatar" aria-hidden="true">
        <Image src={logoSrc} alt="" width={28} height={28} />
      </div>
      <div className="message-content">
        <div className="typing-indicator">
          <span />
          <span />
          <span />
        </div>
      </div>
    </div>
  );
}
