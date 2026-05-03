"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ChatMessage } from "@/lib/types";

export interface MessageSearchMatch {
  id: string;
  messageKey: string;
  messageIndex: number;
  start: number;
  end: number;
}

export function useMessageSearch(messages: ChatMessage[]) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const normalizedQuery = query.trim().toLowerCase();

  const matches = useMemo<MessageSearchMatch[]>(() => {
    if (!normalizedQuery) return [];

    return messages.flatMap((message, messageIndex) => {
      const text = message.text.toLowerCase();
      const messageKey = getMessageSearchKey(message, messageIndex);
      const items: MessageSearchMatch[] = [];
      let start = 0;

      while (start < text.length) {
        const index = text.indexOf(normalizedQuery, start);
        if (index === -1) break;
        const end = index + normalizedQuery.length;
        items.push({
          id: `${messageKey}:${index}`,
          messageKey,
          messageIndex,
          start: index,
          end,
        });
        start = Math.max(end, index + 1);
      }

      return items;
    });
  }, [messages, normalizedQuery]);

  useEffect(() => {
    setActiveIndex(0);
  }, [normalizedQuery]);

  useEffect(() => {
    if (activeIndex >= matches.length) {
      setActiveIndex(Math.max(0, matches.length - 1));
    }
  }, [activeIndex, matches.length]);

  const next = useCallback(() => {
    setActiveIndex((current) =>
      matches.length === 0 ? 0 : (current + 1) % matches.length
    );
  }, [matches.length]);

  const previous = useCallback(() => {
    setActiveIndex((current) =>
      matches.length === 0
        ? 0
        : (current - 1 + matches.length) % matches.length
    );
  }, [matches.length]);

  const clear = useCallback(() => {
    setQuery("");
    setActiveIndex(0);
  }, []);

  return {
    query,
    setQuery,
    normalizedQuery,
    matches,
    activeIndex,
    activeMatch: matches[activeIndex] ?? null,
    total: matches.length,
    next,
    previous,
    clear,
  };
}

export function getMessageSearchKey(
  message: ChatMessage,
  index: number
): string {
  return message.id ?? `${message.createdAt}-${index}`;
}
