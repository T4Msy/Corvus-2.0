-- Corvus IA V3 - metadados premium de conversas
-- Idempotente: pode ser executado em bases V3 existentes.

alter table if exists public.msy_conversas
  add column if not exists pinned boolean default false,
  add column if not exists favorite boolean default false,
  add column if not exists tags text[] default '{}',
  add column if not exists summary text,
  add column if not exists archived boolean default false;

create index if not exists msy_conversas_usuario_pinned_idx
  on public.msy_conversas (usuario_id, pinned, updated_at desc);

create index if not exists msy_conversas_usuario_favorite_idx
  on public.msy_conversas (usuario_id, favorite, updated_at desc);

create index if not exists msy_conversas_usuario_archived_idx
  on public.msy_conversas (usuario_id, archived, updated_at desc);
