"use client";

import { useCallback, useRef, useState } from "react";
import type {
  AgentMode,
  ChatAttachment,
  ChatMessage,
  ChatRequestBody,
  ChatResponse,
  ChatSuccessResponse,
  ConversationAttachment,
  UserContext,
} from "@/lib/types";

interface SendArgs {
  text: string;
  mode: AgentMode;
  conversationId: string;
  sessionId: string;
  userId: string;
  userContext: UserContext;
  attachments?: ChatAttachment[];
  messageAttachments?: ConversationAttachment[];
  accessToken?: string | null;
  onUserMessage?: (message: ChatMessage) => void | Promise<void>;
  onAssistantMessage?: (
    message: ChatMessage,
    response: ChatSuccessResponse
  ) => void | Promise<void>;
}

interface SendError {
  message: string;
  retryable: boolean;
}

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<SendError | null>(null);
  const lastArgsRef = useRef<SendArgs | null>(null);

  const reset = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  const setHistory = useCallback((next: ChatMessage[]) => {
    setMessages(next);
    setError(null);
  }, []);

  const appendExternalMessage = useCallback((message: ChatMessage) => {
    setMessages((current) => {
      if (hasMessage(current, message)) return current;
      return [...current, message].sort((a, b) => a.createdAt - b.createdAt);
    });
  }, []);

  const send = useCallback(async (args: SendArgs): Promise<boolean> => {
    lastArgsRef.current = args;

    const userMessage: ChatMessage = {
      role: "user",
      text: args.text,
      createdAt: Date.now(),
      attachments: args.messageAttachments,
    };

    setMessages((prev) => [...prev, userMessage]);
    setPending(true);
    setError(null);
    void args.onUserMessage?.(userMessage);

    const body: ChatRequestBody = {
      message: args.text,
      conversationId: args.conversationId,
      sessionId: args.sessionId,
      userId: args.userId,
      modo: args.mode,
      userContext: args.userContext,
      attachments: args.attachments,
    };

    try {
      const res = await fetch("/api/corvus/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(args.accessToken
            ? { Authorization: `Bearer ${args.accessToken}` }
            : {}),
        },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => null)) as ChatResponse | null;

      if (!data) {
        setError({ message: "Resposta invalida do servidor.", retryable: true });
        return false;
      }
      if (!data.ok) {
        setError({
          message: friendlyError(data.error.code, data.error.message),
          retryable: data.error.retryable,
        });
        return false;
      }

      const assistantMessage: ChatMessage = {
        role: "corvus",
        text: data.reply,
        createdAt: Date.now(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
      void args.onAssistantMessage?.(assistantMessage, data);
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro de rede.";
      setError({ message: `Falha de conexao: ${msg}`, retryable: true });
      return false;
    } finally {
      setPending(false);
    }
  }, []);

  const retryLast = useCallback(() => {
    if (lastArgsRef.current) void send(lastArgsRef.current);
  }, [send]);

  const editAndResend = useCallback(
    async (
      originalCreatedAt: number,
      newText: string,
      args: Omit<SendArgs, "text" | "onUserMessage">
    ) => {
      // Remove the original message and everything after it; send() will add the new version
      setMessages((prev) => {
        const idx = prev.findIndex((m) => m.createdAt === originalCreatedAt && m.role === "user");
        if (idx === -1) return prev;
        return prev.slice(0, idx);
      });
      await send({ ...args, text: newText });
    },
    [send]
  );

  return {
    messages,
    pending,
    error,
    send,
    retryLast,
    reset,
    setHistory,
    appendExternalMessage,
    editAndResend,
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

function friendlyError(code: string, fallback: string): string {
  switch (code) {
    case "upstream_timeout":
      return "O Corvus demorou demais para responder. Tente novamente.";
    case "upstream_unreachable":
      return "Nao consegui falar com o motor do Corvus agora. Tente em instantes.";
    case "upstream_5xx":
      return fallback || "Erro no motor do Corvus. Equipe tecnica notificada.";
    case "upstream_4xx":
      return "Workflow indisponivel ou desativado.";
    case "upstream_invalid_response":
      return fallback || "O Corvus respondeu em formato inesperado.";
    case "validation":
      return fallback;
    case "internal":
      return fallback || "Configuracao do Corvus indisponivel.";
    default:
      return fallback || "Falha desconhecida.";
  }
}
