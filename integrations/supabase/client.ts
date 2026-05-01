"use client";

import { createClient } from "@supabase/supabase-js";
import type {
  CorvusSupabaseClient,
  Database,
  SupabaseRuntimeStatus,
} from "@/integrations/supabase/types";

let cached: CorvusSupabaseClient | null = null;

function publicUrl(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
}

function publicAnonKey(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";
}

export function getBrowserSupabaseStatus(): SupabaseRuntimeStatus {
  const url = publicUrl();
  const anonKey = publicAnonKey();
  const missing = [
    !url ? "NEXT_PUBLIC_SUPABASE_URL" : "",
    !anonKey ? "NEXT_PUBLIC_SUPABASE_ANON_KEY" : "",
  ].filter(Boolean);

  return {
    configured: missing.length === 0,
    urlPresent: Boolean(url),
    anonKeyPresent: Boolean(anonKey),
    missing,
  };
}

export function getBrowserSupabase(): CorvusSupabaseClient {
  if (cached) return cached;

  const status = getBrowserSupabaseStatus();
  if (!status.configured) {
    throw new Error(
      `[corvus/supabase] Configuracao publica incompleta: ${status.missing.join(
        ", "
      )}.`
    );
  }

  cached = createClient<Database>(publicUrl(), publicAnonKey(), {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: "pkce",
      storageKey: "corvus.supabase.auth",
    },
    realtime: {
      params: {
        eventsPerSecond: 12,
      },
    },
  });

  return cached;
}
