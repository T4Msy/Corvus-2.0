# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Corvus V3 is the Masayoshi (MSY) institutional AI agent — a Next.js 15 (App Router) + TypeScript + Vercel + Supabase + n8n SaaS. The app is a chat product with persistent conversations, profile/settings, and a server-side proxy to an external n8n workflow.

UI strings, comments, error messages: **Portuguese (pt-BR)**.

## Build / run / test

| Command | Effect |
|---|---|
| `npm install` | Install deps. |
| `npm run dev` | Start dev server on `http://localhost:3000`. |
| `npm run build` | Production build. |
| `npm run typecheck` | `tsc --noEmit`. |
| `npm run lint` | Next.js ESLint. |

No test runner yet. When adding tests, prefer `vitest`.

## Critical environment variables

Validated in `lib/config.ts`. Add new vars there.

| Var | Scope | Purpose |
|---|---|---|
| `N8N_WEBHOOK_URL` | server-only | Real n8n webhook URL (do not expose). |
| `N8N_WEBHOOK_SECRET` | server-only | Sent as `X-Corvus-Secret`. Pair with Header Auth on n8n Webhook node. |
| `N8N_TIMEOUT_MS`, `N8N_MAX_RETRIES` | server-only | Tuning for `lib/n8n/client.ts`. |
| `NEXT_PUBLIC_SUPABASE_URL` | public | Browser auth client. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public | Browser auth client. |
| `SUPABASE_SERVICE_ROLE_KEY` | server-only | Used by API routes for bypass-RLS when needed. Strongly recommended; without it, routes use the user's JWT and rely on RLS being correct. |
| `OPENAI_API_KEY` | server-only | Powers all multimodal/fallback paths: audio transcription (`lib/audio/openai.ts`), image vision (`lib/vision/openai.ts`), and the OpenAI-direct reply fallback in the chat route. Optional — absent ⇒ those paths no-op/throw and only n8n is used. |
| `OPENAI_VISION_MODEL`, `OPENAI_TRANSCRIPTION_MODEL`, `OPENAI_AUDIO_FALLBACK_MODEL`, `OPENAI_REALTIME_TRANSCRIPTION_MODEL` | server-only | Model overrides (defaults in `lib/config.ts`). |
| `CORVUS_SERVER_VISION_FALLBACK` | server-only | `"true"` ⇒ run OpenAI vision **before** calling n8n (eager). Otherwise vision only runs **after** n8n returns an image-refusal reply (lazy fallback). |
| `AUDIO_STT_LANGUAGE`, `AUDIO_STT_LOCALE` | server-only | Transcription language/locale (default `pt` / `pt-BR`). |
| `NEXT_PUBLIC_APP_URL` | public | App base URL (optional). |

The browser also has a fallback: `/api/public-config` exposes the public Supabase URL + anon key when `NEXT_PUBLIC_*` were missing at build time. Used by `hydrateBrowserSupabaseConfig` in `integrations/supabase/client.ts`. Keep this — it lets you fix env without rebuilding.

## Architecture

