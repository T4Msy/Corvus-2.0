"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  Menu,
  MessageSquare,
  Plus,
  Search,
  Settings,
  Trash2,
  X,
} from "lucide-react";
import { ChatInput } from "@/components/ChatInput";
import { ChatMessages } from "@/components/ChatMessages";
import { LoginScreen } from "@/components/LoginScreen";
import { SettingsDialog } from "@/components/SettingsDialog";
import { useAuth } from "@/hooks/useAuth";
import { useChat } from "@/hooks/useChat";
import { useConversations } from "@/hooks/useConversations";
import { usePreferences } from "@/hooks/usePreferences";
import { useTheme } from "@/hooks/useTheme";
import type { AgentMode, Conversation, UserContext, UserProfile } from "@/lib/types";

export function ChatApp() {
  const { preference, setPreference, logoSrc } = useTheme();
  const auth = useAuth();
  const chat = useChat();
  const conversations = useConversations(auth);
  const [mode, setMode] = useState<AgentMode>("corvus");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const loadedConversationRef = useRef<string | null>(null);
  const creatingConversationRef = useRef(false);

  // Sincroniza profile vindo do server com o snapshot do useAuth.
  // Também aplica o tema preferido do usuário ao carregar.
  const handleProfileChange = useCallback(
    (profile: UserProfile) => {
      auth.mergeProfile(profile);
      if (profile.theme_preference) {
        setPreference(profile.theme_preference);
      }
    },
    [auth, setPreference]
  );

  const preferences = usePreferences({
    accessToken: auth.accessToken,
    enabled: auth.status === "authed",
    fallbackName: auth.profile?.nome ?? auth.profile?.nome_interno ?? "Membro",
    onProfile: handleProfileChange,
  });

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
        auth.status === "guest" ? "convidado" : auth.profile?.tipo ?? "membro",
    }),
    [auth.profile, auth.status, userName]
  );

  // Reset chat ao deslogar
  useEffect(() => {
    if (auth.status === "anon") {
      chat.reset();
      loadedConversationRef.current = null;
    }
  }, [auth.status, chat.reset]);

  // Garante uma conversa ativa quando o usuário entra
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

  // Carrega histórico quando a conversa ativa muda
  useEffect(() => {
    if (auth.status !== "authed" && auth.status !== "guest") return;
    if (conversations.loading || !conversations.activeConversationId) return;
    if (loadedConversationRef.current === conversations.activeConversationId)
      return;

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

      <aside className={`corvus-sidebar${sidebarOpen ? " open" : ""}`}>
        <div className="sidebar-brand">
          <Image src={logoSrc} alt="Corvus" width={26} height={26} priority />
          <strong>Corvus</strong>
          <button
            type="button"
            className="icon-button mobile-only"
            aria-label="Fechar menu"
            onClick={() => setSidebarOpen(false)}
          >
            <X size={16} />
          </button>
        </div>

        <button
          type="button"
          className="new-chat-button"
          onClick={createConversation}
        >
          <Plus size={15} />
          <span>Novo chat</span>
        </button>

        <label className="sidebar-search" htmlFor="conversation-search">
          <Search size={14} />
          <input
            id="conversation-search"
            type="search"
            placeholder="Buscar conversa"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>

        <div className="conversation-stack">
          {conversations.loading && conversations.conversations.length === 0 && (
            <div className="empty-list">
              <span className="mini-loader" />
              <span>Carregando…</span>
            </div>
          )}

          {!conversations.loading && filteredConversations.length === 0 && (
            <div className="empty-list">
              <MessageSquare size={16} />
              <span>{query ? "Nada encontrado" : "Nenhuma conversa ainda"}</span>
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
                    <MessageSquare size={14} />
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
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          ))}
        </div>

        <div className="sidebar-footer">
          {conversations.error && (
            <p className="sidebar-error">{conversations.error}</p>
          )}
          <button
            type="button"
            className="profile-button"
            onClick={() => setSettingsOpen(true)}
            aria-label="Abrir configurações"
          >
            <span className="profile-avatar">
              {auth.profile?.avatar_url ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={auth.profile.avatar_url} alt="" />
              ) : (
                userName.charAt(0).toUpperCase()
              )}
            </span>
            <div>
              <strong>{userName}</strong>
              <span>{auth.status === "guest" ? "Convidado" : auth.profile?.cargo || "Membro MSY"}</span>
            </div>
            <Settings size={15} className="profile-button-icon" />
          </button>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <button
            type="button"
            className="icon-button desktop-hidden"
            title="Menu"
            aria-label="Abrir menu"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu size={18} />
          </button>

          <div className="topbar-title">
            <strong>
              {conversations.activeConversation?.title ?? "Nova conversa"}
            </strong>
          </div>
        </header>

        {auth.error && auth.status === "authed" && (
          <div
            className="persistence-banner"
            role="alert"
            style={{ margin: "8px auto 0", maxWidth: "var(--content-max)" }}
          >
            <AlertCircle size={14} />
            <span>{auth.error}</span>
          </div>
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
              auth.status === "guest"
                ? "Olá. Sou Corvus."
                : `Olá, ${userName}`
            }
            welcomeSubtitle="Pergunte algo. Ou escolha uma sugestão."
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

      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        profile={auth.profile}
        loading={preferences.loading}
        saving={preferences.saving}
        error={preferences.error}
        themePreference={preference}
        isGuest={auth.status === "guest"}
        onSetTheme={setPreference}
        onUpdateProfile={preferences.updateProfile}
        onLogout={auth.logout}
      />
    </div>
  );
}

function BootScreen({ logoSrc }: { logoSrc: string }) {
  return (
    <main className="boot-screen">
      <motion.div
        className="boot-mark"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
      >
        <Image src={logoSrc} alt="Corvus" width={50} height={50} priority />
        <span />
      </motion.div>
    </main>
  );
}

function groupConversations(items: Conversation[]) {
  return items.reduce<Array<{ label: string; items: Conversation[] }>>(
    (groups, conversation) => {
      const label = groupLabel(conversation.updatedAt);
      const group = groups.find((g) => g.label === label);
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
  const day = 24 * 60 * 60 * 1000;
  const diff = now.getTime() - date.getTime();
  if (date.toDateString() === now.toDateString()) return "Hoje";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "Ontem";
  if (diff < day * 7) return "Esta semana";
  if (diff < day * 30) return "Este mês";
  return "Anteriores";
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
