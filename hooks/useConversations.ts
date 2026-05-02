"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createLocalConversation,
  deriveConversationTitle,
} from "@/integrations/supabase/conversations";
import type { ChatMessage, Conversation } from "@/lib/types";

type AuthLike = {
  status: "loading" | "anon" | "authed" | "guest";
  userId: string;
  supabaseReady: boolean;
  accessToken?: string | null;
};

const LOCAL_KEY = "corvus_guest_conversations";
const DEFAULT_TITLE = "Nova conversa";

type SyncStatus = "idle" | "saving" | "saved" | "error";
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
  const conversationsRef = useRef<Conversation[]>([]);

  const activeConversation = useMemo(
    () => conversations.find((item) => item.id === activeConversationId) ?? null,
    [activeConversationId, conversations]
  );

  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  const persistLocal = useCallback((next: Conversation[]) => {
    try {
      window.localStorage.setItem(LOCAL_KEY, JSON.stringify(next));
    } catch {
      /* localStorage indisponivel */
    }
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
    setSyncStatus("idle");
    try {
      if (auth.status === "authed" && auth.supabaseReady) {
        const result = await conversationsApi<{
          conversations: Conversation[];
        }>("/api/conversations", auth.accessToken);
        const remote = result.conversations;
        conversationsRef.current = remote;
        setConversations(remote);
        setActiveConversationId((current) => current ?? remote[0]?.id ?? null);
        return;
      }

      const local = readLocalConversations();
      conversationsRef.current = local;
      setConversations(local);
      setActiveConversationId((current) => current ?? local[0]?.id ?? null);
    } catch (err) {
      setError(
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
  }, [auth.accessToken, auth.status, auth.supabaseReady]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const createConversation = useCallback(async (): Promise<Conversation> => {
    const conversation = createLocalConversation();
    setSyncStatus(
      auth.status === "authed" && auth.supabaseReady ? "saving" : "saved"
    );
    setConversations((current) => {
      const next = [conversation, ...current];
      conversationsRef.current = next;
      if (auth.status === "guest") persistLocal(next);
      return next;
    });
    setActiveConversationId(conversation.id);

    if (auth.status === "authed" && auth.supabaseReady) {
      try {
        await conversationsApi("/api/conversations", auth.accessToken, {
          method: "POST",
          body: conversation,
        });
        setSyncStatus("saved");
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Nao foi possivel criar conversa no Supabase."
        );
        setSyncStatus("error");
      }
    }

    return conversation;
  }, [auth.accessToken, auth.status, auth.supabaseReady, persistLocal]);

  const selectConversation = useCallback(
    async (conversationId: string): Promise<ChatMessage[]> => {
      setActiveConversationId(conversationId);
      setError(null);

      try {
        if (auth.status === "authed" && auth.supabaseReady) {
          const result = await conversationsApi<{ messages: ChatMessage[] }>(
            `/api/conversations/${encodeURIComponent(conversationId)}/messages`,
            auth.accessToken
          );
          return result.messages;
        }

        return (
          conversations.find((item) => item.id === conversationId)?.messages ??
          []
        );
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Nao foi possivel carregar mensagens."
        );
        return [];
      }
    },
    [auth.accessToken, auth.status, auth.supabaseReady, conversations]
  );

  const persistMessage = useCallback(
    async (conversationId: string, message: ChatMessage): Promise<void> => {
      const now = Date.now();
      setSyncStatus(auth.status === "authed" && auth.supabaseReady ? "saving" : "saved");
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

      try {
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
        setSyncStatus("saved");
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Nao foi possivel persistir mensagem."
        );
        setSyncStatus("error");
      }
    },
    [
      auth.accessToken,
      auth.status,
      auth.supabaseReady,
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
      setSyncStatus(
        auth.status === "authed" && auth.supabaseReady ? "saving" : "saved"
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

      try {
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
        setSyncStatus("saved");
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Nao foi possivel atualizar conversa."
        );
        setSyncStatus("error");
      }
    },
    [
      auth.accessToken,
      auth.status,
      auth.supabaseReady,
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
        auth.status === "authed" && auth.supabaseReady ? "saving" : "saved"
      );

      if (auth.status === "authed" && auth.supabaseReady) {
        try {
          await conversationsApi(
            `/api/conversations/${encodeURIComponent(conversationId)}`,
            auth.accessToken,
            { method: "DELETE" }
          );
          setSyncStatus("saved");
        } catch (err) {
          setError(
            err instanceof Error
              ? err.message
              : "Nao foi possivel excluir conversa."
          );
          setSyncStatus("error");
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
      persistLocal,
    ]
  );

  return {
    conversations,
    activeConversation,
    activeConversationId,
    loading,
    error,
    syncStatus,
    refresh,
    createConversation,
    selectConversation,
    persistMessage,
    updateConversation,
    deleteConversation,
  };
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
