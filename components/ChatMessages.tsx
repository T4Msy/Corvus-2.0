"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  AlertTriangle,
  Check,
  Copy,
  ListTodo,
  RefreshCcw,
  Sparkles,
} from "lucide-react";
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
  welcomeSubtitle?: string;
  onSuggest: (prompt: string) => void;
}

const SUGGESTIONS = [
  {
    label: "Síntese institucional",
    prompt:
      "Sintetize a estrutura da Ordem Masayoshi em blocos objetivos, com riscos e próximos passos.",
  },
  {
    label: "Plano de ação",
    prompt:
      "Monte um plano de ação para a operação atual da MSY com prioridades e sequência.",
  },
  {
    label: "Análise de decisão",
    prompt:
      "Ajude a analisar uma decisão importante usando critérios, tradeoffs e recomendação.",
  },
  {
    label: "Revisão de texto",
    prompt:
      "Revise o texto a seguir para ficar mais claro, institucional e objetivo.",
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
  welcomeSubtitle,
  onSuggest,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const c = containerRef.current;
    if (!c) return;
    c.scrollTo({ top: c.scrollHeight, behavior: messages.length > 1 ? "smooth" : "auto" });
  }, [messages, pending, error]);

  const userInitial = useMemo(() => {
    const name = profile?.nome_interno || profile?.nome || "U";
    return name.charAt(0).toUpperCase();
  }, [profile]);

  const empty = showWelcome && messages.length === 0 && !pending;

  return (
    <div
      ref={containerRef}
      className="message-stream"
      role="log"
      aria-live="polite"
      aria-label="Conversa"
    >
      {empty && (
        <motion.section
          className="welcome-panel"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="welcome-mark">
            <Image src={logoSrc} alt="" width={36} height={36} priority />
          </div>
          <p className="eyebrow">MSY · Corvus</p>
          <h1>{welcomeName}</h1>
          {welcomeSubtitle && (
            <p className="welcome-subtitle">{welcomeSubtitle}</p>
          )}
          <div className="welcome-context" aria-label="Memória da sessão">
            <span>{profile?.cargo || "Sessão institucional"}</span>
            <span>{profile?.sigla_cargo || profile?.tipo || "MSY"}</span>
            <span>Contexto ativo</span>
          </div>
          <div className="suggestion-row">
            {SUGGESTIONS.map((s) => (
              <button
                key={s.prompt}
                type="button"
                className="suggestion-pill"
                onClick={() => onSuggest(s.prompt)}
              >
                <Sparkles size={13} />
                <span>{s.label}</span>
              </button>
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
            userInitial={userInitial}
            onAction={onSuggest}
          />
        ))}
      </AnimatePresence>

      {pending && <TypingIndicator logoSrc={logoSrc} />}

      <AnimatePresence>
        {error && (
          <motion.div
            className="error-state"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            role="alert"
          >
            <AlertTriangle size={16} />
            <span>{error.message}</span>
            {error.retryable && (
              <button type="button" onClick={onRetry}>
                <RefreshCcw size={13} />
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
  onAction,
}: {
  message: ChatMessage;
  logoSrc: string;
  userInitial: string;
  onAction: (prompt: string) => void;
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
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="message-avatar" aria-hidden="true">
        {isCorvus ? (
          <Image src={logoSrc} alt="" width={20} height={20} />
        ) : (
          <span>{userInitial}</span>
        )}
      </div>
      <div className="message-card">
        <div className="message-meta">
          <span>{isCorvus ? "Corvus" : "Você"}</span>
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
        {isCorvus && (
          <div className="message-tools">
            <button
              type="button"
              className="copy-button"
              title={copied ? "Copiado" : "Copiar"}
              aria-label="Copiar resposta"
              onClick={copyMessage}
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
            </button>
            <MessageAction
              icon={<RefreshCcw size={13} />}
              label="Regenerar"
              prompt="Refaça a resposta anterior com mais precisão, clareza e objetividade."
              onAction={onAction}
            />
            <MessageAction
              icon={<ArrowRight size={13} />}
              label="Continuar"
              prompt="Continue a resposta anterior mantendo o mesmo contexto e nível de detalhe."
              onAction={onAction}
            />
            <MessageAction
              icon={<Sparkles size={13} />}
              label="Resumir"
              prompt="Resuma a resposta anterior em pontos executivos, preservando decisões e riscos."
              onAction={onAction}
            />
            <MessageAction
              icon={<ListTodo size={13} />}
              label="Tarefas"
              prompt="Transforme a resposta anterior em uma lista de tarefas acionáveis."
              onAction={onAction}
            />
          </div>
        )}
      </div>
    </motion.article>
  );
}

function MessageAction({
  icon,
  label,
  prompt,
  onAction,
}: {
  icon: React.ReactNode;
  label: string;
  prompt: string;
  onAction: (prompt: string) => void;
}) {
  return (
    <button
      type="button"
      className="message-action-button"
      title={label}
      aria-label={label}
      onClick={() => onAction(prompt)}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function TypingIndicator({ logoSrc }: { logoSrc: string }) {
  return (
    <motion.div
      className="message-row corvus"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="message-avatar" aria-hidden="true">
        <Image src={logoSrc} alt="" width={20} height={20} />
      </div>
      <div className="message-card">
        <div className="typing-label">Corvus processando</div>
        <div className="typing-card">
          <span />
          <span />
          <span />
        </div>
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
    if (element.tagName === "A") {
      element.setAttribute("target", "_blank");
      element.setAttribute("rel", "noopener noreferrer");
    }
  });

  return document.body.innerHTML;
}
