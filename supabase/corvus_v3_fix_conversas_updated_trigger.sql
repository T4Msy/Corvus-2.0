-- Corvus IA V3 - fix para triggers antigos em msy_conversas
-- Sintoma:
--   record "new" has no field "atualizado_em"
--
-- Causa:
--   A base tinha um trigger legado em public.msy_conversas apontando para uma
--   funcao que escreve em NEW.atualizado_em. O schema V3 usa updated_at.

alter table if exists public.msy_conversas
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

create index if not exists msy_conversas_usuario_updated_idx
  on public.msy_conversas (usuario_id, updated_at desc);
