"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Archive,
  Bot,
  Check,
  Compass,
  Focus,
  MessageSquare,
  Pin,
  Plus,
  Search,
  Settings,
  Sparkles,
  Star,
  Tag,
  Zap,
} from "lucide-react";
import type { AgentMode, Conversation } from "@/lib/types";

type HistoryFilter = "all" | "pinned" | "favorite" | "tagged" | "archived";

interface Props {
  open: boolean;
  conversations: Conversation[];
  activeConversationId: string | null;
  focusMode: boolean;
  historyFilter: HistoryFilter;
  onClose: () => void;
  onCreateConversation: () => void;
  onSelectConversation: (conversationId: string) => void;
  onSetMode: (mode: AgentMode) => void;
  onOpenSettings: () => void;
  onToggleFocus: () => void;
  onQuickPrompt: (prompt: string) => void;
  onSetHistoryFilter: (filter: HistoryFilter) => void;
  onSearchTag: (tag: string) => void;
  onUpdateActiveConversation: (
    patch: Partial<
      Pick<Conversation, "pinned" | "favorite" | "archived">
    >
  ) => void;
}

const QUICK_PROMPTS = [
  {
    label: "Síntese institucional",
    prompt:
      "Faça uma síntese institucional objetiva, com contexto, pontos críticos e próximos passos.",
  },
  {
    label: "Plano de ação",
    prompt:
      "Transforme o contexto desta conversa em um plano de ação com prioridades, responsáveis sugeridos e riscos.",
  },
  {
    label: "Análise de decisão",
    prompt:
      "Analise esta decisão em critérios, tradeoffs, riscos e recomendação final.",
  },
  {
    label: "Revisão de texto",
    prompt:
      "Revise o texto a seguir para ficar mais claro, institucional e direto.",
  },
];

const HISTORY_FILTERS: Array<{
  value: HistoryFilter;
  label: string;
  description: string;
  icon: React.ReactNode;
}> = [
  {
    value: "all",
    label: "Todas",
    description: "Conversas ativas não arquivadas",
    icon: <MessageSquare size={15} />,
  },
  {
    value: "pinned",
    label: "Fixadas",
    description: "Apenas conversas fixadas",
    icon: <Pin size={15} />,
  },
  {
    value: "favorite",
    label: "Favoritas",
    description: "Apenas conversas favoritas",
    icon: <Star size={15} />,
  },
  {
    value: "tagged",
    label: "Com tags",
    description: "Conversas com etiquetas manuais",
    icon: <Tag size={15} />,
  },
  {
    value: "archived",
    label: "Arquivadas",
    description: "Conversas fora dos recentes",
    icon: <Archive size={15} />,
  },
];

