# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Corvus V3 is the modernized version of the institutional AI agent of Ordem Masayoshi (MSY). The repo is a **Next.js 15 (App Router) + TypeScript** application that:

1. Hosts the chat UI (React, client components).
2. Exposes an **API proxy layer** (`/api/corvus/chat`) that forwards requests to an external n8n workflow — the frontend **never** calls n8n directly.
3. Uses **Supabase** for auth, profile data, and conversation history storage (browser-side via SDK).

UI strings, comments, and error messages are in **Portuguese (pt-BR)**.

## Build / run / test

| Command | What it does |
|---|---|
| `npm install` | Install deps. |
| `npm run dev` | Start dev server on `http://localhost:3000`. |
| `npm run build` | Production build (Next standalone). |
| `npm run start` | Run production build locally. |
| `npm run typecheck` | `tsc --noEmit` — no test suite yet. |
| `npm run lint` | Next.js ESLint. |

There is no test runner yet. When adding tests, prefer `vitest` (lightweight, vite-native).

## Critical environment variables

All env vars live in `.env.local` (see `.env.local.example`). Validation happens in `lib/config.ts` — adding a new env var means updating that file.

| Var | Scope | Why |
|---|---|---|
| `N8N_WEBHOOK_URL` | server-only | Real n8n webhook URL. **Never** expose with `NEXT_PUBLIC_*`. |
| `N8N_WEBHOOK_SECRET` | server-only | Sent as `X-Corvus-Secret` header. Pair with Header Auth on the n8n Webhook node. |
| `N8N_TIMEOUT_MS` / `N8N_MAX_RETRIES` | server-only | Tuning knobs for `lib/n8n/client.ts`. |
| `NEXT_PUBLIC_SUPABASE_URL` | public | Browser auth client. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public | Browser auth client. |
| `SUPABASE_SERVICE_ROLE_KEY` | server-only | Admin bypass of RLS — only for admin routes. **Never** prefix with `NEXT_PUBLIC_`. |

## Architecture

```
app/
  layout.tsx            # html shell, fonts, theme attribute
  page.tsx              # mounts <ChatApp />
  globals.css           # ported from legacy/styles.css (3 themes, design system)
  api/
    corvus/chat/        # POST proxy → n8n (the ONLY frontend↔n8n surface)
    health/             # GET liveness check

components/
  ChatApp.tsx           # top-level client component, owns conversation state
  ChatInput.tsx         # textarea + mode selector. Enter = newline; Ctrl+Enter or button = send
  ChatMessages.tsx      # message list + welcome screen + retry-on-error
  LoginScreen.tsx       # email/password + guest entry

hooks/
  useAuth.ts            # Supabase session + profile load + guest mode
  useChat.ts            # send/retry/error state — calls /api/corvus/chat
  useTheme.ts           # dark/light/gray cycle + body[data-theme] + localStorage

lib/
  config.ts             # split client/server env config. validates required vars at access time
  types.ts              # ChatRequestBody, ChatResponse (success+error), ChatMessage, etc.
  n8n/client.ts         # server-only. AbortController timeout + exponential backoff retry
  supabase/
    browser.ts          # client-side (anon)
    server.ts           # server-only (anon + admin variants)

n8n/
  workflow.json         # SANITIZED export of the Corvus workflow (key was stripped)
  README.md             # workflow analysis + ops checklist for the user

legacy/                 # old static site (index.html, app.js, styles.css). Reference only.

public/                 # logos
```

### Key invariant: `lib/n8n/client.ts` is server-only

It imports `"server-only"`. Importing it from a client component triggers a build error. This is intentional — the webhook URL and secret must never reach the browser bundle.

### Data flow for a chat send

1. `ChatInput` → `useChat.send()` builds a typed `ChatRequestBody`.
2. Browser POSTs `/api/corvus/chat` (same-origin → no CORS issue).
3. Route handler (`app/api/corvus/chat/route.ts`) validates, then calls `sendChatToN8n` from `lib/n8n/client.ts`.
4. n8n client adds `X-Corvus-Secret` header, applies timeout (default 30s) and retry (default 2× on 5xx/timeout/429).
5. Response is normalized to `ChatSuccessResponse` (`{ ok: true, reply, meta }`) or `ChatErrorResponse` (`{ ok: false, error: { code, message, retryable } }`).
6. `useChat` translates error codes into Portuguese messages and surfaces a "Tentar novamente" button when `retryable: true`.

### Why no direct frontend → n8n

Three reasons, all fixed by the proxy:
- **CORS**: n8n webhooks don't ship CORS headers by default, browsers block preflight.
- **Secrets**: `N8N_WEBHOOK_SECRET` and webhook URL stay server-side only.
- **Resilience**: timeout, retry, and error normalization happen in one place — clients see a stable contract.

## Conventions

- **Modo do agente**: validate `'corvus' | 'fenrir'` in the API route, never trust the client. The Switch node in n8n still has no default branch — defending here matters.
- **Markdown rendering**: only Corvus replies pass through `marked.parse`. User input is rendered as text. Don't break this asymmetry — it's the XSS guard.
- **Auth**: client-side via `@supabase/supabase-js`. The API route currently trusts `userId` from the body. If we later need to verify, add `@supabase/ssr` and read the JWT from cookies (Phase 2).
- **Style**: legacy CSS was ported as-is to `app/globals.css`. Kept the existing class names and `body[data-theme=...]` mechanism. New components use those classes — don't introduce Tailwind without a migration plan.
- **Notifications**: legacy used a `mostrarNotificacao()` helper. V3 surfaces errors inline in the message list (with retry). When we add toast UI, build a `<Toaster>` provider rather than direct DOM appends.

## What is NOT yet done (Phase 1B+)

The legacy app had the following features that V3 does not yet ship — all tracked as future work, none broken in the current shape:

- **Conversation history & sidebar**: list past conversations, search, rename, delete.
- **Account modal**: edit profile, theme picker UI surface.
- **Persistent multi-conversation**: V3 currently has one in-memory conversation per session.
- **Supabase persistence of messages** (`msy_conversas`, `msy_mensagens`): for authed users, messages should be persisted to Supabase via the API route or a dedicated `/api/conversations/*` set of routes.
- **Mobile sidebar gestures, tour, suggestion cards by role.**
- **Audio transcription, file upload, realtime** — explicitly listed as future capabilities by the user.

When implementing these, follow the existing layering: UI in `components/`, state in `hooks/`, external calls in `lib/<service>/client.ts`, API surface in `app/api/`.

## Deployment (Vercel)

1. Push to GitHub.
2. In Vercel, *Import Project* from the repo. Framework preset: Next.js. Root directory: `/`.
3. **Environment Variables** — add all server-only and `NEXT_PUBLIC_*` vars from `.env.local.example`. Mark server-only vars as not prefixed with `NEXT_PUBLIC_`.
4. Deploy. The webhook URL stays internal to Vercel.

GitHub Pages is **deprecated** for this project — Next.js requires a Node runtime for the API routes. Don't try to `next export`.

## n8n workflow

Lives outside this repo. Sanitized export in `n8n/workflow.json`. Operational checklist for changes the user must make in the n8n UI is in `n8n/README.md`. **Do not edit `n8n/workflow.json` and reimport** — credentials don't survive that round trip. Instead, document what to change in `n8n/README.md` and apply via UI.