```
app/
  layout.tsx               # html shell, fonts, theme attribute
  page.tsx                 # mounts <ChatApp />
  globals.css              # design system (~1100 lines, dark + light)
  api/
    corvus/chat/           # POST proxy → n8n + multimodal pipeline + fallback cascade (see below)
    corvus/enhance/        # POST refinador de prompt (OpenAI direto, isolado do chat) → reescreve ideia crua em prompt melhor
    conversations/         # GET (list), POST (create)
    conversations/search/  # GET full-text search across the user's messages
    conversations/[conversationId]/         # PATCH (rename + pinned/favorite/archived/tags), DELETE
    conversations/[conversationId]/messages # GET (history), POST (save + bump title)
    profile/               # GET, PATCH (name, avatar_url, theme_preference)
    health/                # GET liveness + Supabase/n8n/OpenAI config flags
    public-config/         # GET runtime supabase URL/anon — browser fallback

components/
  ChatApp.tsx              # top-level shell — orchestrates everything
  ChatInput.tsx            # composer + attachment picker. Enter = newline; Ctrl+Enter or button = send
  ChatMessages.tsx         # message list + welcome + retry inline + safe-markdown (highlight.js code)
  CommandPalette.tsx       # ⌘K palette — nav, mode switch, quick prompts, history filters (botão da sidebar removido; ainda acessível por ⌘K)
  PromptEnhancer.tsx       # painel "Aprimorar" — refina ideia crua em prompt melhor via /api/corvus/enhance; injeta no composer ou envia
  CustomLettersPanel.tsx   # Unicode text styler UI (drives lib/custom-text)
  ShortcutsDialog.tsx      # keyboard-shortcuts cheat sheet
  ToastProvider.tsx        # toast/notification context (useToast)
  LoginScreen.tsx          # email/password + guest entry
  SettingsDialog.tsx       # modal: profile (name, avatar, role) + theme + logout

hooks/
  useAuth.ts               # Supabase session + profile (initial load) + mergeProfile
  useChat.ts               # send, retry, error. POSTs to /api/corvus/chat
  useConversations.ts      # CRUD + persistMessage + pin/favorite/archive, hits /api/conversations/*
  useConversationAttachments.ts # upload/list/remove attachments via integrations/supabase/storage
  useMessageSearch.ts      # debounced search against /api/conversations/search
  useStorageUrl.ts         # resolve a storage path → signed URL (avatars, attachments)
  usePreferences.ts        # /api/profile bridge — single source of truth post-login
  useTheme.ts              # dark | light | system, persisted to localStorage

integrations/supabase/     # tudo que toca Supabase mora aqui
  client.ts                # browser client (anon)
  server.ts                # server client (anon w/ JWT) + admin (service role)
  request.ts               # API route helper: bearer + getUser + apiError
  conversations.ts         # SQL helpers for conversas/mensagens
  profile.ts               # SQL helpers for msy_usuarios + auto-provision
  auth.ts                  # client-side profile loader (used by useAuth)
  realtime.ts              # postgres_changes subscription helpers (not yet wired)
  storage.ts               # bucket helpers — upload/sign/remove attachments (WIRED, bucket `corvus-attachments`)
  types.ts                 # Database type + Json + UserProfileRow (with theme/preferences)
  index.ts                 # public re-exports

lib/
  config.ts                # env split client/server with validation
  types.ts                 # public domain types — ChatMessage, Conversation, attachments, *Context, UserProfile
  n8n/client.ts            # server-only. AbortController + retry. import "server-only"
  audio/openai.ts          # server-only. Whisper/gpt-4o transcription + audio-transcript reply fallback
  vision/openai.ts         # server-only. OpenAI Responses image analysis → VisualContext (OCR/desc)
  documents/extract.ts     # server-only. PDF (pdf-parse) / DOCX (mammoth) / text → DocumentContext
  custom-text/             # Unicode text styler (catalog + transform) — pure client util, no server
  export.ts                # export a conversation (markdown/text)
  utils/getGreeting.ts     # time-of-day greeting string
  supabase/                # legacy re-exports of integrations/supabase/* — keep for now

supabase/                  # SQL migrations (apply in this order)
  corvus_v3_schema.sql                       # tables (idempotent)
  corvus_v3_policies.sql                     # RLS + storage bucket
  corvus_v3_profile.sql                      # ⭐ theme_preference + write policies on msy_usuarios
  corvus_v3_conversation_metadata.sql        # pinned/favorite/archived/tags/summary + indexes
  corvus_v3_fix_conversas_updated_trigger.sql # updated_at trigger fix
  corvus_v3_messages_update_policy.sql       # RLS UPDATE on msy_mensagens (needed to edit messages w/o service role)

n8n/                       # workflow JSON (sanitized) + ops checklist

legacy/                    # old vanilla JS site, reference only
public/                    # logos
```

### Persistence flow (full path)