export function CommandPalette({
  open,
  conversations,
  activeConversationId,
  focusMode,
  historyFilter,
  onClose,
  onCreateConversation,
  onSelectConversation,
  onSetMode,
  onOpenSettings,
  onToggleFocus,
  onQuickPrompt,
  onSetHistoryFilter,
  onSearchTag,
  onUpdateActiveConversation,
}: Props) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  function getCommandItems() {
    if (!panelRef.current) return [] as HTMLButtonElement[];
    return Array.from(
      panelRef.current.querySelectorAll<HTMLButtonElement>("button.command-item")
    );
  }

  useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }

    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    const id = window.setTimeout(() => inputRef.current?.focus(), 40);

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      const commandItems = getCommandItems();
      const active = document.activeElement as HTMLElement | null;

      if (event.key === "ArrowDown") {
        if (commandItems.length === 0) return;
        event.preventDefault();
        if (active === inputRef.current) {
          commandItems[0]?.focus();
          return;
        }
        const currentIndex = commandItems.findIndex((item) => item === active);
        const nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % commandItems.length;
        commandItems[nextIndex]?.focus();
        return;
      }

      if (event.key === "ArrowUp") {
        if (commandItems.length === 0) return;
        event.preventDefault();
        if (active === inputRef.current) {
          commandItems[commandItems.length - 1]?.focus();
          return;
        }
        const currentIndex = commandItems.findIndex((item) => item === active);
        const nextIndex = currentIndex <= 0 ? commandItems.length - 1 : currentIndex - 1;
        commandItems[nextIndex]?.focus();
        return;
      }

      if (event.key === "Enter" && active === inputRef.current) {
        const firstItem = commandItems[0];
        if (firstItem) {
          event.preventDefault();
          firstItem.click();
        }
        return;
      }

      if (event.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("keydown", onKey);
      restoreFocusRef.current?.focus();
    };
  }, [open, onClose]);

  const filteredConversations = useMemo(() => {
    const term = query.trim().toLowerCase();
    const source = conversations.filter((item) =>
      historyFilter === "archived" ? item.archived : !item.archived
    );
    if (!term) return source.slice(0, 6);
    return source
      .filter((item) => {
        const text = [
          item.title,
          item.summary,
          ...(item.tags ?? []),
        ]
          .join(" ")
          .toLowerCase();
        return text.includes(term);
      })
      .slice(0, 8);
  }, [conversations, historyFilter, query]);

  const activeConversation = useMemo(
    () =>
      conversations.find((item) => item.id === activeConversationId) ?? null,
    [activeConversationId, conversations]
  );

  const tags = useMemo(
    () =>
      Array.from(
        new Set(
          conversations
            .flatMap((conversation) => conversation.tags ?? [])
            .filter(Boolean)
        )
      )
        .sort((a, b) => a.localeCompare(b, "pt-BR"))
        .slice(0, 12),
    [conversations]
  );

  function run(action: () => void) {
    action();
    onClose();
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="command-backdrop"
          role="presentation"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.14 }}
          onClick={onClose}
        >
          <motion.div
            ref={panelRef}
            className="command-panel rebuilt-command-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Paleta de comandos"
            initial={{ opacity: 0, y: 14, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="command-panel-head">
              <span>Command center</span>
              <strong>Executar no Corvus</strong>
            </div>

            <label className="command-search" htmlFor="command-search-input">
              <Search size={17} />
              <input
                ref={inputRef}
                id="command-search-input"
                type="search"
                value={query}
                placeholder="Buscar conversa ou comando"
                onChange={(event) => setQuery(event.target.value)}
              />
              <kbd>Esc</kbd>
            </label>

            <div className="command-list">
              <section>
                <p>Ações</p>
                <CommandItem
                  icon={<Plus size={15} />}
                  label="Nova conversa"
                  description="Abrir um novo contexto limpo"
                  onClick={() => run(onCreateConversation)}
                />
                <CommandItem
                  icon={<Focus size={15} />}
                  label={focusMode ? "Sair do modo foco" : "Modo foco"}
                  description="Alternar leitura sem sidebar"
                  onClick={() => run(onToggleFocus)}
                />
                <CommandItem
                  icon={<Bot size={15} />}
                  label="Usar Corvus"
                  description="Modo institucional preciso"
                  onClick={() => run(() => onSetMode("corvus"))}
                />
                <CommandItem
                  icon={<Zap size={15} />}
                  label="Usar Fenrir"
                  description="Modo criativo expansivo"
                  onClick={() => run(() => onSetMode("fenrir"))}
                />
                <CommandItem
                  icon={<Settings size={15} />}
                  label="Configurações"
                  description="Perfil, tema e sessão"
                  onClick={() => run(onOpenSettings)}
                />
              </section>

              <section>
                <p>Histórico</p>
                {HISTORY_FILTERS.map((filter) => (
                  <CommandItem
                    key={filter.value}
                    icon={filter.icon}
                    label={`Filtro: ${filter.label}`}
                    description={filter.description}
                    trailing={
                      historyFilter === filter.value ? <Check size={14} /> : null
                    }
                    onClick={() =>
                      run(() => onSetHistoryFilter(filter.value))
                    }
                  />
                ))}
                {activeConversation && (
                  <>
                    <CommandItem
                      icon={<Pin size={15} />}
                      label={
                        activeConversation.pinned
                          ? "Desafixar conversa ativa"
                          : "Fixar conversa ativa"
                      }
                      description="Atualizar destaque no histórico"
                      onClick={() =>
                        run(() =>
                          onUpdateActiveConversation({
                            pinned: !activeConversation.pinned,
                          })
                        )
                      }
                    />
                    <CommandItem
                      icon={<Star size={15} />}
                      label={
                        activeConversation.favorite
                          ? "Remover favorito da ativa"
                          : "Favoritar conversa ativa"
                      }
                      description="Atualizar retenção da conversa"
                      onClick={() =>
                        run(() =>
                          onUpdateActiveConversation({
                            favorite: !activeConversation.favorite,
                          })
                        )
                      }
                    />
                    <CommandItem
                      icon={<Archive size={15} />}
                      label={
                        activeConversation.archived
                          ? "Restaurar conversa ativa"
                          : "Arquivar conversa ativa"
                      }
                      description="Mover conversa para fora de recentes"
                      onClick={() =>
                        run(() =>
                          onUpdateActiveConversation({
                            archived: !activeConversation.archived,
                          })
                        )
                      }
                    />
                  </>
                )}
              </section>

              <section>
                <p>Ações rápidas MSY</p>
                {QUICK_PROMPTS.map((item) => (
                  <CommandItem
                    key={item.label}
                    icon={<Sparkles size={15} />}
                    label={item.label}
                    description="Enviar template curado para o Corvus"
                    onClick={() => run(() => onQuickPrompt(item.prompt))}
                  />
                ))}
              </section>

              {tags.length > 0 && (
                <section>
                  <p>Tags</p>
                  {tags.map((tag) => (
                    <CommandItem
                      key={tag}
                      icon={<Tag size={15} />}
                      label={`#${tag}`}
                      description="Buscar conversas com esta tag"
                      onClick={() => run(() => onSearchTag(tag))}
                    />
                  ))}
                </section>
              )}

              <section>
                <p>Conversas</p>
                {filteredConversations.length === 0 && (
                  <div className="command-empty">
                    <Compass size={15} />
                    <span>Nenhuma conversa encontrada.</span>
                  </div>
                )}
                {filteredConversations.map((conversation) => (
                  <CommandItem
                    key={conversation.id}
                    icon={<MessageSquare size={15} />}
                    label={conversation.title}
                    description={
                      conversation.summary ||
                      `${formatRelative(conversation.updatedAt)} · conversa`
                    }
                    trailing={
                      conversation.id === activeConversationId ? (
                        <Check size={14} />
                      ) : null
                    }
                    onClick={() =>
                      run(() => onSelectConversation(conversation.id))
                    }
                  />
                ))}
              </section>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function CommandItem({
  icon,
  label,
  description,
  trailing,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  trailing?: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button type="button" className="command-item" onClick={onClick}>
      <span className="command-item-icon">{icon}</span>
      <span className="command-item-copy">
        <strong>{label}</strong>
        <small>{description}</small>
      </span>
      {trailing && <span className="command-item-trailing">{trailing}</span>}
    </button>
  );
}

function formatRelative(time: number): string {
  const diff = Date.now() - time;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return "agora";
  if (diff < hour) return `${Math.floor(diff / minute)}m`;
  if (diff < day) return `${Math.floor(diff / hour)}h`;
  return `${Math.floor(diff / day)}d`;
}
