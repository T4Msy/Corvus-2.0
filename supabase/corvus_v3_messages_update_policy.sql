-- Corvus IA V3 - policy RLS de UPDATE para msy_mensagens
-- Idempotente: pode ser executado em bases V3 existentes.
--
-- Motivo: corvus_v3_policies.sql cria SELECT/INSERT/DELETE em msy_mensagens, mas
-- nao havia policy de UPDATE. O endpoint PATCH /api/conversations/[id]/messages usa
-- updateMessageByTimestamp(), que faz UPDATE. Sem service role key, a edicao de
-- mensagem falhava por RLS. Esta policy espelha a checagem de posse via msy_conversas.

alter table if exists public.msy_mensagens enable row level security;

drop policy if exists "corvus mensagens update own" on public.msy_mensagens;
create policy "corvus mensagens update own"
on public.msy_mensagens
for update
to authenticated
using (
  exists (
    select 1
    from public.msy_conversas c
    where c.id::text = msy_mensagens.conversa_id::text
      and c.usuario_id::text = auth.uid()::text
  )
)
with check (
  exists (
    select 1
    from public.msy_conversas c
    where c.id::text = msy_mensagens.conversa_id::text
      and c.usuario_id::text = auth.uid()::text
  )
);
