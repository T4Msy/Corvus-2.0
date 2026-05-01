import type { RealtimeChannel } from "@supabase/supabase-js";
import type { CorvusSupabaseClient, MessageRow } from "@/integrations/supabase/types";
import type { ChatMessage } from "@/lib/types";

function toChatMessage(row: MessageRow): ChatMessage {
  return {
    id: row.id,
    role: row.role === "assistant" || row.role === "corvus" ? "corvus" : "user",
    text: row.texto,
    createdAt: row.created_at ? Date.parse(row.created_at) : Date.now(),
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
