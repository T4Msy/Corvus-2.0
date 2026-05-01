"use client";

import { createClient } from "@supabase/supabase-js";
import type {
  CorvusSupabaseClient,
  Database,
  SupabaseRuntimeStatus,
} from "@/integrations/supabase/types";

let cached: CorvusSupabaseClient | null = null;
let runtimeUrl = "";
let runtimeAnonKey = "";

function publicUrl(): string {
  return runtimeUrl || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";
}

function publicAnonKey(): string {
  return (
    runtimeAnonKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || ""
  );
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

export function setBrowserSupabaseConfig(url: string, anonKey: string): void {
  if (cached) return;
  runtimeUrl = url.trim();
  runtimeAnonKey = anonKey.trim();
}

export async function hydrateBrowserSupabaseConfig(): Promise<SupabaseRuntimeStatus> {
  const current = getBrowserSupabaseStatus();
  if (current.configured) return current;

  try {
    const response = await fetch("/api/public-config", {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    const data = (await response.json().catch(() => null)) as
      | {
          supabase?: {
            url?: string;
            anonKey?: string;
          };
        }
      | null;

    const url = data?.supabase?.url?.trim() ?? "";
    const anonKey = data?.supabase?.anonKey?.trim() ?? "";
    if (url && anonKey) {
      setBrowserSupabaseConfig(url, anonKey);
    }
  } catch {
    /* Mantem o status original para a UI de erro. */
  }

  return getBrowserSupabaseStatus();
}
