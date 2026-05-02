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
  Download,
  ExternalLink,
  FileText,
  Info,
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
  Tag,
  Trash2,
  X,
} from "lucide-react";
import { ChatInput } from "@/components/ChatInput";
import { ChatMessages } from "@/components/ChatMessages";
import { CommandPalette } from "@/components/CommandPalette";
import { LoginScreen } from "@/components/LoginScreen";
import { SettingsDialog } from "@/components/SettingsDialog";
import { ShortcutsDialog } from "@/components/ShortcutsDialog";
import { useToast } from "@/components/ToastProvider";
import { useAuth } from "@/hooks/useAuth";
import { useChat } from "@/hooks/useChat";
import { useConversationAttachments } from "@/hooks/useConversationAttachments";
import { useConversations } from "@/hooks/useConversations";
import { usePreferences } from "@/hooks/usePreferences";
import { useStorageUrl } from "@/hooks/useStorageUrl";
import { useTheme } from "@/hooks/useTheme";
import { getBrowserSupabase } from "@/integrations/supabase/client";
import {
  subscribeToConversationMessages,
  unsubscribeFromChannel,
} from "@/integrations/supabase/realtime";
import {
  isStoragePath,
  removeConversationFile,
  uploadUserFile,
} from "@/integrations/supabase/storage";
import { exportConversationAsMarkdown } from "@/lib/export";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type {
  AgentMode,
  ChatMessage,
  Conversation,
  ConversationAttachment,
  SyncStatus,
  UserContext,
  UserProfile,
} from "@/lib/types";

type HistoryFilter = "all" | "pinned" | "favorite" | "tagged" | "archived";

const HISTORY_FILTERS: Array<{ value: HistoryFilter; label: string }> = [
  { value: "all", label: "Todas" },
  { value: "pinned", label: "Fixadas" },
  { value: "favorite", label: "Favoritas" },
  { value: "tagged", label: "Tags" },
  { value: "archived", label: "Arquivo" },
];

