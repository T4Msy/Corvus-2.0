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
