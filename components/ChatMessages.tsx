"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowDown,
  ArrowRight,
  AlertTriangle,
  Check,
  Copy,
  ListTodo,
  RefreshCcw,
  Sparkles,
} from "lucide-react";
import { marked } from "marked";
import hljs from "highlight.js/lib/core";
import hljsBash from "highlight.js/lib/languages/bash";
import hljsCss from "highlight.js/lib/languages/css";
import hljsGo from "highlight.js/lib/languages/go";
import hljsJs from "highlight.js/lib/languages/javascript";
import hljsJson from "highlight.js/lib/languages/json";
import hljsMarkdown from "highlight.js/lib/languages/markdown";
import hljsPython from "highlight.js/lib/languages/python";
import hljsRust from "highlight.js/lib/languages/rust";
import hljsSql from "highlight.js/lib/languages/sql";
import hljsTs from "highlight.js/lib/languages/typescript";
import hljsXml from "highlight.js/lib/languages/xml";
import hljsYaml from "highlight.js/lib/languages/yaml";
import type { ChatMessage, UserProfile } from "@/lib/types";

hljs.registerLanguage("bash", hljsBash);
hljs.registerLanguage("sh", hljsBash);
hljs.registerLanguage("css", hljsCss);
hljs.registerLanguage("go", hljsGo);
hljs.registerLanguage("javascript", hljsJs);
hljs.registerLanguage("js", hljsJs);
hljs.registerLanguage("jsx", hljsJs);
hljs.registerLanguage("json", hljsJson);
hljs.registerLanguage("markdown", hljsMarkdown);
hljs.registerLanguage("python", hljsPython);
hljs.registerLanguage("py", hljsPython);
hljs.registerLanguage("rust", hljsRust);
hljs.registerLanguage("sql", hljsSql);
hljs.registerLanguage("typescript", hljsTs);
hljs.registerLanguage("ts", hljsTs);
hljs.registerLanguage("tsx", hljsTs);
hljs.registerLanguage("html", hljsXml);
hljs.registerLanguage("xml", hljsXml);
hljs.registerLanguage("yaml", hljsYaml);
hljs.registerLanguage("yml", hljsYaml);

