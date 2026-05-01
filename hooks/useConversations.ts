"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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

export function useConversations(auth: AuthLike) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(
    null
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeConversation = useMemo(
    () => conversations.find((item) => item.id === activeConversationId) ?? null,
    [activeConversationId, conversations]
  );

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
      setActiveConversationId(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      if (auth.status === "authed" && auth.supabaseReady) {
        const result = await conversationsApi<{
          conversations: Conversation[];
        }>("/api/conversations", auth.accessToken);
        const remote = result.conversations;
        setConversations(remote);
        setActiveConversationId((current) => current ?? remote[0]?.id ?? null);
        return;
      }

      const local = readLocalConversations();
      setConversations(local);
      setActiveConversationId((current) => current ?? local[0]?.id ?? null);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Nao foi possivel carregar conversas."
      );
      setConversations([]);
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
    setConversations((current) => {
      const next = [conversation, ...current];
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
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Nao foi possivel criar conversa no Supabase."
        );
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
      let titleForPersist = DEFAULT_TITLE;

      setConversations((current) => {
        const next = current
          .map((item) => {
            if (item.id !== conversationId) return item;
            const nextTitle =
              item.title === DEFAULT_TITLE && message.role === "user"
                ? deriveConversationTitle(message.text)
                : item.title || DEFAULT_TITLE;
            titleForPersist = nextTitle;
            return {
              ...item,
              title: nextTitle,
              updatedAt: now,
              messages:
                auth.status === "guest"
                  ? [...item.messages, message]
                  : item.messages,
            };
          })
          .sort((a, b) => b.updatedAt - a.updatedAt);

        if (auth.status === "guest") persistLocal(next);
        return next;
      });

      if (auth.status !== "authed" || !auth.supabaseReady) return;

      try {
        await conversationsApi(
          `/api/conversations/${encodeURIComponent(conversationId)}/messages`,
          auth.accessToken,
          {
            method: "POST",
            body: {
              message,
              title: titleForPersist,
              updatedAt: now,
            },
          }
        );
      } catch (err) {
        setError(
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
      setActiveConversationId(nextActive);
      if (auth.status === "guest") persistLocal(next);

      if (auth.status === "authed" && auth.supabaseReady) {
        try {
          await conversationsApi(
            `/api/conversations/${encodeURIComponent(conversationId)}`,
            auth.accessToken,
            { method: "DELETE" }
          );
        } catch (err) {
          setError(
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
      persistLocal,
    ]
  );

  return {
    conversations,
    activeConversation,
    activeConversationId,
    loading,
    error,
    refresh,
    createConversation,
    selectConversation,
    persistMessage,
    deleteConversation,
  };
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
      }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}
