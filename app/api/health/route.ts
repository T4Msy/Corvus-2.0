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
    supabase: {
      configured: supabase.configured,
      urlPresent: supabase.urlPresent,
      anonKeyPresent: supabase.anonKeyPresent,
      serviceRolePresent: supabase.serviceRolePresent,
      missing: supabase.missing,
    },
  });
}
