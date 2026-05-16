// ───────────────────────────────────────────────
// Tipos compartilhados entre client e server.
// ───────────────────────────────────────────────

/** Modo do agente — define qual ramo do Switch no n8n será executado. */
export type AgentMode = "corvus" | "fenrir";

/** Contexto do usuário enviado em cada mensagem. */
export interface UserContext {
  nome: string;
  cargo: string;
  sigla: string;
  tipo: "membro" | "convidado" | string;
}

export interface ChatAttachment {
  id: string;
  path: string;
  name: string;
  type: string;
  size: number;
}

export interface N8nImageAttachment {
  name: string;
  type: string;
  size: number;
  signedUrl: string;
}

/** Payload que o frontend envia para /api/corvus/chat. */
export interface ChatRequestBody {
  message: string;
  conversationId: string;
  sessionId: string;
  userId: string;
  modo: AgentMode;
  userContext: UserContext;
  attachments?: ChatAttachment[];
  imageAttachments?: N8nImageAttachment[];
}

/** Resposta normalizada que /api/corvus/chat devolve ao frontend. */
export interface ChatSuccessResponse {
  ok: true;
  reply: string;
  meta?: {
    agent?: string;
    model?: string;
    database?: string;
    [key: string]: unknown;
  };
}

export type ChatErrorCode =
  | "validation"
  | "upstream_unreachable"
  | "upstream_timeout"
  | "upstream_4xx"
  | "upstream_5xx"
  | "upstream_invalid_response"
  | "internal";

export interface ChatErrorResponse {
  ok: false;
  error: {
    code: ChatErrorCode;
    message: string;
    /** Para erros 5xx, sugerimos retry no client. */
    retryable: boolean;
  };
}

export type ChatResponse = ChatSuccessResponse | ChatErrorResponse;

// ───────────────────────────────────────────────
// Modelos de domínio (chat / conversas)
// ───────────────────────────────────────────────

export type MessageRole = "user" | "corvus";

export interface ChatMessage {
  id?: string;
  role: MessageRole;
  text: string;
  createdAt: number;
}

export interface Conversation {
  id: string;
  title: string;
  sessionId: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
  pinned?: boolean;
  favorite?: boolean;
  tags?: string[];
  summary?: string;
  archived?: boolean;
}

export interface ConversationAttachment {
  id: string;
  conversationId: string;
  path: string;
  url?: string | null;
  name: string;
  type: string;
  size: number;
  createdAt: number;
}

export type SyncStatus = "idle" | "saving" | "saved" | "offline" | "error";

export type ThemePreference = "dark" | "light" | "system";

export interface UserProfile {
  id: string;
  nome?: string;
  nome_interno?: string;
  cargo?: string;
  sigla_cargo?: string;
  tipo?: "membro" | "convidado" | string;
  avatar_url?: string;
  theme_preference?: ThemePreference;
}
