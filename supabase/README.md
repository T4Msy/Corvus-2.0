# Supabase — Corvus V3

Migrations SQL para o Supabase do Corvus. Aplicar **na ordem** abaixo, no SQL Editor do projeto.

| Ordem | Arquivo | Função |
|---|---|---|
| 1 | `corvus_v3_schema.sql` | Tabelas base (`msy_usuarios`, `msy_conversas`, `msy_mensagens`) — idempotente. |
| 2 | `corvus_v3_policies.sql` | RLS + storage bucket de anexos. |
| 3 | `corvus_v3_profile.sql` | Coluna `theme_preference`, `preferences jsonb`, trigger `updated_at`, policies de write em `msy_usuarios`. |

## Checklist após aplicar

1. Verifique no painel **Authentication → Policies** que cada tabela tem RLS habilitada e ao menos as policies abaixo:

   - `msy_usuarios`: `select own`, `insert own`, `update own`
   - `msy_conversas`: `select own`, `insert own`, `update own`, `delete own`
   - `msy_mensagens`: `select own`, `insert own`, `delete own`

2. Em **Storage**, confirme que o bucket `corvus-attachments` existe e é privado.

3. Faça um smoke test rápido:

   ```sql
   -- como service_role no SQL Editor:
   select count(*) from public.msy_usuarios;
   select count(*) from public.msy_conversas;
   ```

4. Após criar uma conta no app (login Supabase), verifique:

   ```sql
   -- substitua pelo email real
   select id, nome, theme_preference, preferences
   from public.msy_usuarios
   where id = (select id from auth.users where email = 'seu@email');
   ```

## Variáveis de ambiente que o app espera

Vão na Vercel (e em `.env.local` para dev). Veja `.env.local.example` na raiz.

| Var | Onde | Por quê |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | público | Auth no browser. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | público | Auth no browser. |
| `SUPABASE_SERVICE_ROLE_KEY` | server-only | API routes do app — usado para bypass de RLS quando configurado. **Sem isso**, as routes usam o token JWT do usuário (RLS aplica). Recomendado: deixar setado. |

## Por que esse split?

- O **schema** é idempotente para você poder reaplicar sem medo.
- As **policies** estão separadas porque você pode quer ajustá-las sem mexer em colunas.
- O **profile** é uma migration incremental (V3) — antes não havia `theme_preference`, e faltavam policies de write em `msy_usuarios`. Sem essa migração, o app **não consegue salvar perfil/tema do usuário**.