const COPY_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`;

marked.use({
  renderer: {
    code({ text, lang }: { text: string; lang?: string }) {
      const language = lang && hljs.getLanguage(lang) ? lang : undefined;
      const highlighted = language
        ? hljs.highlight(text, { language }).value
        : hljs.highlightAuto(text).value;
      return `<div class="code-block">${language ? `<span class="code-lang">${language}</span>` : ""}<button type="button" class="code-copy-btn" data-copy-code aria-label="Copiar código">${COPY_ICON}</button><pre><code class="hljs">${highlighted}</code></pre></div>`;
    },
  },
});

interface Props {
  messages: ChatMessage[];
  pending: boolean;
  historyLoading?: boolean;
  error: { message: string; retryable: boolean } | null;
  onRetry: () => void;
  profile: UserProfile | null;
  logoSrc: string;
  showWelcome: boolean;
  welcomeName: string;
  welcomeSubtitle?: string;
  onSuggest: (prompt: string) => void;
}

const SUGGESTION_POOL = [
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
  {
    label: "Resumo executivo",
    prompt:
      "Elabore um resumo executivo do contexto atual da MSY — estado, prioridades e riscos.",
  },
  {
    label: "Brainstorming",
    prompt:
      "Gere 8 ideias estratégicas para expandir a atuação institucional da MSY no próximo trimestre.",
  },
  {
    label: "Análise de risco",
    prompt:
      "Mapeie os principais riscos operacionais e estratégicos e sugira mitigações objetivas.",
  },
  {
    label: "Estrutura de reunião",
    prompt:
      "Monte uma pauta estruturada para uma reunião de alinhamento estratégico — objetivos, tópicos e encaminhamentos.",
  },
  {
    label: "Diagnóstico de processo",
    prompt:
      "Analise um processo interno e identifique gargalos, redundâncias e oportunidades de melhoria.",
  },
  {
    label: "Comunicado interno",
    prompt:
      "Redija um comunicado interno claro e objetivo sobre uma mudança ou decisão recente.",
  },
];

function pickSuggestions(pool: typeof SUGGESTION_POOL, count: number) {
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

export function ChatMessages({
  messages,
  pending,
  historyLoading = false,
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
  const atBottomRef = useRef(true);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const suggestions = useMemo(() => pickSuggestions(SUGGESTION_POOL, 4), []);

  useEffect(() => {
    const c = containerRef.current;
    if (!c) return;
    const lastMessage = messages[messages.length - 1];
    if (lastMessage?.role === "user" || atBottomRef.current || messages.length <= 1) {
      c.scrollTo({ top: c.scrollHeight, behavior: messages.length > 1 ? "smooth" : "auto" });
      setShowScrollBtn(false);
    }
  }, [messages, pending, error]);

  function handleScroll() {
    const c = containerRef.current;
    if (!c) return;
    const isAtBottom = c.scrollHeight - c.scrollTop - c.clientHeight < 100;
    atBottomRef.current = isAtBottom;
    setShowScrollBtn(!isAtBottom);
  }

  function scrollToBottom() {
    const c = containerRef.current;
    if (!c) return;
    c.scrollTo({ top: c.scrollHeight, behavior: "smooth" });
    atBottomRef.current = true;
    setShowScrollBtn(false);
  }

  const userInitial = useMemo(() => {
    const name = profile?.nome_interno || profile?.nome || "U";
    return name.charAt(0).toUpperCase();
  }, [profile]);

  const messageItems = useMemo(() => {
    return messages.flatMap((message, index) => {
      const prev = messages[index - 1];
      const showSep =
        !prev ||
        !isSameDay(new Date(message.createdAt), new Date(prev.createdAt));
      const key = message.id ?? `${message.createdAt}-${index}`;
      const items: Array<
        | { type: "date"; key: string; timestamp: number }
        | { type: "message"; key: string; message: ChatMessage }
      > = [];
      if (showSep) {
        items.push({ type: "date", key: `date-${key}`, timestamp: message.createdAt });
      }
      items.push({ type: "message", key, message });
      return items;
    });
  }, [messages]);

  const empty = showWelcome && messages.length === 0 && !pending && !historyLoading;

  return (
    <div
      ref={containerRef}
      className="message-stream"
      role="log"
      aria-live="polite"
      aria-label="Conversa"
      onScroll={handleScroll}
    >
      {historyLoading && <MessagesSkeleton />}

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
            {suggestions.map((s) => (
              <button
                key={s.label}
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
        {messageItems.map((item) =>
          item.type === "date" ? (
            <DateSeparator key={item.key} timestamp={item.timestamp} />
          ) : (
            <MessageBubble
              key={item.key}
              message={item.message}
              logoSrc={logoSrc}
              userInitial={userInitial}
              onAction={onSuggest}
            />
          )
        )}
      </AnimatePresence>

      {pending && <TypingIndicator logoSrc={logoSrc} />}

      {showScrollBtn && (
        <div className="scroll-to-bottom-wrap">
          <button
            type="button"
            className="scroll-to-bottom"
            aria-label="Ir ao fim da conversa"
            onClick={scrollToBottom}
          >
            <ArrowDown size={13} />
            <span>Ir ao fim</span>
          </button>
        </div>
      )}

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
  const markdownRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    const container = markdownRef.current;
    if (!container) return;
    function handleCodeCopy(e: MouseEvent) {
      const btn = (e.target as HTMLElement).closest("[data-copy-code]") as HTMLElement | null;
      if (!btn) return;
      const code = btn.closest(".code-block")?.querySelector("code")?.textContent ?? "";
      navigator.clipboard.writeText(code).then(() => {
        btn.classList.add("copied");
        setTimeout(() => btn.classList.remove("copied"), 1400);
      }).catch(() => {});
    }
    container.addEventListener("click", handleCodeCopy);
    return () => container.removeEventListener("click", handleCodeCopy);
  }, [html]);

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
            ref={markdownRef}
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

const SKELETON_ROWS = [
  { role: "corvus", lines: [80, 60, 90] },
  { role: "user", lines: [55] },
  { role: "corvus", lines: [70, 50] },
  { role: "user", lines: [45] },
] as const;

function MessagesSkeleton() {
  return (
    <motion.div
      className="messages-skeleton"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      {SKELETON_ROWS.map((row, i) => (
        <div key={i} className={`skeleton-row ${row.role}`}>
          <div className="skeleton skeleton-avatar" />
          <div className="skeleton-bubble">
            {row.lines.map((width, j) => (
              <div key={j} className="skeleton skeleton-line" style={{ width: `${width}%` }} />
            ))}
          </div>
        </div>
      ))}
    </motion.div>
  );
}

function DateSeparator({ timestamp }: { timestamp: number }) {
  const label = useMemo(() => getDateLabel(timestamp), [timestamp]);
  return (
    <motion.div
      className="message-date-separator"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.22 }}
    >
      <span>{label}</span>
    </motion.div>
  );
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function getDateLabel(timestamp: number): string {
  const date = new Date(timestamp);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (isSameDay(date, today)) return "Hoje";
  if (isSameDay(date, yesterday)) return "Ontem";
  return date.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
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
