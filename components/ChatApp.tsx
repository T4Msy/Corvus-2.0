"use client";

import { useCallback, useMemo, useState } from "react";
import Image from "next/image";
import { ChatInput } from "@/components/ChatInput";
import { ChatMessages } from "@/components/ChatMessages";
import { LoginScreen } from "@/components/LoginScreen";
import { useAuth } from "@/hooks/useAuth";
import { useChat } from "@/hooks/useChat";
import { useTheme } from "@/hooks/useTheme";
import type { AgentMode, UserContext } from "@/lib/types";

function makeSessionId(): string {
  return "session_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
}
function makeConversationId(): string {
  return "conv_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
}

export function ChatApp() {
  const { theme, toggle, label, logoSrc } = useTheme();
  const auth = useAuth();
  const chat = useChat();
  const [mode, setMode] = useState<AgentMode>("corvus");
  const [conversation] = useState(() => ({
    id: makeConversationId(),
    sessionId: makeSessionId(),
  }));

  const userContext: UserContext = useMemo(
    () => ({
      nome:
        auth.profile?.nome_interno ||
        auth.profile?.nome ||
        (auth.status === "guest" ? "Convidado" : ""),
      cargo: auth.profile?.cargo ?? "",
      sigla: auth.profile?.sigla_cargo ?? "",
      tipo: auth.status === "guest" ? "convidado" : auth.profile?.tipo ?? "membro",
    }),
    [auth.profile, auth.status]
  );

  const send = useCallback(
    (text: string) => {
      void chat.send({
        text,
        mode,
        conversationId: conversation.id,
        sessionId: conversation.sessionId,
        userId: auth.userId,
        userContext,
      });
    },
    [chat, mode, conversation, auth.userId, userContext]
  );

  if (auth.status === "loading") {
    return (
      <div className="app-container" style={{ display: "grid", placeItems: "center" }}>
        <div className="typing-indicator" aria-label="Carregando">
          <span />
          <span />
          <span />
        </div>
      </div>
    );
  }

  if (auth.status === "anon") {
    return (
      <LoginScreen
        logoSrc={logoSrc}
        onLogin={auth.loginEmail}
        onGuest={auth.loginGuest}
      />
    );
  }

  const welcomeName =
    auth.status === "guest"
      ? "Olá! Sou Corvus"
      : `Olá, ${auth.profile?.nome_interno || auth.profile?.nome || "membro"}`;

  return (
    <>
      <div className="background-container" aria-hidden="true">
        <div className="gradient-orb orb-1" />
        <div className="gradient-orb orb-2" />
        <div className="gradient-orb orb-3" />
      </div>

      <div className="app-container">
        <header className="header" role="banner">
          <div className="header-content">
            <div className="logo">
              <Image
                src={logoSrc}
                alt="Corvus Logo"
                className="logo-icon"
                width={36}
                height={36}
                priority
              />
              <div className="logo-text">
                <h1>CORVUS</h1>
                <span>Agente oficial da MSY</span>
              </div>
            </div>
            <div className="header-status">
              <button
                type="button"
                className="theme-toggle"
                onClick={toggle}
                aria-label="Trocar tema"
                style={{
                  marginRight: 12,
                  background: "transparent",
                  border: "1px solid currentColor",
                  borderRadius: 6,
                  padding: "4px 10px",
                  cursor: "pointer",
                  color: "inherit",
                  fontSize: 12,
                }}
              >
                Tema: {label}
              </button>
              <div className="status-indicator" aria-hidden="true" />
              <span>Corvus v3.0</span>
              <button
                type="button"
                onClick={auth.logout}
                style={{
                  marginLeft: 12,
                  background: "transparent",
                  border: "1px solid currentColor",
                  borderRadius: 6,
                  padding: "4px 10px",
                  cursor: "pointer",
                  color: "inherit",
                  fontSize: 12,
                }}
              >
                Sair
              </button>
            </div>
          </div>
          <div className="header-glow" aria-hidden="true" />
        </header>

        <div className="main-content">
          <main className="chat-container" role="main">
            {auth.status === "guest" && (
              <div className="guest-banner" role="alert">
                Você está como <span>convidado</span>. Algumas informações são
                restritas.
              </div>
            )}
            <ChatMessages
              messages={chat.messages}
              pending={chat.pending}
              error={chat.error}
              onRetry={chat.retryLast}
              profile={auth.profile}
              logoSrc={logoSrc}
              showWelcome
              welcomeName={welcomeName}
              onSuggest={send}
            />
            <ChatInput
              mode={mode}
              onModeChange={setMode}
              onSend={send}
              disabled={chat.pending}
            />
          </main>
        </div>
      </div>
    </>
  );
}
