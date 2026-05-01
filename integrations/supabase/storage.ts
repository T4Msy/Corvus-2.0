import type { CorvusSupabaseClient } from "@/integrations/supabase/types";

export const DEFAULT_ATTACHMENTS_BUCKET = "corvus-attachments";

function safeFileName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function uploadConversationFile(
  supabase: CorvusSupabaseClient,
  file: File,
  userId: string,
  conversationId: string,
  bucket = DEFAULT_ATTACHMENTS_BUCKET
): Promise<{ path: string; url: string | null }> {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const path = `${userId}/${conversationId}/${id}-${safeFileName(file.name)}`;

  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    upsert: false,
    cacheControl: "3600",
  });

  if (error) throw error;

  const { data } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, 60 * 60);

  return {
    path,
    url: data?.signedUrl || null,
  };
}

export async function removeConversationFile(
  supabase: CorvusSupabaseClient,
  path: string,
  bucket = DEFAULT_ATTACHMENTS_BUCKET
): Promise<void> {
  const { error } = await supabase.storage.from(bucket).remove([path]);
  if (error) throw error;
}
