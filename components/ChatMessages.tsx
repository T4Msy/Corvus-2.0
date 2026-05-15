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
  Pencil,
  RefreshCcw,
  Sparkles,
  X,
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
import type { MessageSearchMatch } from "@/hooks/useMessageSearch";

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
  onSuggest: (prompt: string) => void;
  onEditMessage?: (createdAt: number, newText: string) => void;
  searchQuery?: string;
  searchMatches?: MessageSearchMatch[];
  activeSearchMatchId?: string | null;
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
  onSuggest,
  onEditMessage,
  searchQuery = "",
  searchMatches = [],
  activeSearchMatchId = null,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const [showScrollBtn, setShowScrollBtn] = useState(false);

  useEffect(() => {
    const c = containerRef.current;
    if (!c) return;
    if (activeSearchMatchId) return;
    const lastMessage = messages[messages.length - 1];
    if (lastMessage?.role === "user" || atBottomRef.current || messages.length <= 1) {
      c.scrollTo({ top: c.scrollHeight, behavior: messages.length > 1 ? "smooth" : "auto" });
      setShowScrollBtn(false);
    }
  }, [messages, pending, error, activeSearchMatchId]);

  useEffect(() => {
    if (!activeSearchMatchId) return;
    const c = containerRef.current;
    if (!c) return;
    const target = c.querySelector(
      `[data-search-match-id="${escapeAttribute(activeSearchMatchId)}"]`
    );
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [activeSearchMatchId]);

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

  const lastUserMessageCreatedAt = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "user") return messages[i].createdAt;
    }
    return null;
  }, [messages]);

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
          className="welcome-panel rebuilt-welcome"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="welcome-copy">
            <h1>
              <span className="welcome-msy-mark" aria-hidden="true">
                <RavenHeadingMark />
              </span>
              <span>{welcomeName}</span>
            </h1>
            <p className="welcome-subtitle">
              Central privada para analisar, decidir e executar com memória contextual,
              precisão institucional e silêncio visual.
            </p>
            <div className="welcome-context" aria-label="Contexto inicial do Corvus">
              <span>
                <strong>Privado</strong>
                <small>sessão protegida</small>
              </span>
              <span>
                <strong>Persistente</strong>
                <small>histórico e contexto</small>
              </span>
              <span>
                <strong>Operacional</strong>
                <small>ações e execução</small>
              </span>
            </div>
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
              messageKey={item.key}
              message={item.message}
              logoSrc={logoSrc}
              userInitial={userInitial}
              onAction={onSuggest}
              searchQuery={searchQuery}
              searchMatches={searchMatches.filter(
                (match) => match.messageKey === item.key
              )}
              activeSearchMatchId={activeSearchMatchId}
              canEdit={
                !pending &&
                item.message.role === "user" &&
                item.message.createdAt === lastUserMessageCreatedAt &&
                !!onEditMessage
              }
              onEditMessage={onEditMessage}
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
  messageKey,
  message,
  logoSrc,
  userInitial,
  onAction,
  canEdit,
  onEditMessage,
  searchQuery,
  searchMatches,
  activeSearchMatchId,
}: {
  messageKey: string;
  message: ChatMessage;
  logoSrc: string;
  userInitial: string;
  onAction: (prompt: string) => void;
  canEdit?: boolean;
  onEditMessage?: (createdAt: number, newText: string) => void;
  searchQuery: string;
  searchMatches: MessageSearchMatch[];
  activeSearchMatchId: string | null;
}) {
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const markdownRef = useRef<HTMLDivElement>(null);
  const editRef = useRef<HTMLTextAreaElement>(null);
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

  useEffect(() => {
    const container = markdownRef.current;
    if (!container) return;
    applyMarkdownSearchHighlights(
      container,
      searchQuery,
      searchMatches,
      activeSearchMatchId
    );
  }, [html, searchQuery, searchMatches, activeSearchMatchId]);

  async function copyMessage() {
    try {
      await navigator.clipboard.writeText(message.text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  }

  function startEdit() {
    setEditValue(message.text);
    setEditing(true);
    requestAnimationFrame(() => {
      if (editRef.current) {
        editRef.current.focus();
        editRef.current.selectionStart = editRef.current.value.length;
      }
    });
  }

  function cancelEdit() {
    setEditing(false);
    setEditValue("");
  }

  function confirmEdit() {
    const text = editValue.trim();
    if (!text || text === message.text) {
      cancelEdit();
      return;
    }
    setEditing(false);
    setEditValue("");
    onEditMessage?.(message.createdAt, text);
  }

  return (
    <motion.article
      className={`message-row thread-message ${isCorvus ? "corvus" : "user"}`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="message-avatar-wrap" aria-hidden="true">
        <div className="message-avatar">
          {isCorvus ? (
            <Image src={logoSrc} alt="" width={20} height={20} />
          ) : (
            <span>{userInitial}</span>
          )}
        </div>
        {isCorvus && <span className="assistant-state-dot" />}
      </div>
      <div className={`message-card${isCorvus ? " assistant-card" : " user-card"}`}>
        <div className="message-meta">
          <span className="message-role">
            <strong>{isCorvus ? "Corvus" : "Você"}</strong>
            <small>{isCorvus ? "Resposta institucional" : "Prompt"}</small>
          </span>
          <time>{timestamp}</time>
        </div>
        {isCorvus ? (
          <div className="assistant-answer">
            <div
              ref={markdownRef}
              className="message-text markdown"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          </div>
        ) : editing ? (
          <div className="message-edit-wrap">
            <textarea
              ref={editRef}
              className="message-edit-textarea"
              value={editValue}
              rows={Math.max(2, editValue.split("\n").length)}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") { e.preventDefault(); cancelEdit(); }
                if (e.key === "Enter" && e.ctrlKey) { e.preventDefault(); confirmEdit(); }
              }}
            />
            <div className="message-edit-actions">
              <button type="button" className="message-edit-confirm" onClick={confirmEdit}>
                <Check size={13} />
                <span>Enviar</span>
              </button>
              <button type="button" className="message-edit-cancel" onClick={cancelEdit}>
                <X size={13} />
                <span>Cancelar</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="message-user-wrap">
            <div className="user-message-surface">
              <p className="message-text">
                <HighlightedText
                  text={message.text}
                  matches={searchMatches}
                  activeSearchMatchId={activeSearchMatchId}
                />
              </p>
            </div>
            {canEdit && (
              <button
                type="button"
                className="message-edit-btn"
                title="Editar mensagem"
                aria-label="Editar mensagem"
                onClick={startEdit}
              >
                <Pencil size={12} />
                <span>Editar</span>
              </button>
            )}
          </div>
        )}
        {isCorvus && (
          <div className="message-tools answer-toolbar">
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

function HighlightedText({
  text,
  matches,
  activeSearchMatchId,
}: {
  text: string;
  matches: MessageSearchMatch[];
  activeSearchMatchId: string | null;
}) {
  if (matches.length === 0) return <>{text}</>;

  const parts: React.ReactNode[] = [];
  let cursor = 0;
  matches.forEach((match) => {
    if (match.start > cursor) {
      parts.push(text.slice(cursor, match.start));
    }
    parts.push(
      <mark
        key={match.id}
        className={
          match.id === activeSearchMatchId
            ? "message-search-hit active"
            : "message-search-hit"
        }
        data-search-match-id={match.id}
      >
        {text.slice(match.start, match.end)}
      </mark>
    );
    cursor = match.end;
  });
  if (cursor < text.length) parts.push(text.slice(cursor));

  return <>{parts}</>;
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
      className="message-row thread-message corvus typing-row"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="message-avatar-wrap" aria-hidden="true">
        <div className="message-avatar">
          <Image src={logoSrc} alt="" width={20} height={20} />
        </div>
        <span className="assistant-state-dot active" />
      </div>
      <div className="message-card assistant-card">
        <div className="message-meta">
          <span className="message-role">
            <strong>Corvus</strong>
            <small>Gerando resposta</small>
          </span>
        </div>
        <div className="typing-card">
          <div className="typing-lines">
            <span />
            <span />
            <span />
          </div>
          <div className="typing-dots">
            <span />
            <span />
            <span />
          </div>
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

function RavenHeadingMark() {
  return (
    <svg viewBox="0 0 96 96" role="img" aria-hidden="true">
      <defs>
        <radialGradient id="raven-bg" cx="50%" cy="47%" r="56%">
          <stop offset="0%" stopColor="#26060d" />
          <stop offset="64%" stopColor="#070405" />
          <stop offset="100%" stopColor="#020203" />
        </radialGradient>
        <linearGradient id="raven-ring" x1="15" y1="10" x2="82" y2="86">
          <stop stopColor="#f4d98c" />
          <stop offset="0.42" stopColor="#e31b3f" />
          <stop offset="1" stopColor="#b8893f" />
        </linearGradient>
        <linearGradient id="raven-beak" x1="58" y1="33" x2="91" y2="46">
          <stop stopColor="#fff0bc" />
          <stop offset="0.42" stopColor="#d7a84d" />
          <stop offset="1" stopColor="#12090a" />
        </linearGradient>
      </defs>

      <circle cx="48" cy="48" r="42" fill="url(#raven-bg)" stroke="url(#raven-ring)" strokeWidth="2.4" />
      <circle cx="48" cy="48" r="34" fill="none" stroke="#e31b3f" strokeWidth="1.4" opacity="0.72" />

      <path
        d="M21 64C29 48 40 37 53 32C63 28 73 29 84 35C74 36 65 38 56 42C43 47 32 54 21 64Z"
        fill="#0b0b0d"
        stroke="#d8b462"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M48 25C57 22 67 25 78 34C68 33 59 35 51 39C40 45 31 55 24 68C34 61 44 58 54 59C49 63 46 67 45 72C54 67 64 66 74 69C68 62 66 56 69 50C75 48 82 43 89 35C76 29 65 26 55 27L50 19L47 28L41 25Z"
        fill="#050506"
        stroke="#f0cc78"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M66 39C72 35 80 34 91 35C82 43 75 48 68 50C63 51 59 50 55 48C58 44 61 41 66 39Z"
        fill="#050506"
        stroke="url(#raven-beak)"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <path
        d="M71 40C75 39 79 39 85 40C80 43 76 44 73 44C70 43 68 43 67 42C68 41 69 40 71 40Z"
        fill="#fff0bc"
      />
      <circle cx="58" cy="38" r="6.4" fill="#e31b3f" />
      <circle cx="58" cy="38" r="3" fill="#ff4464" />
      <circle cx="60" cy="36" r="1.1" fill="#ffe1e6" />

      <path d="M24 59C34 55 45 54 56 56" stroke="#c99b4a" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M31 50C41 47 51 47 60 50" stroke="#e31b3f" strokeWidth="1.45" strokeLinecap="round" opacity="0.9" />
      <path d="M39 40C47 39 55 40 62 44" stroke="#d8b462" strokeWidth="1.25" strokeLinecap="round" />
      <path d="M37 68C44 63 52 61 60 61" stroke="#d8b462" strokeWidth="1.25" strokeLinecap="round" opacity="0.78" />
    </svg>
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

function applyMarkdownSearchHighlights(
  container: HTMLElement,
  query: string,
  matches: MessageSearchMatch[],
  activeSearchMatchId: string | null
) {
  container.querySelectorAll("mark.message-search-hit").forEach((mark) => {
    mark.replaceWith(document.createTextNode(mark.textContent ?? ""));
  });
  container.normalize();

  const term = query.trim().toLowerCase();
  if (!term || matches.length === 0) return;

  let matchIndex = 0;
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent || !node.textContent?.toLowerCase().includes(term)) {
        return NodeFilter.FILTER_REJECT;
      }
      if (parent.closest("pre, code, button, .code-lang")) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const textNodes: Text[] = [];
  while (walker.nextNode()) {
    textNodes.push(walker.currentNode as Text);
  }

  for (const node of textNodes) {
    const original = node.textContent ?? "";
    const lower = original.toLowerCase();
    const fragment = document.createDocumentFragment();
    let cursor = 0;
    let index = lower.indexOf(term);

    while (index !== -1) {
      if (index > cursor) {
        fragment.append(document.createTextNode(original.slice(cursor, index)));
      }

      const match = matches[matchIndex];
      const mark = document.createElement("mark");
      mark.className =
        match?.id === activeSearchMatchId
          ? "message-search-hit active"
          : "message-search-hit";
      if (match) mark.dataset.searchMatchId = match.id;
      mark.textContent = original.slice(index, index + term.length);
      fragment.append(mark);

      matchIndex += 1;
      cursor = index + term.length;
      index = lower.indexOf(term, cursor);
    }

    if (cursor < original.length) {
      fragment.append(document.createTextNode(original.slice(cursor)));
    }
    node.replaceWith(fragment);
  }
}

function escapeAttribute(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
