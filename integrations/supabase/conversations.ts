import type { CorvusSupabaseClient } from "@/integrations/supabase/types";
import type { ChatMessage, Conversation, MessageRole } from "@/lib/types";

const DEFAULT_TITLE = "Nova conversa";

function toTime(value: string | null | undefined, fallback = Date.now()): number {
  if (!value) return fallback;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeRole(role: string): MessageRole {
  return role === "assistant" || role === "corvus" ? "corvus" : "user";
}

export function makeSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function makeConversationId(): string {
  return `conv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function deriveConversationTitle(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return DEFAULT_TITLE;
  return clean.length > 42 ? `${clean.slice(0, 42).trim()}...` : clean;
}

export function createLocalConversation(): Conversation {
  const now = Date.now();
  return {
    id: makeConversationId(),
    title: DEFAULT_TITLE,
    sessionId: makeSessionId(),
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
}

export async function listConversations(
  supabase: CorvusSupabaseClient,
  userId: string
): Promise<Conversation[]> {
  const { data, error } = await supabase
    .from("msy_conversas")
    .select("id,titulo,session_id,updated_at")
    .eq("usuario_id", userId)
    .order("updated_at", { ascending: false })
    .limit(60);

  if (error) throw error;

  return (data ?? []).map((row) => {
    const updatedAt = toTime(row.updated_at);
    return {
      id: row.id,
      title: row.titulo || DEFAULT_TITLE,
      sessionId: row.session_id || makeSessionId(),
      createdAt: updatedAt,
      updatedAt,
      messages: [],
    };
  });
}

export async function upsertConversation(
  supabase: CorvusSupabaseClient,
  conversation: Conversation,
  userId: string
): Promise<void> {
  const { error } = await supabase.from("msy_conversas").upsert({
    id: conversation.id,
    usuario_id: userId,
    titulo: conversation.title,
    session_id: conversation.sessionId,
    updated_at: new Date(conversation.updatedAt).toISOString(),
  });

  if (error) throw error;
}

export async function updateConversationMeta(
  supabase: CorvusSupabaseClient,
  conversationId: string,
  title: string,
  updatedAt: number
): Promise<void> {
  const { error } = await supabase
    .from("msy_conversas")
    .update({
      titulo: title,
      updated_at: new Date(updatedAt).toISOString(),
    })
    .eq("id", conversationId);

  if (error) throw error;
}

export async function updateOwnedConversationMeta(
  supabase: CorvusSupabaseClient,
  conversationId: string,
  userId: string,
  title: string,
  updatedAt: number
): Promise<void> {
  const { error } = await supabase
    .from("msy_conversas")
    .update({
      titulo: title,
      updated_at: new Date(updatedAt).toISOString(),
    })
    .eq("id", conversationId)
    .eq("usuario_id", userId);

  if (error) throw error;
}

export async function userCanAccessConversation(
  supabase: CorvusSupabaseClient,
  conversationId: string,
  userId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("msy_conversas")
    .select("id")
    .eq("id", conversationId)
    .eq("usuario_id", userId)
    .maybeSingle();

  if (error) throw error;
  return Boolean(data);
}

export async function deleteOwnedConversationRecord(
  supabase: CorvusSupabaseClient,
  conversationId: string,
  userId: string
): Promise<void> {
  const allowed = await userCanAccessConversation(
    supabase,
    conversationId,
    userId
  );
  if (!allowed) {
    throw new Error("Conversa nao encontrada para este usuario.");
  }

  const messageDelete = await supabase
    .from("msy_mensagens")
    .delete()
    .eq("conversa_id", conversationId);

  if (messageDelete.error) throw messageDelete.error;

  const conversationDelete = await supabase
    .from("msy_conversas")
    .delete()
    .eq("id", conversationId)
    .eq("usuario_id", userId);

  if (conversationDelete.error) throw conversationDelete.error;
}

export async function deleteConversationRecord(
  supabase: CorvusSupabaseClient,
  conversationId: string
): Promise<void> {
  const messageDelete = await supabase
    .from("msy_mensagens")
    .delete()
    .eq("conversa_id", conversationId);

  if (messageDelete.error) throw messageDelete.error;

  const conversationDelete = await supabase
    .from("msy_conversas")
    .delete()
    .eq("id", conversationId);

  if (conversationDelete.error) throw conversationDelete.error;
}

export async function loadMessages(
  supabase: CorvusSupabaseClient,
  conversationId: string
): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from("msy_mensagens")
    .select("role,texto,created_at")
    .eq("conversa_id", conversationId)
    .order("created_at", { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    role: normalizeRole(row.role),
    text: row.texto,
    createdAt: toTime(row.created_at),
  }));
}

export async function saveMessage(
  supabase: CorvusSupabaseClient,
  conversationId: string,
  message: ChatMessage
): Promise<void> {
  const { error } = await supabase.from("msy_mensagens").insert({
    conversa_id: conversationId,
    role: message.role,
    texto: message.text,
    created_at: new Date(message.createdAt).toISOString(),
  });

  if (error) throw error;
}
