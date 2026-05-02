-- Corvus IA V3 - schema baseline/compatibilidade
-- Execute no SQL Editor do Supabase antes das policies.
-- Seguro para bases existentes: usa create/alter ... if not exists.

create extension if not exists pgcrypto;

create table if not exists public.msy_usuarios (
  id text primary key,
  nome text,
  nome_interno text,
  cargo text,
  sigla_cargo text,
  tipo text default 'membro',
  avatar_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table if exists public.msy_usuarios
  add column if not exists nome text,
  add column if not exists nome_interno text,
  add column if not exists cargo text,
  add column if not exists sigla_cargo text,
  add column if not exists tipo text default 'membro',
  add column if not exists avatar_url text,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

create table if not exists public.msy_conversas (
  id text primary key,
  usuario_id text not null,
  titulo text default 'Nova conversa',
  session_id text,
  updated_at timestamptz default now()
);

alter table if exists public.msy_conversas
  add column if not exists usuario_id text,
  add column if not exists titulo text default 'Nova conversa',
  add column if not exists session_id text,
  add column if not exists updated_at timestamptz default now();

do $$
declare
  trigger_record record;
begin
  for trigger_record in
    select trigger_item.tgname
    from pg_trigger trigger_item
    join pg_class table_item
      on table_item.oid = trigger_item.tgrelid
    join pg_namespace schema_item
      on schema_item.oid = table_item.relnamespace
    join pg_proc function_item
      on function_item.oid = trigger_item.tgfoid
    where schema_item.nspname = 'public'
      and table_item.relname = 'msy_conversas'
      and not trigger_item.tgisinternal
      and pg_get_functiondef(function_item.oid) ilike '%atualizado_em%'
  loop
    execute format(
      'drop trigger if exists %I on public.msy_conversas',
      trigger_record.tgname
    );
  end loop;
end;
$$;

create or replace function public.msy_conversas_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists msy_conversas_set_updated_at on public.msy_conversas;
create trigger msy_conversas_set_updated_at
before update on public.msy_conversas
for each row execute function public.msy_conversas_touch_updated_at();

create table if not exists public.msy_mensagens (
  id bigserial primary key,
  conversa_id text not null,
  role text not null,
  texto text not null,
  created_at timestamptz default now()
);

alter table if exists public.msy_mensagens
  add column if not exists conversa_id text,
  add column if not exists role text,
  add column if not exists texto text,
  add column if not exists created_at timestamptz default now();

create index if not exists msy_conversas_usuario_updated_idx
  on public.msy_conversas (usuario_id, updated_at desc);

create index if not exists msy_mensagens_conversa_created_idx
  on public.msy_mensagens (conversa_id, created_at asc);
