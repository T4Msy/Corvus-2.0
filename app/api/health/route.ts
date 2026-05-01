import { NextResponse } from "next/server";
import { getServerSupabaseStatus } from "@/integrations/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  const supabase = getServerSupabaseStatus();

  return NextResponse.json({
    ok: true,
    service: "corvus-v3",
    time: new Date().toISOString(),
    n8n: {
      configured: Boolean(process.env.N8N_WEBHOOK_URL?.trim()),
      webhookUrlPresent: Boolean(process.env.N8N_WEBHOOK_URL?.trim()),
      webhookSecretPresent: Boolean(process.env.N8N_WEBHOOK_SECRET?.trim()),
    },
    supabase: {
      configured: supabase.configured,
      urlPresent: supabase.urlPresent,
      anonKeyPresent: supabase.anonKeyPresent,
      serviceRolePresent: supabase.serviceRolePresent,
      missing: supabase.missing,
    },
  });
}