1. User types message in `ChatInput`.
2. `ChatApp.send()` → `chat.send({...})` (in `useChat`).
3. `useChat.send` POSTs `/api/corvus/chat` with bearer token. **Both `onUserMessage` and `onAssistantMessage` callbacks fire** — they invoke `conversations.persistMessage(convId, msg)`.
4. `conversations.persistMessage` updates local state immediately, then if `auth.status === "authed"` POSTs `/api/conversations/[id]/messages` with `{ message, title, updatedAt }`.
5. Server route validates JWT (`getSupabaseRequestContext`), checks `userCanAccessConversation`, calls `saveMessage` + `updateOwnedConversationMeta` (this is what persists the title).
6. If service role key is set, the route uses admin client (bypasses RLS). Else, the user's JWT is forwarded and RLS applies — that's why `corvus_v3_profile.sql` adds INSERT/UPDATE policies on `msy_usuarios`.

### Chat pipeline & fallback cascade (`app/api/corvus/chat/route.ts`)

The chat route is the most complex server code. It is NOT a thin proxy — it pre-processes attachments and degrades gracefully when n8n returns nothing useful.

1. **Attachments** arrive as `ChatAttachment[]` (`{id, path, name, type, size}`) — only the **storage path**, never raw bytes. Attachments require an authed session and a `conversationId`, and the path must start with `${userId}/${conversationId}/` (ownership guard). Unsupported types are rejected up front.
2. Each accepted attachment gets a short-lived **signed URL** (`createAttachmentSignedUrl`, ~10 min) and is processed by type:
   - **Images** → optionally inlined as base64 data URLs (≤5 MB); vision analysis (`analyzeImagesWithOpenAI`) runs eagerly only if `CORVUS_SERVER_VISION_FALLBACK=true`.
   - **Documents** (PDF/DOCX/txt/md/csv/json) → text extracted server-side (`extractDocumentText`), built into a `DocumentContext`.
   - **Audio** → downloaded and transcribed (`transcribeAudioBuffer`).
3. Extracted contexts are **appended to the user message** as labeled text blocks before forwarding, and also passed as structured fields (`imageAttachments`, `documentContext`, `audioContext`, etc.) so the n8n workflow can use either.
4. `sendChatToN8n(payload)` is called. Then a **fallback cascade** runs if the reply is empty/invalid (`upstream_invalid_response`):
   a. If audio was present → retry n8n with transcript-only, then `answerAudioTranscriptFallback` (OpenAI).
   b. Otherwise → `answerWithServerFallback` answers directly via OpenAI chat completions (respects `modo`).
   c. If OpenAI also unavailable → return the original upstream error with an operator-facing hint.
5. **Image-refusal recovery**: if n8n *does* reply but the text looks like "I can't see images" (`looksLikeImageRefusal`), run vision and return `directVisionReply` instead. This is why image analysis can work even when the n8n agent claims it can't.

All of this is best-effort: every OpenAI path no-ops cleanly when `OPENAI_API_KEY` is absent, leaving pure n8n behavior.

### Profile flow

1. `useAuth` loads minimal profile via `loadUserProfile` (client-side, RLS-bound).
2. `usePreferences` (mounted in `ChatApp`) immediately fetches `/api/profile` server-side. The route auto-creates the `msy_usuarios` row if missing — robust to fresh sign-ups.
3. `usePreferences.onProfile` callback patches both `useAuth.mergeProfile` and `useTheme.setPreference` — single source of truth for profile + theme after login.
4. Editing in `SettingsDialog` calls `preferences.updateProfile({...})` → PATCH `/api/profile` → server `updateProfile()`.

### Why no direct frontend → n8n

Three reasons:
- **CORS**: n8n webhooks ship no CORS headers; preflight blocks browsers.
- **Secrets**: `N8N_WEBHOOK_URL` and `N8N_WEBHOOK_SECRET` stay server-side only.
- **Resilience**: timeout, retry, and error normalization centralized in `lib/n8n/client.ts`.

## Conventions

