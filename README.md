<div align="center">

# 🦅 CORVUS V3

### Agente Oficial de IA da Ordem Masayoshi — Next.js + TypeScript + Vercel + n8n + Supabase

</div>

---

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend | Next.js 15 (App Router), React 19, TypeScript |
| API layer | Next.js Route Handlers (`app/api/*`) |
| Auth + DB | Supabase (Postgres + pgvector + Auth) |
| Motor IA | n8n self-hosted (workflow `Corvus`) |
| Modelo | OpenAI gpt-4o (via n8n) |
| Hospedagem | Vercel |

---

## Setup local

```bash
# 1. Instalar dependências
npm install

# 2. Copiar template de variáveis
cp .env.local.example .env.local
# Edite .env.local com suas credenciais

# 3. Rodar
npm run dev
```

Acesse `http://localhost:3000`.

---

## Variáveis de ambiente

Veja `.env.local.example` para a lista completa. Os essenciais:

| Variável | Onde |
|---|---|
| `N8N_WEBHOOK_URL` | URL do webhook do workflow no n8n (server-only). |
| `N8N_WEBHOOK_SECRET` | Header secreto exigido pelo webhook. **Crítico em produção.** |
| `NEXT_PUBLIC_SUPABASE_URL` | URL do projeto Supabase. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon key do Supabase (pública por design). |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role — server-only, opcional. |

⚠️ **Nunca commitar `.env.local`.** O `.gitignore` já bloqueia.

---

## Deploy no Vercel

1. Push do repo no GitHub.
2. *New Project* na Vercel → importe o repo. Framework preset = Next.js.
3. Em *Environment Variables*, adicione todas as vars do `.env.local.example` com os valores reais. Defina escopo: *Production*, *Preview*, *Development*.
4. Deploy. A primeira build leva ~2 minutos.
5. Após o deploy, atualize o n8n para aceitar a origem do Vercel (caso configure CORS — opcional, já que é o servidor da Vercel que chama o n8n, não o navegador).

GitHub Pages **não é mais suportado** — V3 precisa de Node runtime para o proxy da API.

---

## Estrutura

```
app/                    # Next.js App Router
  api/corvus/chat/      # Proxy: browser → Vercel → n8n
  api/health/           # GET /api/health
components/             # React client components
hooks/                  # useAuth / useChat / useTheme
lib/
  config.ts             # env-vars validados
  types.ts              # tipos compartilhados
  n8n/client.ts         # server-only. timeout + retry
  supabase/             # client browser + server
n8n/                    # workflow.json sanitizado + README operacional
legacy/                 # versão antiga (HTML/CSS/JS estática) — referência
public/                 # logos
```

Detalhes arquiteturais em `CLAUDE.md`.

---

## Workflow n8n

O workflow `Corvus — Ingestão via Formulário` **não é recriado** pelo deploy. O export sanitizado fica em `n8n/workflow.json` apenas como documentação.

Ações operacionais que você faz na UI do n8n estão listadas em `n8n/README.md`:

- Revogar a chave OpenAI vazada (urgente).
- Adicionar Header Auth com `X-Corvus-Secret`.
- Adicionar branch default no Switch.
- Configurar CORS (opcional).
- Renomear o webhook de `corvus-ingestao` para `corvus-chat` (recomendado).

---

## Roadmap V3

- [x] Bootstrap Next.js + TS + Vercel
- [x] API proxy `/api/corvus/chat` com timeout/retry
- [x] Migração visual (3 temas mantidos)
- [x] Modos Corvus / Fenrir
- [x] Login Supabase + modo convidado
- [x] Enter = quebra de linha, Ctrl+Enter / botão = envia
- [ ] Histórico de conversas (sidebar)
- [ ] Persistência de mensagens em `msy_conversas`/`msy_mensagens`
- [ ] Modal de conta + theme picker rico
- [ ] Realtime
- [ ] Upload de arquivos
- [ ] Transcrição de áudio
- [ ] Múltiplos agentes especializados
- [ ] Analytics

---

## Autor

**Tales — T4 MASAYOSHI** · Fundador da Ordem Masayoshi

[![GitHub](https://img.shields.io/badge/GitHub-T4Msy-181717?style=flat-square&logo=github)](https://github.com/T4Msy)

---

<div align="center">
  <sub>Ordem Masayoshi © 2026</sub>
</div>
