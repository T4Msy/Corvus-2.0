-- corvus_v3_buscar_msy_rpc.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- CORREÇÃO DO RAG (busca de membros / contexto institucional) — APLICADO
--
-- Sintoma: ao perguntar sobre membros, o Corvus respondia "não posso acessar
--          bancos de dados ou informações externas".
--
-- Causa raiz (confirmada): os 3 agentes do workflow n8n "Corvus 3.2 Beta" usam a
--          tool Supabase Vector Store com queryName = "buscar_msy" sobre a tabela
--          public.msy_knowledge, chamada via PostgREST (supabase-js .rpc()).
--          A função existia no Postgres, MAS:
--            (a) o SCHEMA CACHE do PostgREST estava DESATUALIZADO — toda chamada
--                rpc('buscar_msy') retornava 404 "function not found"; e
--            (b) havia DUAS versões sobrecarregadas com ordem de parâmetros
--                diferente, o que, após o reload, gerava PGRST203 (ambíguo).
--          Resultado: a tool falhava, o agente ficava sem dado e devolvia a
--          recusa genérica do modelo. Os dados sempre estiveram lá (ex.: doc
--          "Membros Atuais MSY", 37 registros ativos com embeddings populados).
--
-- Correção: consolidar em UMA única função com a assinatura que o node LangChain
--          do n8n espera (params nomeados query_embedding/match_count/filter;
--          retorno id/content/metadata/similarity) e RECARREGAR o cache do
--          PostgREST (NOTIFY pgrst). Idempotente — pode rodar de novo sem medo.
--
-- Aplicar: Supabase → SQL Editor → cole → Run. (Já aplicado em produção em
--          2026-06-17 via conexão Postgres direta.)
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists vector;

-- Remove quaisquer sobrecargas antigas para evitar PGRST203 (function overloading).
drop function if exists public.buscar_msy(public.vector, jsonb, integer);
drop function if exists public.buscar_msy(public.vector, integer, jsonb);

-- text-embedding-3-small => 1536 dimensões (igual à coluna embedding).
create or replace function public.buscar_msy (
  query_embedding vector(1536),
  match_count     int   default 6,
  filter          jsonb default '{}'::jsonb
)
returns table (
  id         bigint,
  content    text,
  metadata   jsonb,
  similarity float
)
language sql
stable
as $func$
  select
    k.id::bigint,
    (k.titulo || chr(10) || chr(10) || k.conteudo)::text as content,
    jsonb_build_object(
      'titulo',    k.titulo,
      'categoria', k.categoria,
      'tags',      k.tags
    ) as metadata,
    (1 - (k.embedding <=> query_embedding))::float as similarity
  from public.msy_knowledge k
  where k.ativo = true
    and k.embedding is not null
    -- filtro opcional por categoria; com filter = {} (padrão) sempre passa.
    and (filter = '{}'::jsonb or k.categoria = (filter ->> 'categoria'))
  order by k.embedding <=> query_embedding
  limit greatest(match_count, 1)
$func$;

grant execute on function public.buscar_msy(vector, int, jsonb)
  to anon, authenticated, service_role;

-- CRÍTICO: sem isto o PostgREST continua com cache velho e a tool do n8n
-- segue recebendo 404 mesmo com a função criada.
notify pgrst, 'reload schema';
