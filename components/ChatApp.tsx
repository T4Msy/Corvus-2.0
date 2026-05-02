"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  Archive,
  ArchiveRestore,
  Check,
  Command,
  MoreHorizontal,
  Menu,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Pin,
  Plus,
  Search,
  Settings,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { ChatInput } from "@/components/ChatInput";
import { ChatMessages } from "@/components/ChatMessages";
import { CommandPalette } from "@/components/CommandPalette";
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
  const [commandOpen, setCommandOpen] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [query, setQuery] = useState("");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
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

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen((current) => !current);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (!openMenuId) return;
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      if (!target?.closest(`[data-conversation-id="${openMenuId}"]`)) {
        setOpenMenuId(null);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [openMenuId]);

  const filteredConversations = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return conversations.conversations;
    return conversations.conversations.filter((item) => {
      const text = [item.title, item.summary, ...(item.tags ?? [])]
        .join(" ")
        .toLowerCase();
      return text.includes(term);
    });
  }, [conversations.conversations, query]);

  const conversationSections = useMemo(
    () => sectionConversations(filteredConversations),
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
    setCommandOpen(false);
  }, [chat, conversations]);

  const selectConversation = useCallback(
    async (conversationId: string) => {
      loadedConversationRef.current = conversationId;
      const history = await conversations.selectConversation(conversationId);
      chat.setHistory(history);
      setSidebarOpen(false);
      setCommandOpen(false);
    },
    [chat, conversations]
  );

  const updateConversation = useCallback(
    (conversationId: string, patch: Parameters<typeof conversations.updateConversation>[1]) => {
      void conversations.updateConversation(conversationId, patch);
      setOpenMenuId(null);
    },
    [conversations]
  );

  const startRename = useCallback((conversation: Conversation) => {
    setRenameId(conversation.id);
    setRenameValue(conversation.title);
    setOpenMenuId(null);
    setConfirmDeleteId(null);
  }, []);

  const commitRename = useCallback(
    (conversationId: string) => {
      const title = renameValue.trim();
      setRenameId(null);
      if (!title) return;
      const current = conversations.conversations.find(
        (item) => item.id === conversationId
      );
      if (current && current.title !== title) {
        updateConversation(conversationId, { title });
      }
    },
    [conversations.conversations, renameValue, updateConversation]
  );

  const deleteConversation = useCallback(
    async (conversationId: string) => {
      setOpenMenuId(null);
      setConfirmDeleteId(null);
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
    <div className={`corvus-shell${focusMode ? " focus-mode" : ""}`}>
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

          {conversationSections.map((section) => (
            <div className="conversation-group" key={section.label}>
              <p>{section.label}</p>
              {section.items.map((conversation) => {
                const active =
                  conversation.id === conversations.activeConversationId;
                const editing = renameId === conversation.id;
                const confirming = confirmDeleteId === conversation.id;
                const menuOpen = openMenuId === conversation.id;

                return (
                  <div
                    key={conversation.id}
                    data-conversation-id={conversation.id}
                    className={`conversation-item${active ? " active" : ""}${
                      menuOpen ? " menu-open" : ""
                    }`}
                  >
                    {editing ? (
                      <form
                        className="conversation-rename"
                        onSubmit={(event) => {
                          event.preventDefault();
                          commitRename(conversation.id);
                        }}
                      >
                        <input
                          autoFocus
                          value={renameValue}
                          aria-label="Renomear conversa"
                          onChange={(event) =>
                            setRenameValue(event.target.value)
                          }
                          onKeyDown={(event) => {
                            if (event.key === "Escape") {
                              event.preventDefault();
                              setRenameId(null);
                            }
                          }}
                        />
                        <button type="submit" aria-label="Salvar nome">
                          <Check size={13} />
                        </button>
                      </form>
                    ) : (
                      <button
                        type="button"
                        className="conversation-open"
                        onClick={() => void selectConversation(conversation.id)}
                      >
                        {conversation.pinned ? (
                          <Pin size={14} />
                        ) : conversation.favorite ? (
                          <Star size={14} />
                        ) : conversation.archived ? (
                          <Archive size={14} />
                        ) : (
                          <MessageSquare size={14} />
                        )}
                        <span>{conversation.title}</span>
                        <small>{formatRelative(conversation.updatedAt)}</small>
                      </button>
                    )}

                    {!editing && (
                      <button
                        type="button"
                        className="conversation-menu-button"
                        title="Ações"
                        aria-label="Ações da conversa"
                        aria-expanded={menuOpen}
                        onClick={(event) => {
                          event.stopPropagation();
                          setOpenMenuId((current) =>
                            current === conversation.id ? null : conversation.id
                          );
                          setConfirmDeleteId(null);
                        }}
                      >
                        <MoreHorizontal size={14} />
                      </button>
                    )}

                    <AnimatePresence>
                      {menuOpen && !confirming && (
                        <motion.div
                          className="conversation-menu"
                          initial={{ opacity: 0, y: 4, scale: 0.98 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 4, scale: 0.98 }}
                          transition={{ duration: 0.12 }}
                        >
                          <button
                            type="button"
                            onClick={() =>
                              updateConversation(conversation.id, {
                                pinned: !conversation.pinned,
                              })
                            }
                          >
                            <Pin size={13} />
                            <span>
                              {conversation.pinned ? "Desafixar" : "Fixar"}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              updateConversation(conversation.id, {
                                favorite: !conversation.favorite,
                              })
                            }
                          >
                            <Star size={13} />
                            <span>
                              {conversation.favorite
                                ? "Remover favorito"
                                : "Favoritar"}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => startRename(conversation)}
                          >
                            <Pencil size={13} />
                            <span>Renomear</span>
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              updateConversation(conversation.id, {
                                archived: !conversation.archived,
                              })
                            }
                          >
                            {conversation.archived ? (
                              <ArchiveRestore size={13} />
                            ) : (
                              <Archive size={13} />
                            )}
                            <span>
                              {conversation.archived
                                ? "Restaurar"
                                : "Arquivar"}
                            </span>
                          </button>
                          <button
                            type="button"
                            className="danger"
                            onClick={() => {
                              setConfirmDeleteId(conversation.id);
                              setOpenMenuId(null);
                            }}
                          >
                            <Trash2 size={13} />
                            <span>Excluir</span>
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <AnimatePresence>
                      {confirming && (
                        <motion.div
                          className="conversation-confirm"
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 4 }}
                          transition={{ duration: 0.12 }}
                        >
                          <span>Excluir conversa?</span>
                          <button
                            type="button"
                            onClick={() => void deleteConversation(conversation.id)}
                          >
                            Excluir
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                          >
                            Cancelar
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
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
            <span className="topbar-mode">
              {mode === "fenrir" ? "Fenrir" : "Corvus"}
            </span>
            <SyncPill status={conversations.syncStatus} />
          </div>

          <div className="topbar-actions">
            <button
              type="button"
              className="icon-button"
              title="Comandos"
              aria-label="Abrir comandos"
              onClick={() => setCommandOpen(true)}
            >
              <Command size={17} />
            </button>
            <button
              type="button"
              className="icon-button"
              title={focusMode ? "Mostrar sidebar" : "Modo foco"}
              aria-label={focusMode ? "Mostrar sidebar" : "Ativar modo foco"}
              onClick={() => setFocusMode((current) => !current)}
            >
              {focusMode ? (
                <PanelLeftOpen size={17} />
              ) : (
                <PanelLeftClose size={17} />
              )}
            </button>
            <button
              type="button"
              className="icon-button"
              title="Configurações"
              aria-label="Abrir configurações"
              onClick={() => setSettingsOpen(true)}
            >
              <Settings size={17} />
            </button>
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
            syncStatus={conversations.syncStatus}
          />
        </main>
      </section>

      <CommandPalette
        open={commandOpen}
        conversations={conversations.conversations}
        activeConversationId={conversations.activeConversationId}
        focusMode={focusMode}
        onClose={() => setCommandOpen(false)}
        onCreateConversation={() => void createConversation()}
        onSelectConversation={(conversationId) =>
          void selectConversation(conversationId)
        }
        onSetMode={setMode}
        onOpenSettings={() => setSettingsOpen(true)}
        onToggleFocus={() => setFocusMode((current) => !current)}
        onQuickPrompt={send}
      />

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

function SyncPill({
  status,
}: {
  status: "idle" | "saving" | "saved" | "error";
}) {
  const label =
    status === "saving"
      ? "Salvando"
      : status === "saved"
        ? "Salvo"
        : status === "error"
          ? "Erro de sync"
          : "Pronto";

  return <span className={`sync-pill ${status}`}>{label}</span>;
}

function sectionConversations(items: Conversation[]) {
  const pinned = items.filter((item) => item.pinned && !item.archived);
  const favorites = items.filter(
    (item) => item.favorite && !item.pinned && !item.archived
  );
  const recent = items.filter(
    (item) => !item.pinned && !item.favorite && !item.archived
  );
  const archived = items.filter((item) => item.archived);

  return [
    { label: "Fixados", items: pinned },
    { label: "Favoritos", items: favorites },
    { label: "Recentes", items: recent },
    { label: "Arquivados", items: archived },
  ].filter((section) => section.items.length > 0);
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
