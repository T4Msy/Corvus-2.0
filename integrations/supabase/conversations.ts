import type { CorvusSupabaseClient } from "@/integrations/supabase/types";
import type { ChatMessage, Conversation, MessageRole } from "@/lib/types";

const DEFAULT_TITLE = "Nova conversa";
const BASE_CONVERSATION_SELECT = "id,titulo,session_id,updated_at";
const META_CONVERSATION_SELECT = `${BASE_CONVERSATION_SELECT},pinned,favorite,tags,summary,archived`;

export type ConversationMetaPatch = Partial<
  Pick<
    Conversation,
    "title" | "updatedAt" | "pinned" | "favorite" | "tags" | "summary" | "archived"
  >
>;

function toTime(value: string | null | undefined, fallback = Date.now()): number {
  if (!value) return fallback;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeRole(role: string): MessageRole {
  return role === "assistant" || role === "corvus" ? "corvus" : "user";
}

function serializeRole(role: MessageRole): string {
  return role === "corvus" ? "assistant" : role;
}

function normalizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function isMissingMetadataColumn(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as { code?: unknown; message?: unknown; details?: unknown };
  const code = typeof record.code === "string" ? record.code : "";
  const message = `${String(record.message ?? "")} ${String(record.details ?? "")}`.toLowerCase();
  return (
    code === "42703" ||
    code === "PGRST204" ||
    message.includes("pinned") ||
    message.includes("favorite") ||
    message.includes("archived") ||
    message.includes("tags") ||
    message.includes("summary")
  );
}

function conversationRowToModel(row: {
  id: string;
  titulo: string | null;
  session_id: string | null;
  updated_at: string | null;
  pinned?: boolean | null;
  favorite?: boolean | null;
  tags?: string[] | null;
  summary?: string | null;
  archived?: boolean | null;
}): Conversation {
  const updatedAt = toTime(row.updated_at);
  return {
    id: row.id,
    title: row.titulo || DEFAULT_TITLE,
    sessionId: row.session_id || makeSessionId(),
    createdAt: updatedAt,
    updatedAt,
    messages: [],
    pinned: Boolean(row.pinned),
    favorite: Boolean(row.favorite),
    tags: normalizeTags(row.tags),
    summary: row.summary || "",
    archived: Boolean(row.archived),
  };
}

function baseConversationRow(conversation: Conversation, userId: string) {
  return {
    id: conversation.id,
    usuario_id: userId,
    titulo: conversation.title,
    session_id: conversation.sessionId,
    updated_at: new Date(conversation.updatedAt).toISOString(),
  };
}

function fullConversationRow(conversation: Conversation, userId: string) {
  return {
    ...baseConversationRow(conversation, userId),
    pinned: Boolean(conversation.pinned),
    favorite: Boolean(conversation.favorite),
    tags: normalizeTags(conversation.tags),
    summary: conversation.summary || null,
    archived: Boolean(conversation.archived),
  };
}

function baseMetaPatch(patch: ConversationMetaPatch) {
  const updatedAt = patch.updatedAt ?? Date.now();
  return {
    ...(typeof patch.title === "string" ? { titulo: patch.title } : {}),
    updated_at: new Date(updatedAt).toISOString(),
  };
}

function fullMetaPatch(patch: ConversationMetaPatch) {
  return {
    ...baseMetaPatch(patch),
    ...(typeof patch.pinned === "boolean" ? { pinned: patch.pinned } : {}),
    ...(typeof patch.favorite === "boolean" ? { favorite: patch.favorite } : {}),
    ...(Array.isArray(patch.tags) ? { tags: normalizeTags(patch.tags) } : {}),
    ...(typeof patch.summary === "string"
      ? { summary: patch.summary.trim() || null }
      : {}),
    ...(typeof patch.archived === "boolean" ? { archived: patch.archived } : {}),
  };
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
    pinned: false,
    favorite: false,
    tags: [],
    summary: "",
    archived: false,
  };
}

export async function listConversations(
  supabase: CorvusSupabaseClient,
  userId: string
): Promise<Conversation[]> {
  const query = supabase
    .from("msy_conversas")
    .select(META_CONVERSATION_SELECT)
    .eq("usuario_id", userId)
    .order("updated_at", { ascending: false })
    .limit(60);
  const { data, error } = await query;

  if (error && isMissingMetadataColumn(error)) {
    const fallback = await supabase
      .from("msy_conversas")
      .select(BASE_CONVERSATION_SELECT)
      .eq("usuario_id", userId)
      .order("updated_at", { ascending: false })
      .limit(60);
    if (fallback.error) throw fallback.error;
    return (fallback.data ?? []).map(conversationRowToModel);
  }

  if (error) throw error;

  return (data ?? []).map(conversationRowToModel);
}

