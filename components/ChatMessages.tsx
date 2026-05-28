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
  ExternalLink,
  FileText,
  Image as ImageIcon,
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

type PendingContext = "default" | "comparison" | "image" | "document" | "mixed";

const PROGRESS_STEPS: Record<PendingContext, string[]> = {
  default: [
    "Analisando o pedido",
    "Definindo a melhor estrutura",
    "Organizando os pontos principais",
    "Montando a resposta",
    "Finalizando a resposta",
  ],
  comparison: [
    "Analisando o comparativo",
    "Separando os criterios",
    "Montando a tabela",
    "Ordenando do maior para o menor",
    "Finalizando a conclusao",
  ],
  image: [
    "Analisando a imagem",
    "Extraindo os sinais principais",
    "Conectando imagem e pedido",
    "Montando a resposta",
    "Finalizando a resposta",
  ],
  document: [
    "Lendo o documento",
    "Separando os pontos relevantes",
    "Organizando os criterios",
    "Montando a resposta",
    "Finalizando a resposta",
  ],
  mixed: [
    "Consolidando os materiais",
    "Cruzando anexos e pedido",
    "Escolhendo a melhor estrutura",
    "Montando a resposta",
    "Finalizando a resposta",
  ],
};

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

  const pendingContext = useMemo(() => getPendingContext(messages), [messages]);
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
              <RavenHeadingMark />
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

      {pending && <TypingIndicator logoSrc={logoSrc} context={pendingContext} />}

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
              {message.attachments && message.attachments.length > 0 && (
                <MessageAttachments attachments={message.attachments} />
              )}
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

function MessageAttachments({
  attachments,
}: {
  attachments: NonNullable<ChatMessage["attachments"]>;
}) {
  return (
    <div className="message-attachment-grid" aria-label="Anexos da mensagem">
      {attachments.map((attachment) => {
        const isImage = attachment.type.startsWith("image/");
        return (
          <div
            className={`message-attachment-card${isImage ? " image" : ""}`}
            key={attachment.id}
          >
            {isImage && attachment.url ? (
              <img
                src={attachment.url}
                alt={attachment.name}
                className="message-attachment-image"
                loading="lazy"
              />
            ) : (
              <span className="message-attachment-file-icon" aria-hidden="true">
                {isImage ? <ImageIcon size={18} /> : <FileText size={18} />}
              </span>
            )}
            <span className="message-attachment-info">
              <strong>{attachment.name}</strong>
              <small>
                {attachment.type.startsWith("image/") ? "Imagem" : "Arquivo"} ·{" "}
                {formatFileSize(attachment.size)}
              </small>
            </span>
            {attachment.url && (
              <a
                href={attachment.url}
                target="_blank"
                rel="noreferrer"
                aria-label="Abrir anexo"
                title="Abrir anexo"
              >
                <ExternalLink size={14} />
              </a>
            )}
          </div>
        );
      })}
    </div>
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

function TypingIndicator({
  logoSrc,
  context,
}: {
  logoSrc: string;
  context: PendingContext;
}) {
  const steps = PROGRESS_STEPS[context];
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    setStepIndex(0);
    const timer = window.setInterval(() => {
      setStepIndex((current) => Math.min(current + 1, steps.length - 1));
    }, 1850);
    return () => window.clearInterval(timer);
  }, [context, steps]);

  const currentStep = steps[stepIndex];

  return (
    <motion.div
      className="message-row thread-message corvus typing-row"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="message-avatar-wrap" aria-hidden="true">
        <div className="message-avatar thinking-avatar">
          <Image src={logoSrc} alt="" width={20} height={20} />
        </div>
        <span className="assistant-state-dot active" />
      </div>
      <div className="message-card assistant-card">
        <div className="message-meta">
          <span className="message-role">
            <strong>Corvus</strong>
            <small>Estruturando resposta</small>
          </span>
        </div>
        <div className="typing-card thinking-card" aria-label={currentStep}>
          <div className="thinking-orbit" aria-hidden="true">
            <span />
            <span />
          </div>
          <div className="thinking-copy">
            <AnimatePresence mode="wait">
              <motion.strong
                key={currentStep}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                transition={{ duration: 0.22 }}
              >
                {currentStep}
              </motion.strong>
            </AnimatePresence>
            <div className="thinking-progress" aria-hidden="true">
              {steps.map((step, index) => (
                <span
                  key={step}
                  className={index === stepIndex ? "active" : undefined}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function getPendingContext(messages: ChatMessage[]): PendingContext {
  const lastUserMessage = [...messages].reverse().find((message) => message.role === "user");
  const attachments = lastUserMessage?.attachments ?? [];
  const hasImages = attachments.some((attachment) => attachment.type.startsWith("image/"));
  const hasDocuments = attachments.some((attachment) => !attachment.type.startsWith("image/"));
  if (hasImages && hasDocuments) return "mixed";
  if (hasImages) return "image";
  if (hasDocuments) return "document";
  if (isComparisonPrompt(lastUserMessage?.text ?? "")) return "comparison";
  return "default";
}

function isComparisonPrompt(text: string): boolean {
  return /\b(compar\w*|tabela|ranking|rankear|maior|menor|melhor|piores?|melhores?|hierarqu\w*|ordem|cargos?|funcoes?|diferencas?|vs\.?|versus)\b/i.test(
    text.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
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
  const [showMotto, setShowMotto] = useState(false);

  return (
    <button
      type="button"
      className={`welcome-msy-mark${showMotto ? " motto-visible" : ""}`}
      aria-label="Revelar lema do Corvus"
      aria-pressed={showMotto}
      onClick={() => setShowMotto((current) => !current)}
    >
      <img
        className="corvao-emblem-image"
        src="/corvao-emblem.png"
        alt=""
        draggable={false}
        decoding="async"
      />
      <span className="raven-motto" aria-hidden={!showMotto}>
        Rise of renascense
      </span>
    </button>
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

  document.body.querySelectorAll("table").forEach((table) => {
    const wrapper = document.createElement("div");
    wrapper.className = "markdown-table-wrap";
    table.parentNode?.insertBefore(wrapper, table);
    wrapper.appendChild(table);
  });

  document.body.querySelectorAll("p, blockquote").forEach((element) => {
    const label =
      element.textContent
        ?.trim()
        .split(":")[0]
        ?.toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") ?? "";
    if (["resumo", "criterios", "conclusao", "recomendacao"].includes(label)) {
      element.classList.add("markdown-highlight-block");
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
