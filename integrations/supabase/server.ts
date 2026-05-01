import "server-only";

import { createClient } from "@supabase/supabase-js";
import type {
  CorvusSupabaseClient,
  Database,
  SupabaseRuntimeStatus,
} from "@/integrations/supabase/types";

function readUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    process.env.SUPABASE_URL ??
    ""
  ).trim();
}

function readAnonKey(): string {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.SUPABASE_ANON_KEY ??
    ""
  ).trim();
}

function readServiceRoleKey(): string {
  return (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
}

export function hasServerSupabaseServiceRole(): boolean {
  return Boolean(readServiceRoleKey());
}

export function getServerSupabaseStatus(): SupabaseRuntimeStatus {
  const url = readUrl();
  const anonKey = readAnonKey();
  const serviceRole = readServiceRoleKey();
  const missing = [
    !url ? "NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_URL" : "",
    !anonKey ? "NEXT_PUBLIC_SUPABASE_ANON_KEY ou SUPABASE_ANON_KEY" : "",
  ].filter(Boolean);

  return {
    configured: missing.length === 0,
    urlPresent: Boolean(url),
    anonKeyPresent: Boolean(anonKey),
    serviceRolePresent: Boolean(serviceRole),
    missing,
  };
}

function assertConfigured(): void {
  const status = getServerSupabaseStatus();
  if (!status.configured) {
    throw new Error(
      `[corvus/supabase] Configuracao server incompleta: ${status.missing.join(
        ", "
      )}.`
    );
  }
}

export function createServerSupabaseClient(
  accessToken?: string | null
): CorvusSupabaseClient {
  assertConfigured();

  return createClient<Database>(readUrl(), readAnonKey(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: accessToken
        ? {
            Authorization: `Bearer ${accessToken}`,
          }
        : {},
    },
  });
}

export function createAdminSupabaseClient(): CorvusSupabaseClient {
  assertConfigured();

  const serviceRoleKey = readServiceRoleKey();
  if (!serviceRoleKey) {
    throw new Error(
      "[corvus/supabase] SUPABASE_SERVICE_ROLE_KEY ausente."
    );
  }

  return createClient<Database>(readUrl(), serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
