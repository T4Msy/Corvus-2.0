import { NextResponse } from "next/server";
import {
  getSupabaseRequestContext,
  isApiError,
} from "@/integrations/supabase/request";
import { getServerConfig } from "@/lib/config";
import { createOpenAIRealtimeToken } from "@/lib/audio/openai";
import { redactSecrets } from "@/lib/security/redact";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const context = await getSupabaseRequestContext(req);
  if (isApiError(context)) return context;

  try {
    const clientSecret = await createOpenAIRealtimeToken();
    const audio = getServerConfig().audio;
    return NextResponse.json({
      ok: true,
      token: clientSecret.token,
      expiresAt: clientSecret.expiresAt,
      model: audio.realtimeTranscriptionModel,
      language: audio.language,
      locale: audio.locale,
      audioFormat: "pcm_24000",
      sampleRate: 24000,
      websocketUrl: "wss://api.openai.com/v1/realtime",
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "audio_token_failed",
          message: redactSecrets(
            err instanceof Error ? err.message : "Nao foi possivel iniciar o ditado."
          ),
        },
      },
      { status: 503 }
    );
  }
}

export function GET() {
  return NextResponse.json(
    { ok: false, error: "Use POST." },
    { status: 405, headers: { Allow: "POST" } }
  );
}