export async function upsertConversation(
  supabase: CorvusSupabaseClient,
  conversation: Conversation,
  userId: string
): Promise<void> {
  const existing = await supabase
    .from("msy_conversas")
    .update({
      ...fullMetaPatch(conversation),
      session_id: conversation.sessionId,
    })
    .eq("id", conversation.id)
    .eq("usuario_id", userId)
    .select("id")
    .maybeSingle();

  if (existing.error && isMissingMetadataColumn(existing.error)) {
    const fallbackUpdate = await supabase
      .from("msy_conversas")
      .update({
        titulo: conversation.title,
        session_id: conversation.sessionId,
        updated_at: new Date(conversation.updatedAt).toISOString(),
      })
      .eq("id", conversation.id)
      .eq("usuario_id", userId)
      .select("id")
      .maybeSingle();
    if (fallbackUpdate.error) throw fallbackUpdate.error;
    if (fallbackUpdate.data) return;

    const fallbackInsert = await supabase
      .from("msy_conversas")
      .insert(baseConversationRow(conversation, userId));
    if (fallbackInsert.error) throw fallbackInsert.error;
    return;
  }

  if (existing.error) throw existing.error;
  if (existing.data) return;

  const inserted = await supabase
    .from("msy_conversas")
    .insert(fullConversationRow(conversation, userId));
  if (inserted.error && isMissingMetadataColumn(inserted.error)) {
    const fallback = await supabase
      .from("msy_conversas")
      .insert(baseConversationRow(conversation, userId));
    if (fallback.error) throw fallback.error;
    return;
  }
  if (inserted.error) throw inserted.error;
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
  await patchOwnedConversationMeta(supabase, conversationId, userId, {
    title,
    updatedAt,
  });
}

export async function patchOwnedConversationMeta(
  supabase: CorvusSupabaseClient,
  conversationId: string,
  userId: string,
  patch: ConversationMetaPatch
): Promise<void> {
  const { error } = await supabase
    .from("msy_conversas")
    .update(fullMetaPatch(patch))
    .eq("id", conversationId)
    .eq("usuario_id", userId);

  if (error && isMissingMetadataColumn(error)) {
    const fallback = await supabase
      .from("msy_conversas")
      .update(baseMetaPatch(patch))
      .eq("id", conversationId)
      .eq("usuario_id", userId);
    if (fallback.error) throw fallback.error;
    return;
  }

  if (error) throw error;
}

export async function touchOwnedConversation(
  supabase: CorvusSupabaseClient,
  conversationId: string,
  userId: string,
  updatedAt: number
): Promise<void> {
  const { error } = await supabase
    .from("msy_conversas")
    .update({
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

export async function deleteAllOwnedConversationRecords(
  supabase: CorvusSupabaseClient,
  userId: string
): Promise<void> {
  const { data, error } = await supabase
    .from("msy_conversas")
    .select("id")
    .eq("usuario_id", userId);

  if (error) throw error;

  const ids = (data ?? []).map((row) => row.id as string);
  if (ids.length === 0) return;

  const messageDelete = await supabase
    .from("msy_mensagens")
    .delete()
    .in("conversa_id", ids);

  if (messageDelete.error) throw messageDelete.error;

  const conversationDelete = await supabase
    .from("msy_conversas")
    .delete()
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
    role: serializeRole(message.role),
    texto: message.text,
    created_at: new Date(message.createdAt).toISOString(),
  });

  if (error) throw error;
}

export async function updateMessageByTimestamp(
  supabase: CorvusSupabaseClient,
  conversationId: string,
  createdAt: number,
  newText: string
): Promise<void> {
  const { error } = await supabase
    .from("msy_mensagens")
    .update({ texto: newText })
    .eq("conversa_id", conversationId)
    .eq("created_at", new Date(createdAt).toISOString());

  if (error) throw error;
}

export async function deleteMessagesFrom(
  supabase: CorvusSupabaseClient,
  conversationId: string,
  fromCreatedAt: number
): Promise<void> {
  const { error } = await supabase
    .from("msy_mensagens")
    .delete()
    .eq("conversa_id", conversationId)
    .gte("created_at", new Date(fromCreatedAt).toISOString());

  if (error) throw error;
}

export async function searchConversations(
  supabase: CorvusSupabaseClient,
  userId: string,
  query: string
): Promise<Conversation[]> {
  const term = `%${query.trim().toLowerCase()}%`;

  const [convResult, msgResult] = await Promise.all([
    supabase
      .from("msy_conversas")
      .select(META_CONVERSATION_SELECT)
      .eq("usuario_id", userId)
      .or(`titulo.ilike.${term},summary.ilike.${term}`)
      .order("updated_at", { ascending: false })
      .limit(40),
    supabase
      .from("msy_mensagens")
      .select("conversa_id")
      .ilike("texto", term)
      .limit(200),
  ]);

  if (convResult.error) throw convResult.error;

  const convIds = new Set((convResult.data ?? []).map((row) => row.id as string));
  const msgConvIds = (msgResult.data ?? []).map(
    (row) => (row as { conversa_id: string }).conversa_id
  );

  const missingIds = msgConvIds.filter((id) => !convIds.has(id));
  const uniqueMissingIds = [...new Set(missingIds)];

  let extra: Conversation[] = [];
  if (uniqueMissingIds.length > 0) {
    const extraResult = await supabase
      .from("msy_conversas")
      .select(META_CONVERSATION_SELECT)
      .eq("usuario_id", userId)
      .in("id", uniqueMissingIds.slice(0, 40))
      .order("updated_at", { ascending: false });

    if (!extraResult.error) {
      extra = (extraResult.data ?? []).map(conversationRowToModel);
    }
  }

  const base = (convResult.data ?? []).map(conversationRowToModel);
  const seen = new Set(base.map((c) => c.id));
  const merged = [...base, ...extra.filter((c) => !seen.has(c.id))];
  merged.sort((a, b) => b.updatedAt - a.updatedAt);
  return merged;
}