export function ChatApp() {
  const { preference, setPreference, logoSrc } = useTheme();
  const toast = useToast();
  const auth = useAuth();
  const chat = useChat();
  const conversations = useConversations(auth);
  const [mode, setMode] = useState<AgentMode>("corvus");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [query, setQuery] = useState("");
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>("all");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [tagEditorId, setTagEditorId] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState("");
  const [detailsSummary, setDetailsSummary] = useState("");
  const [detailsTagInput, setDetailsTagInput] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [topbarEditing, setTopbarEditing] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [seenAt, setSeenAt] = useState<Record<string, number>>({});
  const seenInitializedRef = useRef(false);
  const loadedConversationRef = useRef<string | null>(null);
  const creatingConversationRef = useRef(false);
  const realtimeChannelRef = useRef<RealtimeChannel | null>(null);
  const lastSyncStatusRef = useRef<SyncStatus>("idle");
  const wasOnlineRef = useRef(true);

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

  const avatarSrc = useStorageUrl(
    auth.profile?.avatar_url,
    auth.status === "authed" && auth.supabaseReady && conversations.online
  );

  const attachments = useConversationAttachments({
    userId: auth.userId,
    activeConversationId: conversations.activeConversationId,
    enabled: auth.status === "authed" && auth.supabaseReady,
    online: conversations.online,
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
        return;
      }
      const tag = (event.target as HTMLElement)?.tagName;
      const isEditing = tag === "INPUT" || tag === "TEXTAREA" || (event.target as HTMLElement)?.isContentEditable;
      if (event.key === "?" && !isEditing) {
        event.preventDefault();
        setShortcutsOpen((current) => !current);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Inicializa seenAt na primeira carga de conversas para não mostrar badges em itens já conhecidos
  useEffect(() => {
    if (conversations.loading || seenInitializedRef.current || conversations.conversations.length === 0) return;
    seenInitializedRef.current = true;
    const init: Record<string, number> = {};
    for (const c of conversations.conversations) {
      init[c.id] = c.updatedAt;
    }
    setSeenAt(init);
  }, [conversations.loading, conversations.conversations]);

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

  useEffect(() => {
    if (!tagEditorId) return;
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      if (!target?.closest(`[data-conversation-id="${tagEditorId}"]`)) {
        setTagEditorId(null);
        setTagInput("");
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [tagEditorId]);

  useEffect(() => {
    if (!detailsOpen) return;
    setDetailsSummary(conversations.activeConversation?.summary ?? "");
    setDetailsTagInput("");
  }, [conversations.activeConversation, detailsOpen]);

  useEffect(() => {
    if (conversations.online === wasOnlineRef.current) return;
    wasOnlineRef.current = conversations.online;
    if (conversations.online) {
      toast.push({
        tone: "info",
        title: "Conexão restaurada",
        message: "Você pode sincronizar as alterações pendentes.",
        actionLabel: "Sincronizar",
        onAction: conversations.retrySync,
      });
      return;
    }
    toast.push({
      tone: "warning",
      title: "Você está offline",
      message: "A navegação local continua disponível.",
      duration: 5200,
    });
  }, [conversations.online, conversations.retrySync, toast]);

  useEffect(() => {
    const previous = lastSyncStatusRef.current;
    const current = conversations.syncStatus;
    if (previous === current) return;
    lastSyncStatusRef.current = current;

    if (current === "error") {
      toast.push({
        tone: "error",
        title: "Sincronização falhou",
        message:
          conversations.lastSyncError ||
          "Não foi possível concluir a operação agora.",
        actionLabel: "Repetir",
        onAction: conversations.retrySync,
      });
    }

    if (current === "saved" && (previous === "error" || previous === "offline")) {
      toast.push({
        tone: "success",
        title: "Sincronizado",
        message: "As alterações foram confirmadas.",
      });
    }
  }, [
    conversations.lastSyncError,
    conversations.retrySync,
    conversations.syncStatus,
    toast,
  ]);

  const handleRealtimeMessage = useCallback(
    (message: ChatMessage) => {
      const conversationId = conversations.activeConversationId;
      if (!conversationId) return;
      conversations.ingestRealtimeMessage(conversationId, message);
      chat.appendExternalMessage(message);
    },
    [
      chat.appendExternalMessage,
      conversations.activeConversationId,
      conversations.ingestRealtimeMessage,
    ]
  );

  useEffect(() => {
    if (
      auth.status !== "authed" ||
      !auth.supabaseReady ||
      !conversations.activeConversationId ||
      !conversations.online
    ) {
      return;
    }

    try {
      const supabase = getBrowserSupabase();
      const channel = subscribeToConversationMessages(
        supabase,
        conversations.activeConversationId,
        handleRealtimeMessage,
        (message) =>
          toast.push({
            tone: "warning",
            title: "Realtime indisponível",
            message,
            duration: 5200,
          })
      );
      realtimeChannelRef.current = channel;

      return () => {
        unsubscribeFromChannel(supabase, channel);
        if (realtimeChannelRef.current === channel) {
          realtimeChannelRef.current = null;
        }
      };
    } catch (err) {
      toast.push({
        tone: "warning",
        title: "Realtime indisponível",
        message:
          err instanceof Error
            ? err.message
            : "Não foi possível abrir a sincronização ao vivo.",
      });
    }
  }, [
    auth.status,
    auth.supabaseReady,
    conversations.activeConversationId,
    conversations.online,
    handleRealtimeMessage,
    toast,
  ]);

  const filteredConversations = useMemo(() => {
    const term = query.trim().toLowerCase();
    return conversations.conversations.filter((item) => {
      if (!matchesHistoryFilter(item, historyFilter)) return false;
      if (!term) return true;
      return getConversationSearchText(item).includes(term);
    });
  }, [conversations.conversations, historyFilter, query]);

  const conversationSections = useMemo(
    () => sectionConversations(filteredConversations, historyFilter),
    [filteredConversations, historyFilter]
  );

  const historyFilterCounts = useMemo(
    () => ({
      all: conversations.conversations.filter((item) => !item.archived).length,
      pinned: conversations.conversations.filter(
        (item) => item.pinned && !item.archived
      ).length,
      favorite: conversations.conversations.filter(
        (item) => item.favorite && !item.archived
      ).length,
      tagged: conversations.conversations.filter(
        (item) => !item.archived && (item.tags?.length ?? 0) > 0
      ).length,
      archived: conversations.conversations.filter((item) => item.archived)
        .length,
    }),
    [conversations.conversations]
  );

  const send = useCallback(
    async (text: string) => {
      if (!conversations.online) {
        toast.push({
          tone: "warning",
          title: "Você está offline",
          message: "Conecte novamente para enviar ao Corvus.",
        });
        return;
      }
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
    [
      auth.accessToken,
      auth.userId,
      chat,
      conversations,
      mode,
      toast,
      userContext,
    ]
  );

  const requestSend = useCallback(
    (text: string) => {
      if (!conversations.online) {
        toast.push({
          tone: "warning",
          title: "Você está offline",
          message: "A mensagem não foi enviada. Tente novamente ao reconectar.",
          actionLabel: "Sincronizar",
          onAction: conversations.retrySync,
        });
        return false;
      }
      void send(text);
      return true;
    },
    [conversations.online, conversations.retrySync, send, toast]
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
      setHistoryLoading(true);
      setSeenAt((prev) => ({ ...prev, [conversationId]: Date.now() }));
      try {
        const history = await conversations.selectConversation(conversationId);
        chat.setHistory(history);
      } finally {
        setHistoryLoading(false);
      }
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

  const updateActiveConversation = useCallback(
    (patch: Parameters<typeof conversations.updateConversation>[1]) => {
      const activeId = conversations.activeConversationId;
      if (!activeId) return;
      updateConversation(activeId, patch);
    },
    [conversations.activeConversationId, updateConversation]
  );

  const openTagEditor = useCallback((conversation: Conversation) => {
    setTagEditorId(conversation.id);
    setTagInput("");
    setOpenMenuId(null);
    setConfirmDeleteId(null);
  }, []);

  const addConversationTag = useCallback(
    (conversation: Conversation, rawTag: string) => {
      const tag = normalizeTag(rawTag);
      if (!tag) return;
      const tags = normalizeTags([...(conversation.tags ?? []), tag]);
      updateConversation(conversation.id, { tags });
      setTagInput("");
      setDetailsTagInput("");
    },
    [updateConversation]
  );

  const removeConversationTag = useCallback(
    (conversation: Conversation, tag: string) => {
      const tags = normalizeTags(
        (conversation.tags ?? []).filter((item) => item !== tag)
      );
      updateConversation(conversation.id, { tags });
    },
    [updateConversation]
  );

  const searchTag = useCallback((tag: string) => {
    setHistoryFilter("tagged");
    setQuery(tag);
    setCommandOpen(false);
  }, []);

  const startRename = useCallback((conversation: Conversation) => {
    setRenameId(conversation.id);
    setRenameValue(conversation.title);
    setOpenMenuId(null);
    setTagEditorId(null);
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

  const startTopbarRename = useCallback(() => {
    if (!conversations.activeConversation) return;
    setTopbarEditing(true);
    setRenameValue(conversations.activeConversation.title);
  }, [conversations.activeConversation]);

  const commitTopbarRename = useCallback(() => {
    const activeId = conversations.activeConversationId;
    setTopbarEditing(false);
    if (!activeId) return;
    const title = renameValue.trim();
    if (!title) return;
    const current = conversations.conversations.find((item) => item.id === activeId);
    if (current && current.title !== title) {
      updateConversation(activeId, { title });
    }
  }, [conversations.activeConversationId, conversations.conversations, renameValue, updateConversation]);

  const deleteConversation = useCallback(
    async (conversationId: string) => {
      setOpenMenuId(null);
      setTagEditorId(null);
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

  const saveDetailsSummary = useCallback(() => {
    const active = conversations.activeConversation;
    if (!active) return;
    const summary = detailsSummary.trim();
    if (summary !== (active.summary ?? "")) {
      updateConversation(active.id, { summary });
    }
  }, [conversations.activeConversation, detailsSummary, updateConversation]);

  const uploadAvatar = useCallback(
    async (file: File) => {
      if (auth.status !== "authed" || !auth.supabaseReady) {
        toast.push({
          tone: "warning",
          title: "Login necessário",
          message: "Entre com sua conta para atualizar o avatar.",
        });
        return;
      }
      if (!conversations.online) {
        toast.push({
          tone: "warning",
          title: "Você está offline",
          message: "Reconecte para enviar o avatar.",
        });
        return;
      }
      if (!file.type.startsWith("image/")) {
        toast.push({
          tone: "error",
          title: "Arquivo inválido",
          message: "Escolha uma imagem PNG, JPG, WebP ou GIF.",
        });
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        toast.push({
          tone: "error",
          title: "Imagem muito grande",
          message: "Use uma imagem de até 5 MB.",
        });
        return;
      }

      const previous = auth.profile?.avatar_url;
      setAvatarBusy(true);
      try {
        const uploaded = await uploadUserFile(
          getBrowserSupabase(),
          file,
          auth.userId,
          "profile"
        );
        const result = await preferences.updateProfile({
          avatar_url: uploaded.path,
        });
        if (!result) {
          await removeConversationFile(getBrowserSupabase(), uploaded.path).catch(
            () => undefined
          );
          throw new Error("Falha ao salvar avatar no perfil.");
        }
        if (previous && isStoragePath(previous) && previous !== uploaded.path) {
          await removeConversationFile(getBrowserSupabase(), previous).catch(
            () => undefined
          );
        }
        toast.push({
          tone: "success",
          title: "Avatar atualizado",
          message: "Sua identidade visual foi sincronizada.",
        });
      } catch (err) {
        toast.push({
          tone: "error",
          title: "Falha no avatar",
          message:
            err instanceof Error
              ? err.message
              : "Não foi possível atualizar a imagem.",
        });
      } finally {
        setAvatarBusy(false);
      }
    },
    [
      auth.profile?.avatar_url,
      auth.status,
      auth.supabaseReady,
      auth.userId,
      conversations.online,
      preferences,
      toast,
    ]
  );

  const removeAvatar = useCallback(async () => {
    if (auth.status !== "authed") return;
    const previous = auth.profile?.avatar_url;
    setAvatarBusy(true);
    const result = await preferences.updateProfile({ avatar_url: null });
    if (!result) {
      setAvatarBusy(false);
      toast.push({
        tone: "error",
        title: "Falha ao remover avatar",
        message: "Não foi possível atualizar seu perfil.",
      });
      return;
    }
    if (previous && isStoragePath(previous) && conversations.online) {
      await removeConversationFile(getBrowserSupabase(), previous).catch(
        () => undefined
      );
    }
    toast.push({
      tone: "success",
      title: "Avatar removido",
      message: "O perfil voltou a usar sua inicial.",
    });
    setAvatarBusy(false);
  }, [
    auth.profile?.avatar_url,
    auth.status,
    conversations.online,
    preferences,
    toast,
  ]);

  const attachFile = useCallback(
    async (file: File) => {
      if (auth.status !== "authed" || !auth.supabaseReady) {
        toast.push({
          tone: "warning",
          title: "Login necessário",
          message: "Anexos ficam disponíveis apenas em contas autenticadas.",
        });
        return;
      }
      if (!conversations.online) {
        toast.push({
          tone: "warning",
          title: "Você está offline",
          message: "Reconecte para anexar arquivos.",
        });
        return;
      }

      let conversationId = conversations.activeConversationId;
      if (!conversationId) {
        const conversation = await conversations.createConversation();
        conversationId = conversation.id;
        loadedConversationRef.current = conversation.id;
        chat.setHistory([]);
      }

      const attachment = await attachments.upload(file, conversationId);
      if (!attachment) {
        toast.push({
          tone: "error",
          title: "Falha no anexo",
          message: attachments.error || "Não foi possível enviar o arquivo.",
        });
        return;
      }
      toast.push({
        tone: "success",
        title: "Arquivo anexado",
        message: attachment.name,
      });
    },
    [
      attachments,
      auth.status,
      auth.supabaseReady,
      chat,
      conversations,
      toast,
    ]
  );

  const openAttachment = useCallback(
    async (attachment: ConversationAttachment) => {
      const ok = await attachments.open(attachment);
      if (!ok) {
        toast.push({
          tone: "error",
          title: "Falha ao abrir arquivo",
          message: attachments.error || "Não foi possível gerar acesso.",
        });
      }
    },
    [attachments, toast]
  );

  const removeAttachment = useCallback(
    async (attachment: ConversationAttachment) => {
      const ok = await attachments.remove(attachment);
      if (!ok) {
        toast.push({
          tone: "error",
          title: "Falha ao remover arquivo",
          message: attachments.error || "Não foi possível remover o anexo.",
        });
        return;
      }
      toast.push({
        tone: "success",
        title: "Arquivo removido",
        message: attachment.name,
      });
    },
    [attachments, toast]
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
            placeholder="Buscar título, tag ou resumo"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>

        <div className="history-filter-row" aria-label="Filtros do histórico">
          {HISTORY_FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              className={historyFilter === filter.value ? "active" : ""}
              onClick={() => setHistoryFilter(filter.value)}
            >
              <span>{filter.label}</span>
              <small>{historyFilterCounts[filter.value]}</small>
            </button>
          ))}
        </div>

        <div className="conversation-stack">
          {conversations.loading && conversations.conversations.length === 0 && (
            <div className="skeleton-conversation-list">
              {[72, 55, 88, 64, 78].map((width, i) => (
                <div
                  key={i}
                  className="skeleton skeleton-conversation-item"
                  style={{ width: `${width}%` }}
                />
              ))}
            </div>
          )}

          {!conversations.loading && filteredConversations.length === 0 && (
            <div className="empty-list">
              <MessageSquare size={16} />
              <span>
                {query
                  ? "Nada encontrado"
                  : historyFilter === "archived"
                    ? "Nenhuma conversa arquivada"
                    : "Nenhuma conversa neste filtro"}
              </span>
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
                const hasUnread =
                  !active &&
                  conversation.updatedAt > (seenAt[conversation.id] ?? conversation.updatedAt);

                return (
                  <div
                    key={conversation.id}
                    data-conversation-id={conversation.id}
                    className={`conversation-item${active ? " active" : ""}${
                      menuOpen ? " menu-open" : ""
                    }${hasUnread ? " has-unread" : ""}`}
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
                            onClick={() => openTagEditor(conversation)}
                          >
                            <Tag size={13} />
                            <span>Tags</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              exportConversationAsMarkdown(conversation);
                              setOpenMenuId(null);
                            }}
                          >
                            <Download size={13} />
                            <span>Exportar</span>
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
                      {tagEditorId === conversation.id && (
                        <motion.div
                          className="conversation-tag-editor"
                          initial={{ opacity: 0, y: 4, scale: 0.98 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 4, scale: 0.98 }}
                          transition={{ duration: 0.12 }}
                        >
                          <div className="tag-chip-list">
                            {(conversation.tags ?? []).length > 0 ? (
                              (conversation.tags ?? []).map((tag) => (
                                <button
                                  key={tag}
                                  type="button"
                                  className="tag-chip removable"
                                  title="Remover tag"
                                  onClick={() =>
                                    removeConversationTag(conversation, tag)
                                  }
                                >
                                  <span>{tag}</span>
                                  <X size={11} />
                                </button>
                              ))
                            ) : (
                              <span className="tag-empty">Sem tags</span>
                            )}
                          </div>
                          <form
                            className="tag-input-row"
                            onSubmit={(event) => {
                              event.preventDefault();
                              addConversationTag(conversation, tagInput);
                            }}
                          >
                            <input
                              autoFocus
                              value={tagInput}
                              maxLength={24}
                              placeholder="Adicionar tag"
                              onChange={(event) =>
                                setTagInput(event.target.value)
                              }
                              onKeyDown={(event) => {
                                if (event.key === "Escape") {
                                  event.preventDefault();
                                  setTagEditorId(null);
                                  setTagInput("");
                                }
                              }}
                            />
                            <button type="submit">Adicionar</button>
                          </form>
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
            <div className="sidebar-error" role="alert">
              <span>{conversations.error}</span>
              <button type="button" onClick={conversations.retrySync}>
                Sincronizar
              </button>
            </div>
          )}
          <button
            type="button"
            className="profile-button"
            onClick={() => setSettingsOpen(true)}
            aria-label="Abrir configurações"
          >
            <span className="profile-avatar">
              {avatarSrc ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={avatarSrc} alt="" />
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
            {topbarEditing ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  commitTopbarRename();
                }}
              >
                <input
                  className="topbar-rename-input"
                  autoFocus
                  value={renameValue}
                  aria-label="Renomear conversa"
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={commitTopbarRename}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      e.preventDefault();
                      setTopbarEditing(false);
                    }
                  }}
                />
              </form>
            ) : (
              <button
                type="button"
                className="topbar-title-btn"
                title="Clique para renomear"
                onClick={startTopbarRename}
                disabled={!conversations.activeConversation}
              >
                {conversations.activeConversation?.title ?? "Nova conversa"}
              </button>
            )}
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
              title="Detalhes da conversa"
              aria-label="Abrir detalhes da conversa"
              onClick={() => setDetailsOpen(true)}
            >
              <Info size={17} />
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
            historyLoading={historyLoading}
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
            onSuggest={requestSend}
          />
          <ChatInput
            mode={mode}
            onModeChange={setMode}
            onSend={requestSend}
            onAttachFile={(file) => void attachFile(file)}
            onAttachBlocked={() => {
              toast.push({
                tone: "warning",
                title:
                  auth.status === "guest"
                    ? "Login necessário"
                    : "Anexo indisponível",
                message:
                  auth.status === "guest"
                    ? "Entre com sua conta para anexar arquivos."
                    : "Reconecte para anexar arquivos.",
              });
            }}
            disabled={chat.pending}
            attachmentDisabled={
              auth.status !== "authed" ||
              !auth.supabaseReady ||
              !conversations.online
            }
            attachmentBusy={attachments.busy}
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
        onQuickPrompt={requestSend}
        historyFilter={historyFilter}
        onSetHistoryFilter={setHistoryFilter}
        onSearchTag={searchTag}
        onUpdateActiveConversation={updateActiveConversation}
      />

      <AnimatePresence>
        {detailsOpen && (
          <motion.aside
            className="conversation-details"
            role="dialog"
            aria-modal="true"
            aria-label="Detalhes da conversa"
            initial={{ opacity: 0, x: 18 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 18 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="details-header">
              <div>
                <p className="eyebrow">Histórico</p>
                <h2>{conversations.activeConversation?.title ?? "Nova conversa"}</h2>
              </div>
              <button
                type="button"
                className="dialog-close"
                aria-label="Fechar detalhes"
                onClick={() => setDetailsOpen(false)}
              >
                <X size={18} />
              </button>
            </div>

            {conversations.activeConversation ? (
              <div className="details-body">
                <section className="details-section">
                  <h3>Resumo</h3>
                  <textarea
                    value={detailsSummary}
                    rows={5}
                    placeholder="Resumo curto para localizar esta conversa depois."
                    onChange={(event) => setDetailsSummary(event.target.value)}
                    onBlur={saveDetailsSummary}
                  />
                  <button
                    type="button"
                    className="secondary-action sm"
                    onClick={saveDetailsSummary}
                  >
                    Salvar resumo
                  </button>
                </section>

                <section className="details-section">
                  <h3>Tags</h3>
                  <div className="tag-chip-list">
                    {(conversations.activeConversation.tags ?? []).length > 0 ? (
                      (conversations.activeConversation.tags ?? []).map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          className="tag-chip removable"
                          onClick={() =>
                            removeConversationTag(
                              conversations.activeConversation as Conversation,
                              tag
                            )
                          }
                        >
                          <span>{tag}</span>
                          <X size={11} />
                        </button>
                      ))
                    ) : (
                      <span className="tag-empty">Nenhuma tag cadastrada</span>
                    )}
                  </div>
                  <form
                    className="tag-input-row"
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (conversations.activeConversation) {
                        addConversationTag(
                          conversations.activeConversation,
                          detailsTagInput
                        );
                      }
                    }}
                  >
                    <input
                      value={detailsTagInput}
                      maxLength={24}
                      placeholder="Nova tag"
                      onChange={(event) =>
                        setDetailsTagInput(event.target.value)
                      }
                    />
                    <button type="submit">Adicionar</button>
                  </form>
                </section>

                <section className="details-section">
                  <div className="details-section-heading">
                    <h3>Arquivos</h3>
                    <button
                      type="button"
                      className="secondary-action sm"
                      disabled={attachments.busy}
                      onClick={() => {
                        if (
                          auth.status !== "authed" ||
                          !auth.supabaseReady ||
                          !conversations.online
                        ) {
                          toast.push({
                            tone: "warning",
                            title:
                              auth.status === "guest"
                                ? "Login necessário"
                                : "Anexo indisponível",
                            message:
                              auth.status === "guest"
                                ? "Entre com sua conta para anexar arquivos."
                                : "Reconecte para anexar arquivos.",
                          });
                          return;
                        }
                        const input = document.getElementById(
                          "conversation-file-picker"
                        ) as HTMLInputElement | null;
                        input?.click();
                      }}
                    >
                      Anexar
                    </button>
                  </div>
                  <input
                    id="conversation-file-picker"
                    type="file"
                    className="sr-only"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      if (file) void attachFile(file);
                    }}
                  />
                  {attachments.activeAttachments.length > 0 ? (
                    <div className="attachment-list">
                      {attachments.activeAttachments.map((attachment) => (
                        <div className="attachment-item" key={attachment.id}>
                          <span className="attachment-icon" aria-hidden="true">
                            <FileText size={16} />
                          </span>
                          <span className="attachment-copy">
                            <strong>{attachment.name}</strong>
                            <small>
                              {fileKindLabel(attachment.type)} ·{" "}
                              {formatFileSize(attachment.size)}
                            </small>
                          </span>
                          <button
                            type="button"
                            title="Abrir"
                            aria-label="Abrir arquivo"
                            onClick={() => void openAttachment(attachment)}
                          >
                            <ExternalLink size={14} />
                          </button>
                          <button
                            type="button"
                            title="Remover"
                            aria-label="Remover arquivo"
                            onClick={() => void removeAttachment(attachment)}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="details-hint">
                      Nenhum arquivo anexado.
                    </p>
                  )}
                </section>

                <section className="details-section">
                  <h3>Ações</h3>
                  <div className="details-action-grid">
                    <button
                      type="button"
                      className={conversations.activeConversation.pinned ? "active" : ""}
                      onClick={() =>
                        updateActiveConversation({
                          pinned: !conversations.activeConversation?.pinned,
                        })
                      }
                    >
                      <Pin size={14} />
                      <span>Fixar</span>
                    </button>
                    <button
                      type="button"
                      className={
                        conversations.activeConversation.favorite ? "active" : ""
                      }
                      onClick={() =>
                        updateActiveConversation({
                          favorite: !conversations.activeConversation?.favorite,
                        })
                      }
                    >
                      <Star size={14} />
                      <span>Favoritar</span>
                    </button>
                    <button
                      type="button"
                      className={
                        conversations.activeConversation.archived ? "active" : ""
                      }
                      onClick={() =>
                        updateActiveConversation({
                          archived: !conversations.activeConversation?.archived,
                        })
                      }
                    >
                      <Archive size={14} />
                      <span>Arquivar</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                        exportConversationAsMarkdown(conversations.activeConversation!)
                      }
                    >
                      <Download size={14} />
                      <span>Exportar</span>
                    </button>
                  </div>
                </section>

                <section className="details-section compact">
                  <h3>Dados</h3>
                  <dl>
                    <div>
                      <dt>Atualizada</dt>
                      <dd>{formatDateTime(conversations.activeConversation.updatedAt)}</dd>
                    </div>
                    <div>
                      <dt>Criada</dt>
                      <dd>{formatDateTime(conversations.activeConversation.createdAt)}</dd>
                    </div>
                    <div>
                      <dt>Sessão</dt>
                      <dd>{conversations.activeConversation.sessionId}</dd>
                    </div>
                  </dl>
                </section>
              </div>
            ) : (
              <div className="details-empty">Nenhuma conversa ativa.</div>
            )}
          </motion.aside>
        )}
      </AnimatePresence>

      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        profile={auth.profile}
        avatarSrc={avatarSrc}
        loading={preferences.loading}
        saving={preferences.saving}
        avatarBusy={avatarBusy}
        error={preferences.error}
        themePreference={preference}
        isGuest={auth.status === "guest"}
        onSetTheme={setPreference}
        onUpdateProfile={preferences.updateProfile}
        onUploadAvatar={uploadAvatar}
        onRemoveAvatar={removeAvatar}
        onLogout={auth.logout}
      />

      <ShortcutsDialog
        open={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
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
  status: SyncStatus;
}) {
  const label =
    status === "saving"
      ? "Salvando"
      : status === "saved"
        ? "Salvo"
        : status === "offline"
          ? "Offline"
        : status === "error"
          ? "Erro de sync"
          : "Pronto";

  return <span className={`sync-pill ${status}`}>{label}</span>;
}

function sectionConversations(items: Conversation[], filter: HistoryFilter) {
  if (filter === "pinned") return [{ label: "Fixadas", items }];
  if (filter === "favorite") return [{ label: "Favoritas", items }];
  if (filter === "tagged") return [{ label: "Com tags", items }];
  if (filter === "archived") return [{ label: "Arquivadas", items }];

  const pinned = items.filter((item) => item.pinned && !item.archived);
  const favorites = items.filter(
    (item) => item.favorite && !item.pinned && !item.archived
  );
  const recent = items.filter(
    (item) => !item.pinned && !item.favorite && !item.archived
  );

  return [
    { label: "Fixados", items: pinned },
    { label: "Favoritos", items: favorites },
    { label: "Recentes", items: recent },
  ].filter((section) => section.items.length > 0);
}

function matchesHistoryFilter(
  conversation: Conversation,
  filter: HistoryFilter
): boolean {
  if (filter === "archived") return Boolean(conversation.archived);
  if (conversation.archived) return false;
  if (filter === "pinned") return Boolean(conversation.pinned);
  if (filter === "favorite") return Boolean(conversation.favorite);
  if (filter === "tagged") return (conversation.tags?.length ?? 0) > 0;
  return true;
}

function getConversationSearchText(conversation: Conversation): string {
  return [
    conversation.title,
    conversation.summary,
    ...(conversation.tags ?? []),
    ...(conversation.messages ?? []).slice(0, 4).map((message) => message.text),
  ]
    .join(" ")
    .toLowerCase();
}

function normalizeTag(value: string): string {
  return value
    .replace(/^#/, "")
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}_-]/gu, "")
    .toLowerCase()
    .slice(0, 24);
}

function normalizeTags(values: string[]): string[] {
  return Array.from(new Set(values.map(normalizeTag).filter(Boolean))).slice(
    0,
    8
  );
}

function formatDateTime(time: number): string {
  return new Date(time).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatFileSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function fileKindLabel(type: string): string {
  if (type.startsWith("image/")) return "Imagem";
  if (type === "application/pdf") return "PDF";
  if (type.startsWith("text/")) return "Texto";
  if (type.includes("spreadsheet") || type.includes("excel")) return "Planilha";
  if (type.includes("presentation")) return "Apresentação";
  if (type.includes("word") || type.includes("document")) return "Documento";
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
