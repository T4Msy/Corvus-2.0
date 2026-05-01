"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Check, Copy, RefreshCcw, Shield, Sparkles } from "lucide-react";
import { marked } from "marked";
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

const SUGGESTIONS = [
  {
    label: "Estrutura MSY",
    prompt: "Sintetize a estrutura da Ordem Masayoshi em blocos objetivos.",
  },
  {
    label: "Prioridades",
    prompt: "Quais prioridades devo observar na operacao atual da MSY?",
  },
  {
    label: "Agentes",
    prompt: "Explique como organizar agentes de IA para a MSY/Britannia.",
  },
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
    const container = containerRef.current;
    if (!container) return;
    container.scrollTo({
      top: container.scrollHeight,
      behavior: messages.length > 1 ? "smooth" : "auto",
    });
  }, [messages, pending, error]);

  const initial = useMemo(() => {
    const name = profile?.nome_interno || profile?.nome || "U";
    return name.charAt(0).toUpperCase();
  }, [profile]);

  return (
    <div
      ref={containerRef}
      className="message-stream"
      role="log"
      aria-live="polite"
      aria-label="Conversa"
    >
      {showWelcome && messages.length === 0 && !pending && (
        <motion.section
          className="welcome-panel"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.44, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="welcome-mark">
            <Image src={logoSrc} alt="" width={54} height={54} priority />
          </div>
          <p className="eyebrow">MSY / Britannia</p>
          <h1>{welcomeName}</h1>
          <div className="suggestion-row">
            {SUGGESTIONS.map((suggestion) => (
              <motion.button
                key={suggestion.prompt}
                type="button"
                className="suggestion-pill"
                onClick={() => onSuggest(suggestion.prompt)}
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.98 }}
              >
                <Sparkles size={15} />
                <span>{suggestion.label}</span>
              </motion.button>
            ))}
          </div>
        </motion.section>
      )}

      <AnimatePresence initial={false}>
        {messages.map((message, index) => (
          <MessageBubble
            key={message.id ?? `${message.createdAt}-${index}`}
            message={message}
            logoSrc={logoSrc}
            userInitial={initial}
          />
        ))}
      </AnimatePresence>

      {pending && <TypingIndicator logoSrc={logoSrc} />}

      <AnimatePresence>
        {error && (
          <motion.div
            className="error-state"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
          >
            <AlertTriangle size={18} />
            <span>{error.message}</span>
            {error.retryable && (
              <button type="button" onClick={onRetry}>
                <RefreshCcw size={15} />
                <span>Repetir</span>
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function MessageBubble({
  message,
  logoSrc,
  userInitial,
}: {
  message: ChatMessage;
  logoSrc: string;
  userInitial: string;
}) {
  const [copied, setCopied] = useState(false);
  const isCorvus = message.role === "corvus";
  const timestamp = useMemo(
    () =>
      new Date(message.createdAt).toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
      }),
    [message.createdAt]
  );

  const html = useMemo(() => {
    if (!isCorvus) return "";
    return renderSafeMarkdown(message.text);
  }, [isCorvus, message.text]);

  async function copyMessage() {
    try {
      await navigator.clipboard.writeText(message.text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  }

  return (
    <motion.article
      className={`message-row ${isCorvus ? "corvus" : "user"}`}
      initial={{ opacity: 0, y: 16, filter: "blur(8px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="message-avatar" aria-hidden="true">
        {isCorvus ? (
          <Image src={logoSrc} alt="" width={30} height={30} />
        ) : (
          <span>{userInitial}</span>
        )}
      </div>
      <div className="message-card">
        <div className="message-meta">
          <span>{isCorvus ? "Corvus" : "Voce"}</span>
          <time>{timestamp}</time>
        </div>
        {isCorvus ? (
          <div
            className="message-text markdown"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ) : (
          <p className="message-text">{message.text}</p>
        )}
        <div className="message-tools">
          {isCorvus && (
            <span className="trust-chip">
              <Shield size={13} />
              MSY
            </span>
          )}
          <button
            type="button"
            className="copy-button"
            title="Copiar"
            aria-label="Copiar"
            onClick={copyMessage}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
        </div>
      </div>
    </motion.article>
  );
}

function TypingIndicator({ logoSrc }: { logoSrc: string }) {
  return (
    <motion.div
      className="message-row corvus"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="message-avatar" aria-hidden="true">
        <Image src={logoSrc} alt="" width={30} height={30} />
      </div>
      <div className="typing-card">
        <span />
        <span />
        <span />
      </div>
    </motion.div>
  );
}

function renderSafeMarkdown(text: string): string {
  const raw = marked.parse(text, { async: false }) as string;
  if (typeof window === "undefined") return raw;

  const document = new DOMParser().parseFromString(raw, "text/html");
  document
    .querySelectorAll("script,style,iframe,object,embed,link,meta")
    .forEach((node) => node.remove());

  document.body.querySelectorAll("*").forEach((element) => {
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim().toLowerCase();
      if (name.startsWith("on") || name === "srcdoc") {
        element.removeAttribute(attribute.name);
      }
      if ((name === "href" || name === "src") && value.startsWith("javascript:")) {
        element.removeAttribute(attribute.name);
      }
    }
  });

  return document.body.innerHTML;
}
