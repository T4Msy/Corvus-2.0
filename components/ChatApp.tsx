"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bot,
  Brain,
  LogOut,
  Menu,
  MessageSquare,
  Moon,
  Plus,
  Search,
  ShieldCheck,
  Sun,
  Trash2,
  UserRound,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { ChatInput } from "@/components/ChatInput";
import { ChatMessages } from "@/components/ChatMessages";
import { LoginScreen } from "@/components/LoginScreen";
import { useAuth } from "@/hooks/useAuth";
import { useChat } from "@/hooks/useChat";
import { useConversations } from "@/hooks/useConversations";
import { useTheme } from "@/hooks/useTheme";
import type { AgentMode, Conversation, UserContext } from "@/lib/types";

export function ChatApp() {
  const { theme, toggle, label, logoSrc } = useTheme();
  const auth = useAuth();
  const chat = useChat();
  const conversations = useConversations(auth);
  const [mode, setMode] = useState<AgentMode>("corvus");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [query, setQuery] = useState("");
  const loadedConversationRef = useRef<string | null>(null);
  const creatingConversationRef = useRef(false);

  const userName =
    auth.profile?.nome_interno ||
    auth.profile?.nome ||
    (auth.status === "guest" ? "Convidado" : "Operador");

  const userContext: UserContext = useMemo(
    () => ({
      nome: userName,
      cargo: auth.profile?.cargo ?? "",
      sigla: auth.profile?.sigla_cargo ?? "",
      tipo:
        auth.status === "guest"
          ? "convidado"
          : auth.profile?.tipo ?? "membro",
    }),
    [auth.profile, auth.status, userName]
  );

  useEffect(() => {
    if (auth.status === "anon") {
      chat.reset();
      loadedConversationRef.current = null;
    }
  }, [auth.status, chat.reset]);

  useEffect(() => {
    if (
      (auth.status === "authed" || auth.status === "guest") &&
      !conversations.loading &&
      !conversations.activeConversationId &&
      conversations.conversations.length === 0
    ) {
      if (creatingConversationRef.current) return;
      creatingConversationRef.current = true;
      void conversations
        .createConversation()
        .then((conversation) => {
          loadedConversationRef.current = conversation.id;
          chat.setHistory([]);
        })
        .finally(() => {
          creatingConversationRef.current = false;
        });
    }
  }, [
    auth.status,
    chat.setHistory,
    conversations.activeConversationId,
    conversations.conversations.length,
    conversations.createConversation,
    conversations.loading,
  ]);

  useEffect(() => {
    if (auth.status !== "authed" && auth.status !== "guest") return;
    if (conversations.loading || !conversations.activeConversationId) return;
    if (loadedConversationRef.current === conversations.activeConversationId) {
      return;
    }

    const id = conversations.activeConversationId;
    loadedConversationRef.current = id;
    void conversations.selectConversation(id).then(chat.setHistory);
  }, [
    auth.status,
    chat.setHistory,
    conversations.activeConversationId,
    conversations.loading,
    conversations.selectConversation,
  ]);

  const filteredConversations = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return conversations.conversations;
    return conversations.conversations.filter((item) =>
      item.title.toLowerCase().includes(term)
    );
  }, [conversations.conversations, query]);

  const groupedConversations = useMemo(
    () => groupConversations(filteredConversations),
    [filteredConversations]
  );

  const send = useCallback(
    async (text: string) => {
      let active = conversations.activeConversation;
      if (!active) {
        active = await conversations.createConversation();
        loadedConversationRef.current = active.id;
        chat.setHistory([]);
      }
      const conversation = active;

      void chat.send({
        text,
        mode,
        conversationId: conversation.id,
        sessionId: conversation.sessionId,
        userId: auth.userId,
        userContext,
        accessToken: auth.accessToken,
        onUserMessage: (message) =>
          conversations.persistMessage(conversation.id, message),
        onAssistantMessage: (message) =>
          conversations.persistMessage(conversation.id, message),
      });
    },
    [auth.accessToken, auth.userId, chat, conversations, mode, userContext]
  );

  const createConversation = useCallback(async () => {
    const conversation = await conversations.createConversation();
    loadedConversationRef.current = conversation.id;
    chat.setHistory([]);
    setSidebarOpen(false);
  }, [chat, conversations]);

  const selectConversation = useCallback(
    async (conversationId: string) => {
      loadedConversationRef.current = conversationId;
      const history = await conversations.selectConversation(conversationId);
      chat.setHistory(history);
      setSidebarOpen(false);
    },
    [chat, conversations]
  );

  const deleteConversation = useCallback(
    async (conversationId: string) => {
      const wasActive = conversationId === conversations.activeConversationId;
      const nextId = await conversations.deleteConversation(conversationId);
      if (!wasActive) return;

      if (nextId) {
        loadedConversationRef.current = nextId;
        const history = await conversations.selectConversation(nextId);
        chat.setHistory(history);
        return;
      }

      const created = await conversations.createConversation();
      loadedConversationRef.current = created.id;
      chat.setHistory([]);
    },
    [chat, conversations]
  );

  if (auth.status === "loading") {
    return <BootScreen logoSrc={logoSrc} />;
  }

  if (auth.status === "anon") {
    return (
      <LoginScreen
        logoSrc={logoSrc}
        onLogin={auth.loginEmail}
        onGuest={auth.loginGuest}
        supabaseError={auth.error}
      />
    );
  }

  return (
    <div className="corvus-shell">
      <div className="cinema-bg" aria-hidden="true" />

      <AnimatePresence>
        {sidebarOpen && (
          <motion.button
            type="button"
            className="sidebar-scrim"
            aria-label="Fechar menu"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      <motion.aside
        className={`corvus-sidebar${sidebarOpen ? " open" : ""}`}
        initial={false}
      >
        <div className="sidebar-brand">
          <Image src={logoSrc} alt="Corvus" width={42} height={42} priority />
          <div>
            <strong>CORVUS</strong>
            <span>MSY Intelligence</span>
          </div>
          <button
            type="button"
            className="icon-button mobile-only"
            aria-label="Fechar menu"
            title="Fechar"
            onClick={() => setSidebarOpen(false)}
          >
            <X size={18} />
          </button>
        </div>

        <button
          type="button"
          className="new-chat-button"
          onClick={createConversation}
        >
          <Plus size={18} />
          <span>Novo chat</span>
        </button>

        <label className="sidebar-search" htmlFor="conversation-search">
          <Search size={16} />
          <input
            id="conversation-search"
            type="search"
            placeholder="Buscar"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>

        <div className="sidebar-section compact">
          <p>Agentes</p>
          <button className={mode === "corvus" ? "active" : ""} onClick={() => setMode("corvus")}>
            <Bot size={16} />
            <span>Corvus</span>
          </button>
          <button className={mode === "fenrir" ? "active" : ""} onClick={() => setMode("fenrir")}>
            <Brain size={16} />
            <span>Fenrir</span>
          </button>
        </div>

        <div className="conversation-stack">
          <div className="stack-header">
            <span>Conversas</span>
            {conversations.loading && <span className="mini-loader" />}
          </div>

          {filteredConversations.length === 0 && (
            <div className="empty-list">
              <MessageSquare size={17} />
              <span>Nenhuma conversa</span>
            </div>
          )}

          {groupedConversations.map((group) => (
            <div className="conversation-group" key={group.label}>
              <p>{group.label}</p>
              {group.items.map((conversation) => (
                <div
                  key={conversation.id}
                  className={`conversation-item${
                    conversation.id === conversations.activeConversationId
                      ? " active"
                      : ""
                  }`}
                >
                  <button
                    type="button"
                    className="conversation-open"
                    onClick={() => void selectConversation(conversation.id)}
                  >
                    <MessageSquare size={16} />
                    <span>{conversation.title}</span>
                    <small>{formatRelative(conversation.updatedAt)}</small>
                  </button>
                  <button
                    type="button"
                    className="conversation-delete"
                    title="Excluir"
                    aria-label="Excluir conversa"
                    onClick={(event) => {
                      event.stopPropagation();
                      void deleteConversation(conversation.id);
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          ))}
        </div>

        <div className="sidebar-insights">
          <div>
            <span>Conversas</span>
            <strong>{conversations.conversations.length}</strong>
          </div>
          <div>
            <span>Agente</span>
            <strong>{mode === "fenrir" ? "Fenrir" : "Corvus"}</strong>
          </div>
        </div>

        <div className="sidebar-footer">
          <div className="system-line">
            {auth.supabaseReady ? <Wifi size={15} /> : <WifiOff size={15} />}
            <span>{auth.supabaseReady ? "Supabase ativo" : "Supabase env"}</span>
          </div>
          {conversations.error && (
            <p className="sidebar-error">{conversations.error}</p>
          )}
          <div className="profile-row">
            <div className="profile-avatar">
              <UserRound size={17} />
            </div>
            <div>
              <strong>{userName}</strong>
              <span>{auth.status === "guest" ? "Convidado" : "MSY"}</span>
            </div>
            <button
              type="button"
              className="icon-button"
              title="Sair"
              aria-label="Sair"
              onClick={auth.logout}
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </motion.aside>

      <section className="workspace">
        <header className="topbar">
          <button
            type="button"
            className="icon-button desktop-hidden"
            title="Menu"
            aria-label="Menu"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu size={19} />
          </button>

          <div className="topbar-title">
            <span className="status-dot" />
            <div>
              <strong>{conversations.activeConversation?.title ?? "Corvus"}</strong>
              <span>{mode === "fenrir" ? "Fenrir mode" : "Corvus core"}</span>
            </div>
          </div>

          <div className="topbar-actions">
            <div className="engine-pill">
              <ShieldCheck size={15} />
              <span>{chat.pending ? "Processando" : "Pronto"}</span>
            </div>
            <button
              type="button"
              className="icon-button"
              title={`Tema: ${label}`}
              aria-label="Trocar tema"
              onClick={toggle}
            >
              {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
            </button>
          </div>
        </header>

        {auth.status === "guest" && (
          <div className="guest-ribbon">Sessao convidada</div>
        )}

        {auth.error && auth.status === "authed" && (
          <div className="guest-ribbon warning">{auth.error}</div>
        )}

        <main className="chat-stage">
          <ChatMessages
            messages={chat.messages}
            pending={chat.pending}
            error={chat.error}
            onRetry={chat.retryLast}
            profile={auth.profile}
            logoSrc={logoSrc}
            showWelcome
            welcomeName={
              auth.status === "guest" ? "Corvus online" : `Ola, ${userName}`
            }
            onSuggest={send}
          />
          <ChatInput
            mode={mode}
            onModeChange={setMode}
            onSend={send}
            disabled={chat.pending}
          />
        </main>
      </section>
    </div>
  );
}

function BootScreen({ logoSrc }: { logoSrc: string }) {
  return (
    <main className="boot-screen">
      <div className="cinema-bg" aria-hidden="true" />
      <motion.div
        className="boot-mark"
        initial={{ opacity: 0, scale: 0.94 }}
        animate={{ opacity: 1, scale: 1 }}
      >
        <Image src={logoSrc} alt="Corvus" width={70} height={70} priority />
        <span />
      </motion.div>
    </main>
  );
}

function groupConversations(conversations: Conversation[]) {
  return conversations.reduce<Array<{ label: string; items: Conversation[] }>>(
    (groups, conversation) => {
      const label = groupLabel(conversation.updatedAt);
      const group = groups.find((item) => item.label === label);
      if (group) group.items.push(conversation);
      else groups.push({ label, items: [conversation] });
      return groups;
    },
    []
  );
}

function groupLabel(time: number): string {
  const now = new Date();
  const date = new Date(time);
  const diff = now.getTime() - date.getTime();
  const day = 24 * 60 * 60 * 1000;
  if (date.toDateString() === now.toDateString()) return "Hoje";
  if (diff < day * 7) return "Semana";
  return "Arquivo";
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
