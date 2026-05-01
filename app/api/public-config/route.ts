import { NextResponse } from "next/server";
import { getServerSupabaseStatus } from "@/integrations/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  const url = (
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    process.env.SUPABASE_URL ??
    ""
  ).trim();
  const anonKey = (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.SUPABASE_ANON_KEY ??
    ""
  ).trim();
  const status = getServerSupabaseStatus();

  return NextResponse.json(
    {
      ok: true,
      supabase: {
        configured: status.configured,
        url,
        anonKey,
        missing: status.missing,
      },
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
