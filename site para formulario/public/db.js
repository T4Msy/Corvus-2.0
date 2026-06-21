/* Camada de dados — fala DIRETO com Supabase REST (PostgREST) e OpenAI.
 * Usa window.CONFIG (config.js) e window.SCHEMA (schema.js).
 * 100% no navegador — nenhum servidor Node necessário. */
'use strict';

const CFG = window.CONFIG || {};
const SCHEMA = window.SCHEMA || {};
const SB = String(CFG.SUPABASE_URL || '').replace(/\/$/, '') + '/rest/v1';

function sbHeaders(extra) {
  return {
    apikey: CFG.SUPABASE_KEY,
    Authorization: 'Bearer ' + CFG.SUPABASE_KEY,
    'Content-Type': 'application/json',
    ...extra,
  };
}

/* ---- tipos ---- */
const isVector = (u) => u === 'vector' || u === 'halfvec';
const isArrayT = (u) => u && u[0] === '_';
const isJsonT = (u) => u === 'jsonb' || u === 'json';
const isBoolT = (u) => u === 'bool';
const isNumT = (u) => ['int2', 'int4', 'int8', 'float4', 'float8', 'numeric'].includes(u);

function colMeta(c) {
  return {
    name: c.name, udt: c.udt, nullable: c.nullable, hasDefault: c.hasDefault,
    isVector: isVector(c.udt), isArray: isArrayT(c.udt), isJson: isJsonT(c.udt),
    isBool: isBoolT(c.udt), isNumeric: isNumT(c.udt),
  };
}

function tableMeta(name) {
  const t = SCHEMA[name];
  if (!t) throw new Error('Tabela desconhecida: ' + name);
  return { table: name, pk: t.pk, columns: t.columns.map(colMeta) };
}

/* ---- coerção conforme tipo ---- */
function coerce(value, c) {
  if (value === undefined || value === null || value === '') return null;
  if (c.isArray) return Array.isArray(value) ? value : String(value).split(',').map((s) => s.trim()).filter(Boolean);
  if (c.isJson) { if (typeof value === 'object') return value; try { return JSON.parse(value); } catch { return value; } }
  if (c.isBool) return value === true || value === 'true' || value === 'on' || value === '1';
  if (c.isNumeric) { const n = Number(value); return Number.isNaN(n) ? null : n; }
  return String(value);
}

async function sbFetch(url, opts = {}) {
  const res = await fetch(url, opts);
  if (!res.ok) {
    let msg = 'Erro ' + res.status;
    try { const j = await res.json(); msg = j.message || j.error || j.hint || msg; } catch {}
    throw new Error(msg);
  }
  return res;
}

/* ---- embeddings (via webhook do n8n, DIRETO do navegador) ----
 * A OpenAI não permite chamada do navegador (sem CORS). O n8n permite: ele
 * reflete a origem no CORS, então funciona até abrindo o index.html por file://
 * (origin "null"). A Key da OpenAI fica no n8n — não precisa de chave no painel.
 * Importe/ative n8n/embeddings-proxy-workflow.json (path corvus-embeddings).
 * Para trocar a URL, defina EMBEDDINGS_WEBHOOK_URL no config.js. */
const EMBED_URL =
  CFG.EMBEDDINGS_WEBHOOK_URL ||
  'http://129.148.33.171:5678/webhook/corvus-embeddings';

async function generateEmbedding(text) {
  let res;
  try {
    res = await fetch(EMBED_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: text, model: CFG.EMBEDDING_MODEL || 'text-embedding-3-small' }),
    });
  } catch (e) {
    throw new Error('Não consegui falar com o n8n (' + EMBED_URL + '). Veja se o workflow está ativo e se você tem rede. ' + (e.message || ''));
  }
  let j = null; try { j = await res.json(); } catch {}
  const obj = Array.isArray(j) ? j[0] : j;
  const embedding = obj && obj.embedding;
  if (!res.ok || !Array.isArray(embedding)) {
    throw new Error('n8n embeddings: ' + ((obj && (obj.error || obj.message)) || ('HTTP ' + res.status)));
  }
  return '[' + embedding.join(',') + ']';
}

/* ---- filtros de PK ---- */
function pkFilter(meta, pkVals) {
  return meta.pk.map((k) => `${encodeURIComponent(k)}=eq.${encodeURIComponent(pkVals[k])}`).join('&');
}

