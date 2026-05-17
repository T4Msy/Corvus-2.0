import type { RealtimeChannel } from "@supabase/supabase-js";
import type { CorvusSupabaseClient, MessageRow } from "@/integrations/supabase/types";
import type { ChatMessage, ConversationAttachment } from "@/lib/types";

function normalizeAttachments(
  raw: unknown,
  conversationId: string
): ConversationAttachment[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item): ConversationAttachment | null => {
      if (!item || typeof item !== "object") return null;
      const value = item as Partial<ConversationAttachment>;
      if (!value.id || !value.path || !value.name || typeof value.size !== "number") {
        return null;
      }
      return {
        id: value.id,
        conversationId,
        path: value.path,
        url: typeof value.url === "string" ? value.url : null,
        name: value.name,
        type: value.type || "application/octet-stream",
        size: value.size,
        createdAt:
          typeof value.createdAt === "number" ? value.createdAt : Date.now(),
      };
    })
    .filter((item): item is ConversationAttachment => Boolean(item));
}

function toChatMessage(row: MessageRow): ChatMessage {
  const attachments = normalizeAttachments(row.attachments, row.conversa_id);
  return {
    id: row.id,
    role: row.role === "assistant" || row.role === "corvus" ? "corvus" : "user",
    text: row.texto,
    createdAt: row.created_at ? Date.parse(row.created_at) : Date.now(),
    ...(attachments.length > 0 ? { attachments } : {}),
  };
}

export function subscribeToConversationMessages(
  supabase: CorvusSupabaseClient,
  conversationId: string,
  onMessage: (message: ChatMessage) => void,
  onError?: (message: string) => void
): RealtimeChannel {
  const channel = supabase
    .channel(`corvus:conversation:${conversationId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "msy_mensagens",
        filter: `conversa_id=eq.${conversationId}`,
      },
      (payload) => onMessage(toChatMessage(payload.new as MessageRow))
    )
    .subscribe((status, error) => {
      if (error) onError?.(error.message);
      if (status === "CHANNEL_ERROR") {
        onError?.("Realtime indisponivel para msy_mensagens.");
      }
    });

  return channel;
}

export function unsubscribeFromChannel(
  supabase: CorvusSupabaseClient,
  channel: RealtimeChannel | null
): void {
  if (!channel) return;
  void supabase.removeChannel(channel);
}
