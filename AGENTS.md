# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

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

The browser also has a fallback: `/api/public-config` exposes the public Supabase URL + anon key when `NEXT_PUBLIC_*` were missing at build time. Used by `hydrateBrowserSupabaseConfig` in `integrations/supabase/client.ts`. Keep this — it lets you fix env without rebuilding.

## Architecture

```
app/
  layout.tsx               # html shell, fonts, theme attribute
  page.tsx                 # mounts <ChatApp />
  globals.css              # design system (~1100 lines, dark + light)
  api/
    corvus/chat/           # POST proxy → n8n (server-only n8n URL)
    conversations/         # GET (list), POST (create)
    conversations/[conversationId]/         # PATCH (rename), DELETE
    conversations/[conversationId]/messages # GET (history), POST (save + bump title)
    profile/               # GET, PATCH (name, avatar_url, theme_preference)
    health/                # GET liveness + Supabase/n8n config flags
    public-config/         # GET runtime supabase URL/anon — browser fallback

components/
  ChatApp.tsx              # top-level shell — orchestrates everything
  ChatInput.tsx            # composer. Enter = newline; Ctrl+Enter or button = send
  ChatMessages.tsx         # message list + welcome + retry inline + safe-markdown
  LoginScreen.tsx          # email/password + guest entry
  SettingsDialog.tsx       # modal: profile (name, avatar, role) + theme + logout

hooks/
  useAuth.ts               # Supabase session + profile (initial load) + mergeProfile
  useChat.ts               # send, retry, error. POSTs to /api/corvus/chat
  useConversations.ts      # CRUD + persistMessage, hits /api/conversations/*
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
  storage.ts               # bucket helpers (not yet wired)
  types.ts                 # Database type + Json + UserProfileRow (with theme/preferences)
  index.ts                 # public re-exports

lib/
  config.ts                # env split client/server with validation
  types.ts                 # public domain types — ChatMessage, Conversation, UserProfile, ThemePreference
  n8n/client.ts            # server-only. AbortController + retry. import "server-only"
  supabase/                # legacy re-exports of integrations/supabase/* — keep for now

supabase/                  # SQL migrations
  corvus_v3_schema.sql     # tables (idempotent)
  corvus_v3_policies.sql   # RLS + storage bucket
  corvus_v3_profile.sql    # ⭐ V3 — theme_preference + write policies on msy_usuarios

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
- **Markdown**: only Corvus replies pass through `marked.parse` + DOMParser sanitization in `ChatMessages.renderSafeMarkdown`. User input rendered as text. **Don't break this asymmetry — it's the XSS guard.**
- **Theme**: `dark | light | system`. Persisted in `localStorage` always (no FOUC) and in Supabase when authed.
- **Auth**: client-side via `@supabase/supabase-js` (PKCE). Bearer token forwarded to API routes that touch user data. **Never trust `userId` in the body** — derive from JWT in `getSupabaseRequestContext`.
- **Error display**: persistence/profile errors surface as `sidebar-error` (sidebar) or `persistence-banner` (top of chat). Chat send errors show inline at bottom of message stream with retry button.
- **Settings UX**: theme applies optimistically (instant local), then persists async to server. Profile name has explicit save button.

## What's done in V3

- Persistence: conversations, messages, title (auto-derived from first user message + manual rename via PATCH).
- Profile + Settings dialog with theme picker.
- Auto-provision of `msy_usuarios` row on first profile load.
- RLS policies for INSERT/UPDATE on `msy_usuarios` (was missing).
- Premium minimalist redesign (Codex-inspired, MSY palette).
- Dark / Light / System theme.
- Mobile-first responsive sidebar.
- Enter = newline, Ctrl+Enter = send.
- Safe-markdown for assistant replies.
- Copy button per message, retry on chat error.
- Server-side timeout + retry on n8n calls.

## What's NOT yet done

- **Avatar upload UI** (`integrations/supabase/storage.ts` exists but isn't wired).
- **Realtime sync** between tabs (`integrations/supabase/realtime.ts` is ready).
- **Toast/notification system** (errors are inline only).
- **Onboarding/tour** for first-time users.
- **Conversation rename UI** (the PATCH endpoint exists; no edit affordance yet).
- **Rate limiting** on `/api/corvus/chat` (recommend `@upstash/ratelimit`).
- **Tests**.
- **Streaming** of n8n responses (n8n doesn't support SSE without custom work).
- **`@supabase/ssr` cookies-based auth** (currently bearer in headers — works, but cookies are tighter).
- **Multi-conversation sync between Supabase ↔ local guest state** when a guest later authenticates.

## Deployment (Vercel)

1. Apply SQL migrations on Supabase: schema → policies → profile (in that order). See `supabase/README.md`.
2. Push to GitHub. Vercel auto-deploys from `main`.
3. In Vercel project settings → Environment Variables, ensure all from `.env.local.example` are present in Production scope.
4. Apply n8n changes from `n8n/README.md` (Header Auth, default Switch, OpenAI key revoke).
