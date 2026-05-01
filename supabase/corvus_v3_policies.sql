-- Corvus IA V3 - RLS baseline
-- Execute no SQL Editor do Supabase depois de corvus_v3_schema.sql.

alter table if exists public.msy_usuarios enable row level security;
alter table if exists public.msy_conversas enable row level security;
alter table if exists public.msy_mensagens enable row level security;

drop policy if exists "corvus usuarios select own" on public.msy_usuarios;
create policy "corvus usuarios select own"
on public.msy_usuarios
for select
to authenticated
using (id::text = auth.uid()::text);

drop policy if exists "corvus conversas select own" on public.msy_conversas;
create policy "corvus conversas select own"
on public.msy_conversas
for select
to authenticated
using (usuario_id::text = auth.uid()::text);

drop policy if exists "corvus conversas insert own" on public.msy_conversas;
create policy "corvus conversas insert own"
on public.msy_conversas
for insert
to authenticated
with check (usuario_id::text = auth.uid()::text);

drop policy if exists "corvus conversas update own" on public.msy_conversas;
create policy "corvus conversas update own"
on public.msy_conversas
for update
to authenticated
using (usuario_id::text = auth.uid()::text)
with check (usuario_id::text = auth.uid()::text);

drop policy if exists "corvus conversas delete own" on public.msy_conversas;
create policy "corvus conversas delete own"
on public.msy_conversas
for delete
to authenticated
using (usuario_id::text = auth.uid()::text);

drop policy if exists "corvus mensagens select own" on public.msy_mensagens;
create policy "corvus mensagens select own"
on public.msy_mensagens
for select
to authenticated
using (
  exists (
    select 1
    from public.msy_conversas c
    where c.id::text = msy_mensagens.conversa_id::text
      and c.usuario_id::text = auth.uid()::text
  )
);

drop policy if exists "corvus mensagens insert own" on public.msy_mensagens;
create policy "corvus mensagens insert own"
on public.msy_mensagens
for insert
to authenticated
with check (
  exists (
    select 1
    from public.msy_conversas c
    where c.id::text = msy_mensagens.conversa_id::text
      and c.usuario_id::text = auth.uid()::text
  )
);

drop policy if exists "corvus mensagens delete own" on public.msy_mensagens;
create policy "corvus mensagens delete own"
on public.msy_mensagens
for delete
to authenticated
using (
  exists (
    select 1
    from public.msy_conversas c
    where c.id::text = msy_mensagens.conversa_id::text
      and c.usuario_id::text = auth.uid()::text
  )
);

insert into storage.buckets (id, name, public)
values ('corvus-attachments', 'corvus-attachments', false)
on conflict (id) do nothing;

drop policy if exists "corvus attachments owner read" on storage.objects;
create policy "corvus attachments owner read"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'corvus-attachments'
  and name like auth.uid()::text || '/%'
);

drop policy if exists "corvus attachments owner insert" on storage.objects;
create policy "corvus attachments owner insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'corvus-attachments'
  and name like auth.uid()::text || '/%'
);

drop policy if exists "corvus attachments owner delete" on storage.objects;
create policy "corvus attachments owner delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'corvus-attachments'
  and name like auth.uid()::text || '/%'
);
