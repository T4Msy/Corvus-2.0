import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getServerConfig } from "@/lib/config";

/**
 * Cliente Supabase server-side com a anon key.
 * Use para operações respeitando RLS, em nome do usuário.
 */
export function getServerSupabase(): SupabaseClient {
  const { supabase } = getServerConfig();
  return createClient(supabase.url, supabase.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Cliente Supabase admin (service role) — bypass RLS.
 * Use APENAS em rotas administrativas. Lança se SUPABASE_SERVICE_ROLE_KEY ausente.
 */
export function getAdminSupabase(): SupabaseClient {
  const { supabase } = getServerConfig();
  if (!supabase.serviceRoleKey) {
    throw new Error(
      "[corvus/supabase] SUPABASE_SERVICE_ROLE_KEY ausente — admin client indisponível."
    );
  }
  return createClient(supabase.url, supabase.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
