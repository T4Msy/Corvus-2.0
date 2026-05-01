-- Corvus IA V3 — extensao do perfil + auto-provisionamento
-- Aplicar AFTER corvus_v3_schema.sql e corvus_v3_policies.sql.

-- 1. Coluna theme_preference (dark | light | system)
alter table if exists public.msy_usuarios
  add column if not exists theme_preference text default 'dark';

alter table if exists public.msy_usuarios
  drop constraint if exists msy_usuarios_theme_preference_chk;

alter table if exists public.msy_usuarios
  add constraint msy_usuarios_theme_preference_chk
  check (theme_preference in ('dark', 'light', 'system'));

-- 2. Coluna preferences (jsonb) para preferencias futuras (notificacoes etc.)
alter table if exists public.msy_usuarios
  add column if not exists preferences jsonb default '{}'::jsonb;

-- 3. Coluna/trigger updated_at automatico
alter table if exists public.msy_usuarios
  add column if not exists updated_at timestamptz default now();

create or replace function public.msy_usuarios_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists msy_usuarios_set_updated_at on public.msy_usuarios;
create trigger msy_usuarios_set_updated_at
before update on public.msy_usuarios
for each row execute function public.msy_usuarios_touch_updated_at();

-- 4. Policies de write para o proprio perfil (essencial: sem isso o user
--    nao consegue criar/atualizar a propria linha em msy_usuarios)

drop policy if exists "corvus usuarios insert own" on public.msy_usuarios;
create policy "corvus usuarios insert own"
on public.msy_usuarios
for insert
to authenticated
with check (id::text = auth.uid()::text);

drop policy if exists "corvus usuarios update own" on public.msy_usuarios;
create policy "corvus usuarios update own"
on public.msy_usuarios
for update
to authenticated
using (id::text = auth.uid()::text)
with check (id::text = auth.uid()::text);

-- 5. Index para listagens
create index if not exists msy_usuarios_updated_idx
  on public.msy_usuarios (updated_at desc);
