"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { clientConfig } from "@/lib/config";

let cached: SupabaseClient | null = null;

export function getBrowserSupabase(): SupabaseClient {
  if (cached) return cached;
  if (!clientConfig.supabaseUrl || !clientConfig.supabaseAnonKey) {
    throw new Error(
      "[corvus/supabase] NEXT_PUBLIC_SUPABASE_URL ou NEXT_PUBLIC_SUPABASE_ANON_KEY ausentes."
    );
  }
  cached = createClient(clientConfig.supabaseUrl, clientConfig.supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  return cached;
}
