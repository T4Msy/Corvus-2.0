"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  Archive,
  ArchiveRestore,
  Check,
  CheckSquare,
  ChevronDown,
  ChevronUp,
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
  Sparkles,
  Square,
  Star,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import { ChatInput } from "@/components/ChatInput";
import { ChatMessages } from "@/components/ChatMessages";
import { CommandPalette } from "@/components/CommandPalette";
import { CustomLettersPanel } from "@/components/CustomLettersPanel";
import { LoginScreen } from "@/components/LoginScreen";
import { SettingsDialog } from "@/components/SettingsDialog";
import { ShortcutsDialog } from "@/components/ShortcutsDialog";
import { useToast } from "@/components/ToastProvider";
import { useAuth } from "@/hooks/useAuth";
import { useChat } from "@/hooks/useChat";
import { useConversationAttachments } from "@/hooks/useConversationAttachments";
import { useConversations } from "@/hooks/useConversations";
import { useMessageSearch } from "@/hooks/useMessageSearch";
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
  const [customLettersOpen, setCustomLettersOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<null | import("@/lib/types").Conversation[]>(null);
  const [searchPending, setSearchPending] = useState(false);
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>("all");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [tagEditorId, setTagEditorId] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState("");
  const [detailsSummary, setDetailsSummary] = useState("");
  const [detailsTagInput, setDetailsTagInput] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmDeleteAllOpen, setConfirmDeleteAllOpen] = useState(false);
  const [topbarEditing, setTopbarEditing] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [sendBusy, setSendBusy] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [seenAt, setSeenAt] = useState<Record<string, number>>({});
  const seenInitializedRef = useRef(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const loadedConversationRef = useRef<string | null>(null);
  const creatingConversationRef = useRef<Promise<Conversation> | null>(null);
  const messageSearchInputRef = useRef<HTMLInputElement>(null);
  const sendBusyRef = useRef(false);
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

  const chatAttachments = useMemo(
    () =>
      attachments.activeAttachments.map((attachment) => ({
        id: attachment.id,
        path: attachment.path,
        name: attachment.name,
        type: attachment.type,
        size: attachment.size,
      })),
    [attachments.activeAttachments]
  );

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
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f" && !isEditing) {
        event.preventDefault();
        messageSearchInputRef.current?.focus();
        return;
      }
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

  // Debounced full-text search via API (authed + online + query >= 2 chars)
  useEffect(() => {
    const term = query.trim();
    if (term.length < 2 || auth.status !== "authed" || !conversations.online) {
      setSearchResults(null);
      setSearchPending(false);
      return;
    }
    setSearchPending(true);
    const id = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/conversations/search?q=${encodeURIComponent(term)}`,
          {
            headers: auth.accessToken
              ? { Authorization: `Bearer ${auth.accessToken}` }
              : {},
          }
        );
        if (!res.ok) { setSearchResults(null); return; }
        const data = (await res.json()) as { ok: boolean; conversations: import("@/lib/types").Conversation[] };
        setSearchResults(data.ok ? data.conversations : null);
      } catch {
        setSearchResults(null);
      } finally {
        setSearchPending(false);
      }
    }, 300);
    return () => { clearTimeout(id); setSearchPending(false); };
  }, [query, auth.status, auth.accessToken, conversations.online]);

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
    if (searchResults !== null) {
      return historyFilter === "all"
        ? searchResults
        : searchResults.filter((item) => matchesHistoryFilter(item, historyFilter));
    }
    const term = query.trim().toLowerCase();
    return conversations.conversations.filter((item) => {
      if (!matchesHistoryFilter(item, historyFilter)) return false;
      if (!term) return true;
      return getConversationSearchText(item).includes(term);
    });
  }, [conversations.conversations, historyFilter, query, searchResults]);

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

  const messageSearch = useMessageSearch(chat.messages);

  const ensureConversationForSend = useCallback(async (): Promise<Conversation> => {
    if (conversations.activeConversation) return conversations.activeConversation;
    if (creatingConversationRef.current) return creatingConversationRef.current;

    const creation = conversations
      .createConversation()
      .then((conversation) => {
        loadedConversationRef.current = conversation.id;
        chat.setHistory([]);
        return conversation;
      })
      .finally(() => {
        creatingConversationRef.current = null;
      });

    creatingConversationRef.current = creation;
    return creation;
  }, [chat, conversations]);

  const send = useCallback(
    async (text: string) => {
      if (sendBusyRef.current) return;
      if (!conversations.online) {
        toast.push({
          tone: "warning",
          title: "Você está offline",
          message: "Conecte novamente para enviar ao Corvus.",
        });
        return;
      }
      sendBusyRef.current = true;
      setSendBusy(true);
      try {
        const conversation = await ensureConversationForSend();
        const activeAttachments = attachments.activeAttachments;
        const messageText =
          text.trim() ||
          (activeAttachments.some((attachment) =>
            attachment.type.startsWith("image/")
          )
            ? "Analise a imagem anexada."
            : "Analise o arquivo anexado.");

        const sent = await chat.send({
          text: messageText,
          mode,
          conversationId: conversation.id,
          sessionId: conversation.sessionId,
          userId: auth.userId,
          userContext,
          attachments: chatAttachments,
          messageAttachments: activeAttachments,
          accessToken: auth.accessToken,
          onUserMessage: (message) =>
            conversations.persistMessage(conversation.id, message),
          onAssistantMessage: async (message, response) => {
            await conversations.persistMessage(conversation.id, message);
            applyResponseMeta(conversation, response.meta);
          },
        });
        if (sent && activeAttachments.length > 0) {
          attachments.clearConversation(conversation.id);
        }
      } finally {
        sendBusyRef.current = false;
        setSendBusy(false);
      }
    },
    [
      auth.accessToken,
      auth.userId,
      attachments,
      chatAttachments,
      chat,
      conversations,
      ensureConversationForSend,
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
    conversations.clearActiveConversation();
    loadedConversationRef.current = null;
    messageSearch.clear();
    chat.setHistory([]);
    setDetailsOpen(false);
    setTopbarEditing(false);
    setOpenMenuId(null);
    setTagEditorId(null);
    setConfirmDeleteId(null);
    setConfirmDeleteAllOpen(false);
    setSelectionMode(false);
    setSelectedIds(new Set());
    setSidebarOpen(false);
    setCommandOpen(false);
  }, [chat, conversations, messageSearch]);

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

  function applyResponseMeta(
    conversation: Conversation,
    meta: Record<string, unknown> | undefined
  ) {
      if (!meta) return;

      const patch: Parameters<typeof conversations.updateConversation>[1] = {};
      const summary =
        typeof meta.summaryCandidate === "string"
          ? meta.summaryCandidate.trim()
          : "";
      const tags = Array.isArray(meta.tags)
        ? normalizeTags(
            meta.tags.filter((tag): tag is string => typeof tag === "string")
          )
        : [];

      if (summary && summary !== (conversation.summary ?? "")) {
        patch.summary = summary.slice(0, 1_200);
      }
      if (tags.length > 0) {
        patch.tags = normalizeTags([...(conversation.tags ?? []), ...tags]);
      }
      if (Object.keys(patch).length > 0) {
        updateConversation(conversation.id, patch);
      }
  }

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

      loadedConversationRef.current = null;
      chat.setHistory([]);
      messageSearch.clear();
    },
    [chat, conversations, messageSearch]
  );

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }, []);

  const handleBulkArchive = useCallback(async () => {
    const ids = Array.from(selectedIds);
    exitSelectionMode();
    await Promise.all(ids.map((id) => conversations.updateConversation(id, { archived: true })));
  }, [selectedIds, conversations, exitSelectionMode]);

  const handleBulkDelete = useCallback(async () => {
    const ids = Array.from(selectedIds);
    exitSelectionMode();
    const nextId = await conversations.batchDeleteConversations(ids);
    if (ids.includes(conversations.activeConversationId ?? "")) {
      if (nextId) {
        loadedConversationRef.current = nextId;
        const history = await conversations.selectConversation(nextId);
        chat.setHistory(history);
      } else {
        loadedConversationRef.current = null;
        chat.setHistory([]);
        messageSearch.clear();
      }
    }
  }, [selectedIds, conversations, exitSelectionMode, chat, messageSearch]);

  const handleDeleteAllConversations = useCallback(async () => {
    setConfirmDeleteAllOpen(false);
    exitSelectionMode();
    setOpenMenuId(null);
    setTagEditorId(null);
    setConfirmDeleteId(null);
    setDetailsOpen(false);
    setQuery("");
    setSearchResults(null);
    setSeenAt({});
    loadedConversationRef.current = null;
    await conversations.deleteAllConversations();
    chat.setHistory([]);
    messageSearch.clear();
    toast.push({
      tone: "success",
      title: "Conversas apagadas",
      message: "O histórico local foi limpo.",
    });
  }, [chat, conversations, exitSelectionMode, messageSearch, toast]);

  const handleEditMessage = useCallback(
    async (originalCreatedAt: number, newText: string) => {
      const active = conversations.activeConversation;
      if (!active) return;

      // Update DB: patch message text + remove all messages after it
      if (auth.status === "authed" && conversations.online && auth.accessToken) {
        const base = `/api/conversations/${active.id}/messages`;
        await Promise.all([
          fetch(base, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${auth.accessToken}`,
            },
            body: JSON.stringify({ createdAt: originalCreatedAt, text: newText }),
          }),
          fetch(`${base}?from=${originalCreatedAt + 1}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${auth.accessToken}` },
          }),
        ]).catch(() => undefined);
      }

      await chat.editAndResend(originalCreatedAt, newText, {
        mode,
        conversationId: active.id,
        sessionId: active.sessionId,
        userId: auth.userId,
        userContext,
        accessToken: auth.accessToken,
        onAssistantMessage: (message) =>
          conversations.persistMessage(active.id, message),
      });
    },
    [
      auth.accessToken,
      auth.status,
      auth.userId,
      chat,
      conversations,
      mode,
      userContext,
    ]
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

      const conversation = await ensureConversationForSend();
      const attachment = await attachments.upload(file, conversation.id);
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
      conversations,
      ensureConversationForSend,
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

  const emptyHome = chat.messages.length === 0 && !chat.pending && !historyLoading;
  const homeHeadline =
    auth.status === "guest" ? "Corvus está pronto." : `${userName} está de volta!`;

  return (
    <div
      className={`corvus-shell${focusMode ? " focus-mode" : ""}${
        emptyHome ? " empty-home" : ""
      }`}
    >
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

      <aside className={`corvus-sidebar rebuilt-sidebar${sidebarOpen ? " open" : ""}`}>
        <div className="sidebar-top-panel">
          <div className="sidebar-brand rebuilt-brand">
            <span className="brand-mark">
              <Image src={logoSrc} alt="Corvus" width={26} height={26} priority />
            </span>
            <span className="brand-copy">
              <strong>Corvus</strong>
              <small>MSY private intelligence</small>
            </span>
            <span className="brand-badge">V3</span>
          </div>
          <button
            type="button"
            className="icon-button mobile-only"
            aria-label="Fechar menu"
            onClick={() => setSidebarOpen(false)}
          >
            <X size={16} />
          </button>

          <div className="sidebar-primary-actions">
            <button
              type="button"
              className="new-chat-button"
              onClick={createConversation}
            >
              <Plus size={15} />
              <span>
                <strong>Nova consulta</strong>
                <small>Rascunho privado</small>
              </span>
            </button>

            <button
              type="button"
              className="sidebar-command-button"
              onClick={() => setCommandOpen(true)}
            >
              <Command size={14} />
              <span>Comandos</span>
              <kbd>Ctrl K</kbd>
            </button>

            <button
              type="button"
              className="sidebar-command-button sidebar-custom-letters-button"
              onClick={() => {
                setCustomLettersOpen(true);
                setSidebarOpen(false);
              }}
            >
              <Sparkles size={14} />
              <span>Letras</span>
              <kbd>MSY</kbd>
            </button>
          </div>
        </div>

        <label className="sidebar-search" htmlFor="conversation-search">
          <Search size={14} />
          <input
            id="conversation-search"
            type="search"
            placeholder="Buscar título, mensagens, tags…"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              if (!event.target.value.trim()) setSearchResults(null);
            }}
          />
          {searchPending && <span className="search-pending-dot" aria-hidden="true" />}
        </label>

        <div className="history-filter-row" aria-label="Filtros do histórico">
          {HISTORY_FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              className={historyFilter === filter.value ? "active" : ""}
              onClick={() => { setHistoryFilter(filter.value); exitSelectionMode(); }}
            >
              <span>{filter.label}</span>
              <small>{historyFilterCounts[filter.value]}</small>
            </button>
          ))}
        </div>

        <div className="sidebar-tools-row" aria-label="Ferramentas do histórico">
          <button
            type="button"
            className={`select-toggle-btn${selectionMode ? " active" : ""}`}
            title={selectionMode ? "Cancelar seleção" : "Selecionar conversas"}
            aria-label={selectionMode ? "Cancelar seleção" : "Selecionar conversas"}
            onClick={() => { selectionMode ? exitSelectionMode() : setSelectionMode(true); }}
          >
            <CheckSquare size={12} />
            <span>{selectionMode ? "Cancelar" : "Selecionar"}</span>
          </button>
          <button
            type="button"
            className="delete-all-conversations-button"
            disabled={conversations.conversations.length === 0}
            onClick={() => setConfirmDeleteAllOpen(true)}
            title="Apagar todas as conversas"
            aria-label="Apagar todas as conversas"
          >
            <Trash2 size={13} />
            <span>Limpar histórico</span>
          </button>
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
                    : "Envie uma mensagem para criar a primeira conversa"}
              </span>
            </div>
          )}

          <AnimatePresence>
            {selectionMode && selectedIds.size > 0 && (
              <motion.div
                className="bulk-action-bar"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.15 }}
              >
                <span>{selectedIds.size} selecionada{selectedIds.size > 1 ? "s" : ""}</span>
                <div className="bulk-action-buttons">
                  <button type="button" onClick={() => void handleBulkArchive()}>
                    <Archive size={13} />
                    <span>Arquivar</span>
                  </button>
                  <button type="button" className="danger" onClick={() => void handleBulkDelete()}>
                    <Trash2 size={13} />
                    <span>Excluir</span>
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {conversationSections.map((section) => (
            <div className="conversation-group" key={section.label}>
              <div className="conversation-group-heading">
                <p>{section.label}</p>
                {section.label === "Recentes" && (
                  <button
                    type="button"
                    className="conversation-clear-all"
                    title="Apagar todas as conversas"
                    aria-label="Apagar todas as conversas"
                    disabled={conversations.conversations.length === 0}
                    onClick={() => setConfirmDeleteAllOpen(true)}
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
              {section.items.map((conversation) => {
                const active =
                  conversation.id === conversations.activeConversationId;
                const editing = renameId === conversation.id;
                const confirming = confirmDeleteId === conversation.id;
                const menuOpen = openMenuId === conversation.id;
                const hasUnread =
                  !active &&
                  conversation.updatedAt > (seenAt[conversation.id] ?? conversation.updatedAt);
                const isSelected = selectedIds.has(conversation.id);

                return (
                  <div
                    key={conversation.id}
                    data-conversation-id={conversation.id}
                    className={`conversation-item${active ? " active" : ""}${
                      menuOpen ? " menu-open" : ""
                    }${hasUnread ? " has-unread" : ""}${selectionMode ? " selection-mode" : ""}${isSelected ? " selected" : ""}`}
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
                        onClick={() =>
                          selectionMode
                            ? toggleSelection(conversation.id)
                            : void selectConversation(conversation.id)
                        }
                      >
                        <span className="conversation-icon">
                          {selectionMode ? (
                            isSelected ? <CheckSquare size={14} /> : <Square size={14} />
                          ) : conversation.pinned ? (
                            <Pin size={14} />
                          ) : conversation.favorite ? (
                            <Star size={14} />
                          ) : conversation.archived ? (
                            <Archive size={14} />
                          ) : (
                            <MessageSquare size={14} />
                          )}
                        </span>
                        <span className="conversation-copy">
                          <span className="conversation-title">{conversation.title}</span>
                          <span className="conversation-meta">
                            {(conversation.tags ?? []).length > 0
                              ? (conversation.tags ?? []).slice(0, 2).map((tag) => `#${tag}`).join(" ")
                              : conversation.summary || "Conversa MSY"}
                          </span>
                        </span>
                        {!selectionMode && (
                          <small className="conversation-time">
                            {formatRelative(conversation.updatedAt)}
                          </small>
                        )}
                      </button>
                    )}

                    {!editing && !selectionMode && (
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
                          role="menu"
                          aria-label={`Opções de ${conversation.title}`}
                          initial={{ opacity: 0, y: 4, scale: 0.98 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 4, scale: 0.98 }}
                          transition={{ duration: 0.12 }}
                        >
                          <div className="conversation-menu-header">
                            <span>Opções</span>
                            <small>{formatRelative(conversation.updatedAt)}</small>
                          </div>
                          <div className="conversation-menu-section">
                            <button
                              type="button"
                              role="menuitem"
                              className={conversation.pinned ? "is-active" : undefined}
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
                              role="menuitem"
                              className={conversation.favorite ? "is-active" : undefined}
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
                          </div>
                          <div className="conversation-menu-section">
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => startRename(conversation)}
                            >
                              <Pencil size={13} />
                              <span>Renomear</span>
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => openTagEditor(conversation)}
                            >
                              <Tag size={13} />
                              <span>Tags</span>
                            </button>
                            <button
                              type="button"
                              role="menuitem"
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
                              role="menuitem"
                              className={conversation.archived ? "is-active" : undefined}
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
                          </div>
                          <div className="conversation-menu-section danger-zone">
                            <button
                              type="button"
                              role="menuitem"
                              className="danger"
                              onClick={() => {
                                setConfirmDeleteId(conversation.id);
                                setOpenMenuId(null);
                              }}
                            >
                              <Trash2 size={13} />
                              <span>Excluir</span>
                            </button>
                          </div>
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

      <section className="workspace rebuilt-workspace">
        <header className="topbar rebuilt-topbar">
          <div className="topbar-left">
            <button
              type="button"
              className="icon-button desktop-hidden"
              title="Menu"
              aria-label="Abrir menu"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu size={18} />
            </button>

            <div className="topbar-conversation">
              <span className="topbar-kicker">Workspace ativo</span>
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
                    {conversations.activeConversation?.title ?? "Novo chat"}
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="topbar-status-board" aria-label="Estado da sessão">
            <span className="topbar-mode">
              {mode === "fenrir" ? "Fenrir · criativo" : "Corvus · preciso"}
            </span>
            <SyncPill status={conversations.syncStatus} />
          </div>

          <div className="topbar-right">
            <label className="conversation-message-search" htmlFor="message-search">
              <Search size={14} />
              <input
                ref={messageSearchInputRef}
                id="message-search"
                type="search"
                placeholder="Buscar na conversa"
                value={messageSearch.query}
                disabled={chat.messages.length === 0}
                onChange={(event) => messageSearch.setQuery(event.target.value)}
              />
              {messageSearch.query && (
                <>
                  <span className="message-search-count">
                    {messageSearch.total > 0
                      ? `${messageSearch.activeIndex + 1}/${messageSearch.total}`
                      : "0/0"}
                  </span>
                  <button
                    type="button"
                    title="Resultado anterior"
                    aria-label="Resultado anterior"
                    disabled={messageSearch.total === 0}
                    onClick={messageSearch.previous}
                  >
                    <ChevronUp size={13} />
                  </button>
                  <button
                    type="button"
                    title="Próximo resultado"
                    aria-label="Próximo resultado"
                    disabled={messageSearch.total === 0}
                    onClick={messageSearch.next}
                  >
                    <ChevronDown size={13} />
                  </button>
                  <button
                    type="button"
                    title="Limpar busca"
                    aria-label="Limpar busca"
                    onClick={messageSearch.clear}
                  >
                    <X size={13} />
                  </button>
                </>
              )}
            </label>

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
              title="Letras personalizadas"
              aria-label="Abrir letras personalizadas"
              onClick={() => setCustomLettersOpen(true)}
            >
              <Sparkles size={17} />
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
              disabled={!conversations.activeConversation}
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
          </div>
        </header>

        {auth.error && auth.status === "authed" && (
          <div
            className="persistence-banner"
            role="alert"
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
            showWelcome={emptyHome}
            welcomeName={homeHeadline}
            onSuggest={requestSend}
            onEditMessage={
              auth.status === "authed" || auth.status === "guest"
                ? handleEditMessage
                : undefined
            }
            searchQuery={messageSearch.normalizedQuery}
            searchMatches={messageSearch.matches}
            activeSearchMatchId={messageSearch.activeMatch?.id ?? null}
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
                    ? "Login necessario"
                    : "Anexo indisponivel",
                message:
                  auth.status === "guest"
                    ? "Entre com sua conta para anexar arquivos."
                    : "Reconecte para anexar arquivos.",
              });
            }}
            disabled={chat.pending || sendBusy}
            attachmentDisabled={
              auth.status !== "authed" ||
              !auth.supabaseReady ||
              !conversations.online
            }
            attachmentBusy={attachments.busy}
            attachments={attachments.activeAttachments}
            onOpenAttachment={(attachment) => void openAttachment(attachment)}
            onRemoveAttachment={(attachment) => void removeAttachment(attachment)}
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
        onOpenCustomLetters={() => setCustomLettersOpen(true)}
        onToggleFocus={() => setFocusMode((current) => !current)}
        onQuickPrompt={requestSend}
        historyFilter={historyFilter}
        onSetHistoryFilter={setHistoryFilter}
        onSearchTag={searchTag}
        onUpdateActiveConversation={updateActiveConversation}
      />

      <CustomLettersPanel
        open={customLettersOpen}
        onClose={() => setCustomLettersOpen(false)}
      />

      <AnimatePresence>
        {detailsOpen && (
          <motion.aside
            className="conversation-details rebuilt-details"
            role="dialog"
            aria-modal="true"
            aria-label="Detalhes da conversa"
            initial={{ opacity: 0, x: 18 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 18 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="details-header">
              <div className="details-title-block">
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
                <div className="details-stat-row" aria-label="Resumo da conversa">
                  <span>
                    <strong>{chat.messages.length}</strong>
                    <small>mensagens</small>
                  </span>
                  <span>
                    <strong>{attachments.activeAttachments.length}</strong>
                    <small>arquivos</small>
                  </span>
                  <span>
                    <strong>{(conversations.activeConversation.tags ?? []).length}</strong>
                    <small>tags</small>
                  </span>
                </div>

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
                          <AttachmentThumb attachment={attachment} />
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

      <AnimatePresence>
        {confirmDeleteAllOpen && (
          <motion.div
            className="dialog-backdrop"
            role="presentation"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={() => setConfirmDeleteAllOpen(false)}
          >
            <motion.div
              className="dialog-panel danger-dialog"
              role="dialog"
              aria-modal="true"
              aria-label="Apagar todas as conversas"
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              onClick={(event) => event.stopPropagation()}
            >
              <header className="dialog-header">
                <div>
                  <h2>Apagar todas as conversas?</h2>
                  <p>
                    {conversations.conversations.length} conversa
                    {conversations.conversations.length === 1 ? "" : "s"} serão removidas
                    deste histórico.
                  </p>
                </div>
                <button
                  type="button"
                  className="dialog-close"
                  aria-label="Fechar"
                  onClick={() => setConfirmDeleteAllOpen(false)}
                >
                  <X size={18} />
                </button>
              </header>
              <div className="dialog-section">
                <div className="dialog-alert">
                  <AlertCircle size={15} />
                  <span>Esta ação limpa a lista, mensagens carregadas e estado local.</span>
                </div>
                <div className="dialog-field-actions">
                  <button
                    type="button"
                    className="secondary-action"
                    onClick={() => setConfirmDeleteAllOpen(false)}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="danger-action"
                    onClick={() => void handleDeleteAllConversations()}
                  >
                    Apagar todas
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
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

function AttachmentThumb({ attachment }: { attachment: ConversationAttachment }) {
  const [imgFailed, setImgFailed] = useState(false);
  const isImage = attachment.type.startsWith("image/");

  if (isImage && attachment.url && !imgFailed) {
    return (
      /* eslint-disable-next-line @next/next/no-img-element */
      <img
        src={attachment.url}
        alt={attachment.name}
        className="attachment-thumb"
        onError={() => setImgFailed(true)}
      />
    );
  }

  return (
    <span className="attachment-icon" aria-hidden="true">
      <FileText size={16} />
    </span>
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
