"use client";

import { useCallback, useRef, useState } from "react";
import type {
  AgentMode,
  ChatMessage,
  ChatRequestBody,
  ChatResponse,
  UserContext,
} from "@/lib/types";

interface SendArgs {
  text: string;
  mode: AgentMode;
  conversationId: string;
  sessionId: string;
  userId: string;
  userContext: UserContext;
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
  }, []);

  const send = useCallback(async (args: SendArgs) => {
    lastArgsRef.current = args;
    const userMsg: ChatMessage = {
      role: "user",
      text: args.text,
      createdAt: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setPending(true);
    setError(null);

    const body: ChatRequestBody = {
      message: args.text,
      conversationId: args.conversationId,
      sessionId: args.sessionId,
      userId: args.userId,
      modo: args.mode,
      userContext: args.userContext,
    };

    try {
      const res = await fetch("/api/corvus/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => null)) as ChatResponse | null;

      if (!data) {
        setError({ message: "Resposta inválida do servidor.", retryable: true });
        return;
      }
      if (!data.ok) {
        setError({ message: friendlyError(data.error.code, data.error.message), retryable: data.error.retryable });
        return;
      }
      setMessages((prev) => [
        ...prev,
        { role: "corvus", text: data.reply, createdAt: Date.now() },
      ]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro de rede.";
      setError({ message: `Falha de conexão: ${msg}`, retryable: true });
    } finally {
      setPending(false);
    }
  }, []);

  const retryLast = useCallback(() => {
    if (lastArgsRef.current) void send(lastArgsRef.current);
  }, [send]);

  return { messages, pending, error, send, retryLast, reset, setHistory };
}

function friendlyError(code: string, fallback: string): string {
  switch (code) {
    case "upstream_timeout":
      return "O Corvus demorou demais para responder. Tente novamente.";
    case "upstream_unreachable":
      return "Não consegui falar com o motor do Corvus agora. Tente em instantes.";
    case "upstream_5xx":
      return "Erro no motor do Corvus. Equipe técnica notificada.";
    case "upstream_4xx":
      return "Workflow indisponível ou desativado.";
    case "upstream_invalid_response":
      return "O Corvus respondeu em formato inesperado.";
    case "validation":
      return fallback;
    default:
      return fallback || "Falha desconhecida.";
  }
}
