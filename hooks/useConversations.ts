"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getBrowserSupabase } from "@/integrations/supabase/client";
import {
  createLocalConversation,
  deleteConversationRecord,
  deriveConversationTitle,
  listConversations,
  loadMessages,
  saveMessage,
  updateConversationMeta,
  upsertConversation,
} from "@/integrations/supabase/conversations";
import type { ChatMessage, Conversation } from "@/lib/types";

type AuthLike = {
  status: "loading" | "anon" | "authed" | "guest";
  userId: string;
  supabaseReady: boolean;
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
        const supabase = getBrowserSupabase();
        const remote = await listConversations(supabase, auth.userId);
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
  }, [auth.status, auth.supabaseReady, auth.userId]);

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
        await upsertConversation(
          getBrowserSupabase(),
          conversation,
          auth.userId
        );
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Nao foi possivel criar conversa no Supabase."
        );
      }
    }

    return conversation;
  }, [auth.status, auth.supabaseReady, auth.userId, persistLocal]);

  const selectConversation = useCallback(
    async (conversationId: string): Promise<ChatMessage[]> => {
      setActiveConversationId(conversationId);
      setError(null);

      try {
        if (auth.status === "authed" && auth.supabaseReady) {
          return await loadMessages(getBrowserSupabase(), conversationId);
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
    [auth.status, auth.supabaseReady, conversations]
  );

  const persistMessage = useCallback(
    async (conversationId: string, message: ChatMessage): Promise<void> => {
      const now = Date.now();
      const currentConversation = conversations.find(
        (item) => item.id === conversationId
      );
      const nextTitle =
        currentConversation?.title === DEFAULT_TITLE && message.role === "user"
          ? deriveConversationTitle(message.text)
          : currentConversation?.title ?? DEFAULT_TITLE;

      setConversations((current) => {
        const next = current
          .map((item) => {
            if (item.id !== conversationId) return item;
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
        const supabase = getBrowserSupabase();
        await saveMessage(supabase, conversationId, message);
        await updateConversationMeta(supabase, conversationId, nextTitle, now);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Nao foi possivel persistir mensagem."
        );
      }
    },
    [auth.status, auth.supabaseReady, conversations, persistLocal]
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
          await deleteConversationRecord(getBrowserSupabase(), conversationId);
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