const db = {
  isVector, isArrayT, isJsonT, isBoolT, isNumT, tableMeta,

  async listTables() {
    const names = Object.keys(SCHEMA).sort();
    const tables = await Promise.all(
      names.map(async (name) => {
        const meta = tableMeta(name);
        let rows = 0;
        try {
          const res = await sbFetch(`${SB}/${name}?select=${encodeURIComponent(meta.pk[0] || meta.columns[0].name)}&limit=1`,
            { headers: sbHeaders({ Prefer: 'count=exact', Range: '0-0' }) });
          const cr = res.headers.get('content-range') || '';
          rows = Number((cr.split('/')[1] || '0')) || 0;
        } catch {}
        return { name, pk: meta.pk, columns: meta.columns.length, rows, hasEmbedding: meta.columns.some((c) => c.isVector) };
      })
    );
    return { tables };
  },

  async getTable(name, { limit = 50, offset = 0, q = '' } = {}) {
    const meta = tableMeta(name);
    const selectable = meta.columns.filter((c) => !c.isVector).map((c) => c.name);
    const params = new URLSearchParams();
    params.set('select', selectable.join(','));
    const orderCol = meta.pk[0] || meta.columns[0].name;
    params.set('order', `${orderCol}.desc`);
    params.set('limit', String(limit));
    params.set('offset', String(offset));
    q = (q || '').trim();
    if (q) {
      const textCols = meta.columns.filter((c) => c.udt === 'text' || c.udt === 'varchar');
      if (textCols.length) {
        const ors = textCols.map((c) => `${c.name}.ilike.*${q}*`).join(',');
        params.set('or', `(${ors})`);
      }
    }
    const res = await sbFetch(`${SB}/${name}?${params.toString()}`, { headers: sbHeaders({ Prefer: 'count=exact' }) });
    const rows = await res.json();
    const cr = res.headers.get('content-range') || '';
    const total = Number((cr.split('/')[1] || rows.length)) || rows.length;
    // injeta marcador de vetor pra grade
    const vecCols = meta.columns.filter((c) => c.isVector).map((c) => c.name);
    rows.forEach((r) => vecCols.forEach((vc) => (r[vc] = '🧠 auto')));
    return { table: name, pk: meta.pk, columns: meta.columns, total, limit, offset, rows };
  },

  async insert(name, body) {
    const meta = tableMeta(name);
    const payload = {};
    for (const c of meta.columns) {
      if (c.isVector) continue;
      if (!(c.name in body)) continue;
      const v = coerce(body[c.name], c);
      if (v === null) continue; // deixa default agir
      payload[c.name] = v;
    }
    if (name === 'msy_knowledge') {
      const titulo = (body.titulo || '').toString().trim();
      const conteudo = (body.conteudo || '').toString().trim();
      if (!titulo || !conteudo) throw new Error('titulo e conteudo são obrigatórios');
      payload.embedding = await generateEmbedding(titulo + '\n\n' + conteudo);
      if (payload.ativo === undefined) payload.ativo = true;
    }
    const res = await sbFetch(`${SB}/${name}`, {
      method: 'POST', headers: sbHeaders({ Prefer: 'return=representation' }), body: JSON.stringify(payload),
    });
    const rows = await res.json();
    return { ok: true, row: rows[0] };
  },

  async update(name, body) {
    const meta = tableMeta(name);
    if (!meta.pk.length) throw new Error('Tabela sem PK — edição não suportada');
    const pkVals = body.__pk || {};
    const payload = {};
    for (const c of meta.columns) {
      if (c.isVector || meta.pk.includes(c.name)) continue;
      if (!(c.name in body)) continue;
      payload[c.name] = coerce(body[c.name], c);
    }
    if (name === 'msy_knowledge' && (body.titulo != null || body.conteudo != null)) {
      let titulo = body.titulo, conteudo = body.conteudo;
      if (titulo == null || conteudo == null) {
        const cur = await sbFetch(`${SB}/${name}?${pkFilter(meta, pkVals)}&select=titulo,conteudo`, { headers: sbHeaders() });
        const c0 = (await cur.json())[0] || {};
        if (titulo == null) titulo = c0.titulo;
        if (conteudo == null) conteudo = c0.conteudo;
      }
      payload.embedding = await generateEmbedding((titulo || '').trim() + '\n\n' + (conteudo || '').trim());
      payload.atualizado_em = new Date().toISOString();
    }
    if (!Object.keys(payload).length) throw new Error('Nada para atualizar');
    const res = await sbFetch(`${SB}/${name}?${pkFilter(meta, pkVals)}`, {
      method: 'PATCH', headers: sbHeaders({ Prefer: 'return=representation' }), body: JSON.stringify(payload),
    });
    const rows = await res.json();
    if (!rows.length) throw new Error('Linha não encontrada');
    return { ok: true, row: rows[0] };
  },

  async remove(name, body) {
    const meta = tableMeta(name);
    if (!meta.pk.length) throw new Error('Tabela sem PK — exclusão não suportada');
    await sbFetch(`${SB}/${name}?${pkFilter(meta, body.__pk || {})}`, { method: 'DELETE', headers: sbHeaders() });
    return { ok: true, deleted: 1 };
  },
};

window.db = db;
