"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bot,
  Check,
  Compass,
  Focus,
  MessageSquare,
  Plus,
  Search,
  Settings,
  Sparkles,
  Zap,
} from "lucide-react";
import type { AgentMode, Conversation } from "@/lib/types";

interface Props {
  open: boolean;
  conversations: Conversation[];
  activeConversationId: string | null;
  focusMode: boolean;
  onClose: () => void;
  onCreateConversation: () => void;
  onSelectConversation: (conversationId: string) => void;
  onSetMode: (mode: AgentMode) => void;
  onOpenSettings: () => void;
  onToggleFocus: () => void;
  onQuickPrompt: (prompt: string) => void;
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

export function CommandPalette({
  open,
  conversations,
  activeConversationId,
  focusMode,
  onClose,
  onCreateConversation,
  onSelectConversation,
  onSetMode,
  onOpenSettings,
  onToggleFocus,
  onQuickPrompt,
}: Props) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }
    const id = window.setTimeout(() => inputRef.current?.focus(), 40);
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  const filteredConversations = useMemo(() => {
    const term = query.trim().toLowerCase();
    const source = conversations.filter((item) => !item.archived);
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
  }, [conversations, query]);

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
          onMouseDown={onClose}
        >
          <motion.div
            className="command-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Paleta de comandos"
            initial={{ opacity: 0, y: 14, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            onMouseDown={(event) => event.stopPropagation()}
          >
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