- **Modes**: `'corvus' | 'fenrir'`. Server validates and forces fallback to `'corvus'` if invalid — protects against the n8n Switch having no default branch.
- **Markdown**: only Corvus replies pass through `marked.parse` + DOMParser sanitization in `ChatMessages.renderSafeMarkdown` (code blocks highlighted with `highlight.js`). User input rendered as text. **Don't break this asymmetry — it's the XSS guard.**
- **Attachments**: the client uploads to the `corvus-attachments` bucket under `${userId}/${conversationId}/...` and sends only the **path** to `/api/corvus/chat`. The server re-validates ownership by path prefix and never trusts client-sent URLs/bytes. Keep this contract.
- **Theme**: `dark | light | system`. Persisted in `localStorage` always (no FOUC) and in Supabase when authed.
- **Auth**: client-side via `@supabase/supabase-js` (PKCE). Bearer token forwarded to API routes that touch user data. **Never trust `userId` in the body** — derive from JWT in `getSupabaseRequestContext`.
- **Error display**: persistence/profile errors surface as `sidebar-error` (sidebar) or `persistence-banner` (top of chat). Chat send errors show inline at bottom of message stream with retry button.
- **Settings UX**: theme applies optimistically (instant local), then persists async to server. Profile name has explicit save button.
- **Rate limiting**: `/api/corvus/chat` é protegido por `lib/rate-limit.ts` (in-memory, por `userId` autenticado ou IP). É best-effort por instância serverless — não é um quota distribuído (ver backlog: Upstash).
- **CSS — contrato de camadas**: `app/globals.css` define os tokens base; `app/masayoshi-redesign.css` é a **camada de override final** (carregada por último) que reaponta tokens para a paleta escura via `--msy-*`. O tema light depende do `data-theme` no `<body>` (setado em `layout.tsx`) para vencer os overrides `:root` por herança. **Não remova o `data-theme` do body** e não trate os dois arquivos como duplicação acidental — ler o cabeçalho de `masayoshi-redesign.css`.

## What's done in V3

- Persistence: conversations, messages, title (auto-derived from first user message + manual rename via PATCH).
- Profile + Settings dialog with theme picker.
- Auto-provision of `msy_usuarios` row on first profile load.
- RLS policies for INSERT/UPDATE on `msy_usuarios` (was missing).
- Premium minimalist redesign (Claude-inspired, MSY palette).
- Dark / Light / System theme.
- Mobile-first responsive sidebar.
- Enter = newline, Ctrl+Enter = send.
- Safe-markdown for assistant replies.
- Copy button per message, retry on chat error.
- Server-side timeout + retry on n8n calls.
- **Multimodal attachments**: images (OpenAI vision), audio (transcription), documents (PDF/DOCX/text) — uploaded to the `corvus-attachments` bucket and analyzed server-side. See the chat pipeline section.
- **OpenAI fallback cascade** when n8n returns no usable reply.
- **Conversation metadata**: pin / favorite / archive / tags, message search, rename — all wired (UI + endpoints).
- **Command palette** (⌘K), keyboard-shortcuts dialog, **toast/notification system** (`ToastProvider`).
- **Conversation export** (`lib/export.ts`) and **Unicode text styler** (`lib/custom-text` + `CustomLettersPanel`).

## What's NOT yet done

- **Realtime sync** between tabs (`integrations/supabase/realtime.ts` is ready but not wired).
- **Onboarding/tour** for first-time users.
- **Rate limiting** on `/api/corvus/chat` (recommend `@upstash/ratelimit`).
- **Tests**.
- **Streaming** of n8n responses (n8n doesn't support SSE without custom work).
- **`@supabase/ssr` cookies-based auth** (currently bearer in headers — works, but cookies are tighter).
- **Multi-conversation sync between Supabase ↔ local guest state** when a guest later authenticates.

## Deployment (Vercel)

1. Apply SQL migrations on Supabase in order: schema → policies → profile → conversation_metadata → fix_conversas_updated_trigger → messages_update_policy. See `supabase/README.md`.
2. Push to GitHub. Vercel auto-deploys from `main`.
3. In Vercel project settings → Environment Variables, ensure all from `.env.local.example` are present in Production scope.
4. Apply n8n changes from `n8n/README.md` (Header Auth, default Switch, OpenAI key revoke).
