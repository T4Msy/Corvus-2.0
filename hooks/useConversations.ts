"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createLocalConversation,
  deriveConversationTitle,
} from "@/integrations/supabase/conversations";
import type { ChatMessage, Conversation, SyncStatus } from "@/lib/types";

type AuthLike = {
  status: "loading" | "anon" | "authed" | "guest";
  userId: string;
  supabaseReady: boolean;
  accessToken?: string | null;
};

const LOCAL_KEY = "corvus_guest_conversations";
const DEFAULT_TITLE = "Nova conversa";

type ConversationPatch = Partial<
  Pick<
    Conversation,
    "title" | "pinned" | "favorite" | "tags" | "summary" | "archived"
  >
>;

export function useConversations(auth: AuthLike) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(
    null
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const [lastSyncError, setLastSyncError] = useState<string | null>(null);
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine
  );
  const conversationsRef = useRef<Conversation[]>([]);
  const lastSyncActionRef = useRef<(() => Promise<void>) | null>(null);
  // IDs de conversas criadas NESTA sessão (no fluxo de envio). Suas mensagens são
  // otimistas em chat.messages; o histórico do servidor ainda está vazio/parcial,
  // então não devemos buscá-lo automaticamente (apagaria a 1ª mensagem do usuário).
  const sessionCreatedIdsRef = useRef<Set<string>>(new Set());

  const activeConversation = useMemo(
    () => conversations.find((item) => item.id === activeConversationId) ?? null,
    [activeConversationId, conversations]
  );

  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  useEffect(() => {
    function handleOnline() {
      setOnline(true);
      setSyncStatus((current) => (current === "offline" ? "idle" : current));
    }
    function handleOffline() {
      setOnline(false);
      setSyncStatus("offline");
      setLastSyncError("Sem conexão. As ações locais continuam visíveis.");
    }
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const failSync = useCallback((message: string, status: SyncStatus = "error") => {
    setError(message);
    setLastSyncError(message);
    setSyncStatus(status);
  }, []);

  const persistLocal = useCallback((next: Conversation[]) => {
    try {
      window.localStorage.setItem(LOCAL_KEY, JSON.stringify(next));
    } catch {
      /* localStorage indisponivel */
    }
  }, []);

  const clearLocal = useCallback(() => {
    try {
      window.localStorage.removeItem(LOCAL_KEY);
    } catch {
      /* localStorage indisponivel */
    }
  }, []);

  const clearActiveConversation = useCallback(() => {
    setActiveConversationId(null);
    setError(null);
  }, []);

  const refresh = useCallback(async () => {
    if (auth.status === "loading" || auth.status === "anon") {
      setConversations([]);
      conversationsRef.current = [];
      setActiveConversationId(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    setLastSyncError(null);
    setSyncStatus("idle");
    try {
      if (auth.status === "authed" && auth.supabaseReady) {
        if (!online) {
          failSync("Sem conexão para carregar conversas.", "offline");
          return;
        }
        const result = await conversationsApi<{
          conversations: Conversation[];
        }>("/api/conversations", auth.accessToken);
        const remote = result.conversations;
        conversationsRef.current = remote;
        setConversations(remote);
        setActiveConversationId((current) =>
          current && remote.some((item) => item.id === current) ? current : null
        );
        setLastSyncError(null);
        return;
      }

      const local = readLocalConversations();
      conversationsRef.current = local;
      setConversations(local);
      setActiveConversationId((current) =>
        current && local.some((item) => item.id === current) ? current : null
      );
      setLastSyncError(null);
    } catch (err) {
      failSync(
        err instanceof Error
          ? err.message
          : "Nao foi possivel carregar conversas."
      );
      setConversations([]);
      conversationsRef.current = [];
      setActiveConversationId(null);
    } finally {
      setLoading(false);
    }
  }, [auth.accessToken, auth.status, auth.supabaseReady, failSync, online]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const isSessionCreated = useCallback(
    (id: string) => sessionCreatedIdsRef.current.has(id),
    []
  );

  const createConversation = useCallback(async (): Promise<Conversation> => {
    const conversation = createLocalConversation();
    sessionCreatedIdsRef.current.add(conversation.id);
    setSyncStatus(
      auth.status === "authed" && auth.supabaseReady
        ? online
          ? "saving"
          : "offline"
        : "saved"
    );
    setConversations((current) => {
      const next = [conversation, ...current];
      conversationsRef.current = next;
      if (auth.status === "guest") persistLocal(next);
      return next;
    });
    setActiveConversationId(conversation.id);

    if (auth.status === "authed" && auth.supabaseReady) {
      const remoteAction = async () => {
        await conversationsApi("/api/conversations", auth.accessToken, {
          method: "POST",
          body: conversation,
        });
      };
      lastSyncActionRef.current = remoteAction;
      if (!online) {
        failSync("Conversa criada localmente. Sincronize quando voltar online.", "offline");
        return conversation;
      }
      try {
        await remoteAction();
        lastSyncActionRef.current = null;
        setLastSyncError(null);
        setSyncStatus("saved");
      } catch (err) {
        failSync(
          err instanceof Error
            ? err.message
            : "Nao foi possivel criar conversa no Supabase."
        );
      }
    }

    return conversation;
  }, [
    auth.accessToken,
    auth.status,
    auth.supabaseReady,
    failSync,
    online,
    persistLocal,
  ]);

  const selectConversation = useCallback(
    async (conversationId: string): Promise<ChatMessage[]> => {
      setActiveConversationId(conversationId);
      setError(null);

      try {
        if (auth.status === "authed" && auth.supabaseReady) {
          if (!online) {
            failSync("Sem conexão. Mostrando o histórico local disponível.", "offline");
            return (
              conversations.find((item) => item.id === conversationId)?.messages ??
              []
            );
          }
          const result = await conversationsApi<{ messages: ChatMessage[] }>(
            `/api/conversations/${encodeURIComponent(conversationId)}/messages`,
            auth.accessToken
          );
          setConversations((current) => {
            const next = current.map((item) =>
              item.id === conversationId
                ? { ...item, messages: result.messages }
                : item
            );
            conversationsRef.current = next;
            return next;
          });
          return result.messages;
        }

        return (
          conversations.find((item) => item.id === conversationId)?.messages ??
          []
        );
      } catch (err) {
        failSync(
          err instanceof Error
            ? err.message
            : "Nao foi possivel carregar mensagens."
        );
        return [];
      }
    },
    [
      auth.accessToken,
      auth.status,
      auth.supabaseReady,
      conversations,
      failSync,
      online,
    ]
  );

  const persistMessage = useCallback(
    async (conversationId: string, message: ChatMessage): Promise<void> => {
      const now = Date.now();
      setSyncStatus(
        auth.status === "authed" && auth.supabaseReady
          ? online
            ? "saving"
            : "offline"
          : "saved"
      );
      const currentConversation = conversationsRef.current.find(
        (item) => item.id === conversationId
      );
      const titleForPersist =
        currentConversation?.title === DEFAULT_TITLE && message.role === "user"
          ? deriveConversationTitle(message.text)
          : currentConversation?.title || DEFAULT_TITLE;
      const summaryForPersist =
        currentConversation?.summary ||
        (message.role === "corvus" ? deriveConversationSummary(message.text) : "");
      const conversationForPersist: Conversation = {
        ...(currentConversation ?? createLocalConversation()),
        id: conversationId,
        title: titleForPersist,
        summary: summaryForPersist,
        updatedAt: now,
      };

      setConversations((current) => {
        const next = current
          .map((item) => {
            if (item.id !== conversationId) return item;
            return {
              ...item,
              title: titleForPersist,
              summary: item.summary || summaryForPersist,
              updatedAt: now,
              messages:
                auth.status === "guest"
                  ? [...item.messages, message]
                  : item.messages,
            };
          })
          .sort((a, b) => b.updatedAt - a.updatedAt);

        conversationsRef.current = next;
        if (auth.status === "guest") persistLocal(next);
        return next;
      });

      if (auth.status !== "authed" || !auth.supabaseReady) return;

      const remoteAction = async () => {
        await conversationsApi("/api/conversations", auth.accessToken, {
          method: "POST",
          body: conversationForPersist,
        });
        await conversationsApi(
          `/api/conversations/${encodeURIComponent(conversationId)}/messages`,
          auth.accessToken,
          {
            method: "POST",
            body: {
              conversation: conversationForPersist,
              message,
              title: titleForPersist,
              updatedAt: now,
            },
          }
        );
      };
      lastSyncActionRef.current = remoteAction;
      if (!online) {
        failSync("Mensagem visível localmente. Sincronize quando voltar online.", "offline");
        return;
      }

      try {
        await remoteAction();
        lastSyncActionRef.current = null;
        setLastSyncError(null);
        setSyncStatus("saved");
      } catch (err) {
        failSync(
          err instanceof Error
            ? err.message
            : "Nao foi possivel persistir mensagem."
        );
      }
    },
    [
      auth.accessToken,
      auth.status,
      auth.supabaseReady,
      failSync,
      online,
      persistLocal,
    ]
  );

  const updateConversation = useCallback(
    async (
      conversationId: string,
      patch: ConversationPatch
    ): Promise<void> => {
      const normalizedPatch: ConversationPatch = {};
      if (typeof patch.title === "string") {
        const title = patch.title.trim();
        if (!title) return;
        normalizedPatch.title = title;
      }
      if (typeof patch.pinned === "boolean") normalizedPatch.pinned = patch.pinned;
      if (typeof patch.favorite === "boolean") {
        normalizedPatch.favorite = patch.favorite;
      }
      if (Array.isArray(patch.tags)) {
        normalizedPatch.tags = patch.tags
          .filter((item) => typeof item === "string")
          .map((item) => item.trim())
          .filter(Boolean)
          .slice(0, 8);
      }
      if (typeof patch.summary === "string") {
        normalizedPatch.summary = patch.summary.trim();
      }
      if (typeof patch.archived === "boolean") {
        normalizedPatch.archived = patch.archived;
      }

      if (Object.keys(normalizedPatch).length === 0) return;

      const updatedAt = Date.now();
      setError(null);
      setLastSyncError(null);
      setSyncStatus(
        auth.status === "authed" && auth.supabaseReady
          ? online
            ? "saving"
            : "offline"
          : "saved"
      );

      setConversations((current) => {
        const next = current
          .map((item) =>
            item.id === conversationId
              ? { ...item, ...normalizedPatch, updatedAt }
              : item
          )
          .sort((a, b) => b.updatedAt - a.updatedAt);

        conversationsRef.current = next;
        if (auth.status === "guest") persistLocal(next);
        return next;
      });

      if (auth.status !== "authed" || !auth.supabaseReady) return;

      const remoteAction = async () => {
        await conversationsApi(
          `/api/conversations/${encodeURIComponent(conversationId)}`,
          auth.accessToken,
          {
            method: "PATCH",
            body: {
              ...normalizedPatch,
              updatedAt,
            },
          }
        );
      };
      lastSyncActionRef.current = remoteAction;
      if (!online) {
        failSync("Alteração aplicada localmente. Sincronize quando voltar online.", "offline");
        return;
      }

      try {
        await remoteAction();
        lastSyncActionRef.current = null;
        setLastSyncError(null);
        setSyncStatus("saved");
      } catch (err) {
        failSync(
          err instanceof Error
            ? err.message
            : "Nao foi possivel atualizar conversa."
        );
      }
    },
    [
      auth.accessToken,
      auth.status,
      auth.supabaseReady,
      failSync,
      online,
      persistLocal,
    ]
  );

  const deleteConversation = useCallback(
    async (conversationId: string): Promise<string | null> => {
      const next = conversations.filter((item) => item.id !== conversationId);
      const nextActive =
        activeConversationId === conversationId
          ? next[0]?.id ?? null
          : activeConversationId;
      setConversations(next);
      conversationsRef.current = next;
      setActiveConversationId(nextActive);
      if (auth.status === "guest") persistLocal(next);
      setSyncStatus(
        auth.status === "authed" && auth.supabaseReady
          ? online
            ? "saving"
            : "offline"
          : "saved"
      );

      if (auth.status === "authed" && auth.supabaseReady) {
        const remoteAction = async () => {
          await conversationsApi(
            `/api/conversations/${encodeURIComponent(conversationId)}`,
            auth.accessToken,
            { method: "DELETE" }
          );
        };
        lastSyncActionRef.current = remoteAction;
        if (!online) {
          failSync("Conversa removida localmente. Sincronize quando voltar online.", "offline");
          return nextActive;
        }
        try {
          await remoteAction();
          lastSyncActionRef.current = null;
          setLastSyncError(null);
          setSyncStatus("saved");
        } catch (err) {
          failSync(
            err instanceof Error
              ? err.message
              : "Nao foi possivel excluir conversa."
          );
        }
      }

      return nextActive;
    },
    [
      activeConversationId,
      auth.accessToken,
      auth.status,
      auth.supabaseReady,
      conversations,
      failSync,
      online,
      persistLocal,
    ]
  );

  const retrySync = useCallback(async (): Promise<void> => {
    if (auth.status !== "authed" || !auth.supabaseReady) {
      await refresh();
      return;
    }
    if (!online) {
      failSync("Ainda sem conexão para sincronizar.", "offline");
      return;
    }

    setSyncStatus("saving");
    setError(null);
    setLastSyncError(null);
    try {
      if (lastSyncActionRef.current) {
        await lastSyncActionRef.current();
        lastSyncActionRef.current = null;
      }
      await refresh();
      setSyncStatus("saved");
    } catch (err) {
      failSync(
        err instanceof Error ? err.message : "Nao foi possivel sincronizar."
      );
    }
  }, [auth.status, auth.supabaseReady, failSync, online, refresh]);

  const batchDeleteConversations = useCallback(
    async (ids: string[]): Promise<string | null> => {
      if (ids.length === 0) return activeConversationId;

      const idSet = new Set(ids);
      const next = conversationsRef.current.filter((item) => !idSet.has(item.id));
      const activeWasDeleted = activeConversationId ? idSet.has(activeConversationId) : false;
      const nextActive = activeWasDeleted ? (next[0]?.id ?? null) : activeConversationId;

      setConversations(next);
      conversationsRef.current = next;
      setActiveConversationId(nextActive);
      if (auth.status === "guest") persistLocal(next);
      setSyncStatus(
        auth.status === "authed" && auth.supabaseReady
          ? online ? "saving" : "offline"
          : "saved"
      );

      if (auth.status === "authed" && auth.supabaseReady && online) {
        try {
          await Promise.all(
            ids.map((id) =>
              conversationsApi(
                `/api/conversations/${encodeURIComponent(id)}`,
                auth.accessToken,
                { method: "DELETE" }
              )
            )
          );
          setSyncStatus("saved");
          setLastSyncError(null);
        } catch (err) {
          failSync(
            err instanceof Error ? err.message : "Nao foi possivel excluir conversas."
          );
        }
      }

      return nextActive;
    },
    [
      activeConversationId,
      auth.accessToken,
      auth.status,
      auth.supabaseReady,
      failSync,
      online,
      persistLocal,
    ]
  );

  const deleteAllConversations = useCallback(async (): Promise<void> => {
    setConversations([]);
    conversationsRef.current = [];
    setActiveConversationId(null);
    setError(null);
    setLastSyncError(null);

    if (auth.status === "guest") clearLocal();
    setSyncStatus(
      auth.status === "authed" && auth.supabaseReady
        ? online
          ? "saving"
          : "offline"
        : "saved"
    );

    if (auth.status !== "authed" || !auth.supabaseReady) return;

    const remoteAction = async () => {
      await conversationsApi("/api/conversations", auth.accessToken, {
        method: "DELETE",
      });
    };
    lastSyncActionRef.current = remoteAction;

    if (!online) {
      failSync("Conversas removidas localmente. Sincronize quando voltar online.", "offline");
      return;
    }

    try {
      await remoteAction();
      lastSyncActionRef.current = null;
      setLastSyncError(null);
      setSyncStatus("saved");
    } catch (err) {
      failSync(
        err instanceof Error ? err.message : "Nao foi possivel excluir conversas."
      );
    }
  }, [
    auth.accessToken,
    auth.status,
    auth.supabaseReady,
    clearLocal,
    failSync,
    online,
  ]);

  const ingestRealtimeMessage = useCallback(
    (conversationId: string, message: ChatMessage) => {
      const updatedAt = message.createdAt || Date.now();
      setConversations((current) => {
        const next = current
          .map((conversation) => {
            if (conversation.id !== conversationId) return conversation;
            const messages = conversation.messages ?? [];
            if (hasMessage(messages, message)) return conversation;
            return {
              ...conversation,
              updatedAt,
              messages: [...messages, message].sort(
                (a, b) => a.createdAt - b.createdAt
              ),
            };
          })
          .sort((a, b) => b.updatedAt - a.updatedAt);
        conversationsRef.current = next;
        if (auth.status === "guest") persistLocal(next);
        return next;
      });
    },
    [auth.status, persistLocal]
  );

  return {
    conversations,
    activeConversation,
    activeConversationId,
    loading,
    error,
    syncStatus,
    lastSyncError,
    online,
    refresh,
    retrySync,
    clearActiveConversation,
    createConversation,
    isSessionCreated,
    selectConversation,
    persistMessage,
    updateConversation,
    batchDeleteConversations,
    deleteAllConversations,
    ingestRealtimeMessage,
    deleteConversation,
  };
}

function hasMessage(messages: ChatMessage[], next: ChatMessage): boolean {
  return messages.some((message) => {
    if (next.id && message.id === next.id) return true;
    return (
      message.role === next.role &&
      message.text === next.text &&
      Math.abs(message.createdAt - next.createdAt) < 1500
    );
  });
}

function deriveConversationSummary(text: string): string {
  const clean = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#>*_`~\-[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return "";
  return clean.length > 140 ? `${clean.slice(0, 140).trim()}...` : clean;
}

async function conversationsApi<T = unknown>(
  path: string,
  accessToken: string | null | undefined,
  init: { method?: string; body?: unknown } = {}
): Promise<T> {
  if (!accessToken) {
    throw new Error("Sessao Supabase ausente.");
  }

  const response = await fetch(path, {
    method: init.method ?? "GET",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });

  const data = (await response.json().catch(() => null)) as
    | (T & {
        ok?: boolean;
        error?: { message?: string };
      })
    | null;

  if (!response.ok || data?.ok === false) {
    throw new Error(
      data?.error?.message || `Falha HTTP ${response.status} no Supabase.`
    );
  }

  return data as T;
}

function readLocalConversations(): Conversation[] {
  try {
    const raw = window.localStorage.getItem(LOCAL_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Conversation[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && item.id && item.sessionId)
      .map((item) => ({
        ...item,
        title: item.title || DEFAULT_TITLE,
        messages: Array.isArray(item.messages) ? item.messages : [],
        pinned: Boolean(item.pinned),
        favorite: Boolean(item.favorite),
        tags: Array.isArray(item.tags)
          ? item.tags
              .filter((tag): tag is string => typeof tag === "string")
              .map((tag) => tag.trim())
              .filter(Boolean)
              .slice(0, 8)
          : [],
        summary: typeof item.summary === "string" ? item.summary : "",
        archived: Boolean(item.archived),
      }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}
