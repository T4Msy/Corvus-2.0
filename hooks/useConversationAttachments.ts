"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getBrowserSupabase } from "@/integrations/supabase/client";
import {
  createAttachmentSignedUrl,
  removeConversationFile,
  uploadConversationFile,
} from "@/integrations/supabase/storage";
import type { ConversationAttachment } from "@/lib/types";

type AttachmentMap = Record<string, ConversationAttachment[]>;

interface Args {
  userId: string;
  activeConversationId: string | null;
  enabled: boolean;
  online: boolean;
}

const MAX_FILE_SIZE = 25 * 1024 * 1024;

export function useConversationAttachments({
  userId,
  activeConversationId,
  enabled,
  online,
}: Args) {
  const [itemsByConversation, setItemsByConversation] = useState<AttachmentMap>(
    {}
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const storageKey = userId ? `corvus.attachments.${userId}` : "";

  useEffect(() => {
    if (!storageKey || !enabled) {
      setItemsByConversation({});
      return;
    }

    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) {
        setItemsByConversation({});
        return;
      }
      const parsed = JSON.parse(raw) as AttachmentMap;
      setItemsByConversation(normalizeMap(parsed));
    } catch {
      setItemsByConversation({});
    }
  }, [enabled, storageKey]);

  const persist = useCallback(
    (next: AttachmentMap) => {
      if (!storageKey) return;
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        /* localStorage indisponivel */
      }
    },
    [storageKey]
  );

  const activeAttachments = useMemo(
    () =>
      activeConversationId
        ? itemsByConversation[activeConversationId] ?? []
        : [],
    [activeConversationId, itemsByConversation]
  );

  const upload = useCallback(
    async (
      file: File,
      conversationId = activeConversationId
    ): Promise<ConversationAttachment | null> => {
      setError(null);

      if (!enabled) {
        setError("Anexos exigem login com Supabase.");
        return null;
      }
      if (!online) {
        setError("Sem conexão para enviar arquivo.");
        return null;
      }
      if (!conversationId) {
        setError("Selecione uma conversa antes de anexar.");
        return null;
      }
      if (file.size > MAX_FILE_SIZE) {
        setError("Arquivo acima de 25 MB.");
        return null;
      }

      setBusy(true);
      try {
        const uploaded = await uploadConversationFile(
          getBrowserSupabase(),
          file,
          userId,
          conversationId
        );
        const attachment: ConversationAttachment = {
          id:
            typeof crypto !== "undefined" && "randomUUID" in crypto
              ? crypto.randomUUID()
              : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          conversationId,
          path: uploaded.path,
          url: uploaded.url,
          name: file.name,
          type: file.type || "application/octet-stream",
          size: file.size,
          createdAt: Date.now(),
        };

        setItemsByConversation((current) => {
          const next = {
            ...current,
            [conversationId]: [attachment, ...(current[conversationId] ?? [])],
          };
          persist(next);
          return next;
        });

        return attachment;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Falha ao enviar arquivo.";
        setError(message);
        return null;
      } finally {
        setBusy(false);
      }
    },
    [activeConversationId, enabled, online, persist, userId]
  );

  const remove = useCallback(
    async (attachment: ConversationAttachment): Promise<boolean> => {
      setError(null);
      if (!enabled || !online) {
        setError("Sem conexão para remover arquivo.");
        return false;
      }

      setBusy(true);
      try {
        await removeConversationFile(getBrowserSupabase(), attachment.path);
        setItemsByConversation((current) => {
          const nextItems = (current[attachment.conversationId] ?? []).filter(
            (item) => item.id !== attachment.id
          );
          const next = {
            ...current,
            [attachment.conversationId]: nextItems,
          };
          persist(next);
          return next;
        });
        return true;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Falha ao remover arquivo.";
        setError(message);
        return false;
      } finally {
        setBusy(false);
      }
    },
    [enabled, online, persist]
  );

  const clearConversation = useCallback(
    (conversationId = activeConversationId): void => {
      if (!conversationId) return;
      setItemsByConversation((current) => {
        const next = {
          ...current,
          [conversationId]: [],
        };
        persist(next);
        return next;
      });
    },
    [activeConversationId, persist]
  );

  const open = useCallback(
    async (attachment: ConversationAttachment): Promise<boolean> => {
      setError(null);
      if (!enabled || !online) {
        setError("Sem conexão para abrir arquivo.");
        return false;
      }

      try {
        const url = await createAttachmentSignedUrl(
          getBrowserSupabase(),
          attachment.path
        );
        if (!url) throw new Error("URL assinada indisponivel.");
        window.open(url, "_blank", "noopener,noreferrer");
        return true;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Falha ao abrir arquivo.";
        setError(message);
        return false;
      }
    },
    [enabled, online]
  );

  return {
    activeAttachments,
    busy,
    error,
    upload,
    remove,
    clearConversation,
    open,
  };
}

function normalizeMap(value: unknown): AttachmentMap {
  if (!value || typeof value !== "object") return {};
  const record = value as Record<string, unknown>;
  const next: AttachmentMap = {};

  Object.entries(record).forEach(([conversationId, items]) => {
    if (!Array.isArray(items)) return;
    next[conversationId] = items
      .filter((item): item is ConversationAttachment => isAttachment(item))
      .map((item) => ({
        ...item,
        conversationId,
      }));
  });

  return next;
}

function isAttachment(value: unknown): value is ConversationAttachment {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<ConversationAttachment>;
  return Boolean(
    item.id &&
      item.conversationId &&
      item.path &&
      item.name &&
      typeof item.size === "number" &&
      typeof item.createdAt === "number"
  );
}
