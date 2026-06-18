/* Corvus — Painel do Banco (frontend) */
'use strict';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

// Camada de dados (Supabase REST + OpenAI) vive em db.js → window.db

function toast(msg, isErr = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast' + (isErr ? ' err' : '');
  setTimeout(() => (t.className = 'toast hidden'), 3200);
}

/* ===================== Tabs ===================== */
$$('.tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    $$('.tab').forEach((b) => b.classList.remove('active'));
    $$('.panel').forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    $('#tab-' + btn.dataset.tab).classList.add('active');
    if (btn.dataset.tab === 'db' && !state.tablesLoaded) loadTables();
  });
});

/* ===================== Aba Formulário ===================== */
const knForm = $('#knowledge-form');
knForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = Object.fromEntries(new FormData(knForm).entries());
  const status = $('#form-status');
  status.textContent = 'Gerando embedding e salvando…';
  status.className = 'status loading';
  try {
    await db.insert('msy_knowledge', fd);
    status.textContent = '✓ Salvo com embedding.';
    status.className = 'status ok';
    knForm.reset();
    loadKnowledge();
    toast('Conhecimento adicionado ao RAG do Corvus.');
  } catch (err) {
    status.textContent = '✕ ' + err.message;
    status.className = 'status err';
    toast(err.message, true);
  }
});

let knCache = [];
async function loadKnowledge() {
  try {
    const data = await db.getTable('msy_knowledge', { limit: 200 });
    knCache = data.rows;
    $('#kn-count').textContent = data.total;
    renderKnowledge();
  } catch (err) {
    $('#kn-list').innerHTML = `<p class="empty">${err.message}</p>`;
  }
}
function renderKnowledge() {
  const q = $('#kn-search').value.toLowerCase().trim();
  const list = knCache.filter(
    (r) => !q || (r.titulo || '').toLowerCase().includes(q) || (r.conteudo || '').toLowerCase().includes(q)
  );
  if (!list.length) { $('#kn-list').innerHTML = `<p class="empty">Nada encontrado.</p>`; return; }
  $('#kn-list').innerHTML = list
    .map(
      (r) => `
      <div class="kn-item" data-id="${r.id}">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
          <h4>${esc(r.titulo)}</h4>
          <span class="cat">${esc(r.categoria || '')}</span>
        </div>
        <p class="excerpt">${esc((r.conteudo || '').slice(0, 160))}</p>
        <div class="row-actions">
          <button class="btn small" data-act="edit" data-id="${r.id}">Editar</button>
          <button class="btn small danger" data-act="del" data-id="${r.id}">Excluir</button>
        </div>
      </div>`
    )
    .join('');
}
$('#kn-search').addEventListener('input', renderKnowledge);
$('#kn-list').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  const id = Number(btn.dataset.id);
  const row = knCache.find((r) => r.id === id);
  if (btn.dataset.act === 'edit') openEditor('msy_knowledge', row);
  if (btn.dataset.act === 'del') confirmDelete('msy_knowledge', row, loadKnowledge);
});

/* ===================== Aba Banco ===================== */
const state = { tablesLoaded: false, table: null, meta: null, offset: 0, limit: 50, total: 0 };

async function loadTables() {
  const data = await db.listTables();
  state.tablesLoaded = true;
  $('#table-list').innerHTML = data.tables
    .map(
      (t) => `<li data-table="${t.name}">
        <span>${t.name}${t.hasEmbedding ? ' <span class="emb">🧠</span>' : ''}</span>
        <span class="cnt">${t.rows}</span>
      </li>`
    )
    .join('');
  $$('#table-list li').forEach((li) =>
    li.addEventListener('click', () => selectTable(li.dataset.table))
  );
}

async function selectTable(name) {
  state.table = name;
  state.offset = 0;
  $$('#table-list li').forEach((li) => li.classList.toggle('active', li.dataset.table === name));
  $('#db-new').disabled = false;
  $('#db-search').value = '';
  await loadRows();
}

async function loadRows() {
  const data = await db.getTable(state.table, { limit: state.limit, offset: state.offset, q: $('#db-search').value.trim() });
  state.meta = data;
  state.total = data.total;
  $('#db-title').textContent = state.table;
  $('#db-meta').textContent = `${data.total} registros · PK: ${data.pk.join(', ') || '—'} · ${data.columns.length} colunas`;
  renderGrid(data);
  renderPager();
}

function renderGrid(data) {
  if (!data.rows.length) {
    $('#db-grid-wrap').innerHTML = `<p class="empty">Sem registros.</p>`;
    return;
  }
  const cols = data.columns;
  const head = cols.map((c) => `<th>${c.name}</th>`).join('') + '<th>ações</th>';
  const body = data.rows
    .map((row) => {
      const tds = cols.map((c) => `<td title="${esc(cellTitle(row[c.name]))}">${cell(row[c.name], c)}</td>`).join('');
      const pk = encodeURIComponent(JSON.stringify(pkOf(data.pk, row)));
      const actions = `<td class="actions">
        <button class="btn small" data-act="edit" data-pk="${pk}">✎</button>
        <button class="btn small danger" data-act="del" data-pk="${pk}">🗑</button>
      </td>`;
      return `<tr>${tds}${actions}</tr>`;
    })
    .join('');
  $('#db-grid-wrap').innerHTML = `<table class="grid"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;

  $$('#db-grid-wrap button[data-act]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const pk = JSON.parse(decodeURIComponent(btn.dataset.pk));
      const row = data.rows.find((r) => data.pk.every((k) => String(r[k]) === String(pk[k])));
      if (btn.dataset.act === 'edit') openEditor(state.table, row);
      if (btn.dataset.act === 'del') confirmDelete(state.table, row, loadRows);
    })
  );
}

function renderPager() {
  const from = state.total ? state.offset + 1 : 0;
  const to = Math.min(state.offset + state.limit, state.total);
  const prev = state.offset > 0;
  const next = state.offset + state.limit < state.total;
  $('#db-pager').innerHTML = `
    <button class="btn small" ${prev ? '' : 'disabled'} id="pg-prev">← Anterior</button>
    <span>${from}–${to} de ${state.total}</span>
    <button class="btn small" ${next ? '' : 'disabled'} id="pg-next">Próximo →</button>`;
  if (prev) $('#pg-prev').addEventListener('click', () => { state.offset -= state.limit; loadRows(); });
  if (next) $('#pg-next').addEventListener('click', () => { state.offset += state.limit; loadRows(); });
}

let dbSearchTimer;
$('#db-search').addEventListener('input', () => {
  clearTimeout(dbSearchTimer);
  dbSearchTimer = setTimeout(() => { state.offset = 0; loadRows(); }, 300);
});
$('#db-new').addEventListener('click', () => openEditor(state.table, null));

/* ===================== Modal editor (criar/editar) ===================== */
const modal = $('#modal');
let editorCtx = null; // { table, columns, pk, row }

async function openEditor(table, row) {
  // garante metadata das colunas
  let meta = state.meta && state.meta.table === table ? state.meta : db.tableMeta(table);
  editorCtx = { table, columns: meta.columns, pk: meta.pk, row };
  $('#modal-title').textContent = (row ? 'Editar' : 'Novo') + ' · ' + table;
  $('#modal-status').textContent = '';
  $('#modal-form').innerHTML = meta.columns.map((c) => fieldHtml(c, row)).join('');
  modal.classList.remove('hidden');
}

function fieldHtml(c, row) {
  const val = row ? row[c.name] : null;
  // vetor é automático
  if (c.isVector) {
    return `<label>${c.name} <span class="muted">(automático)</span>
      <input type="text" disabled value="${row && val ? 'embedding gerado pelo sistema' : '— gerado ao salvar —'}" />
      <div class="field-note">Gerado a partir de título + conteúdo. Não editável.</div></label>`;
  }
  const auto = c.hasDefault && !row;
  const readonlyPk = row && editorCtx && editorCtx.pk.includes(c.name);
  const noteParts = [];
  if (c.udt) noteParts.push(c.udt);
  if (!c.nullable) noteParts.push('obrigatório');
  if (auto) noteParts.push('default automático se vazio');
  const note = noteParts.length ? `<div class="field-note">${noteParts.join(' · ')}</div>` : '';

  if (c.isBool) {
    return `<label style="display:flex;align-items:center;gap:10px;margin-top:16px">
      <input type="checkbox" name="${c.name}" style="width:auto;margin:0" ${val ? 'checked' : ''} ${readonlyPk ? 'disabled' : ''} />
      ${c.name}</label>${note}`;
  }
  const big = c.udt === 'text' || c.isJson;
  const display = c.isArray && Array.isArray(val) ? val.join(', ') : (c.isJson && val ? toJsonText(val) : (val ?? ''));
  const ph = c.isArray ? 'valores separados por vírgula' : (c.isJson ? '{ "chave": "valor" }' : '');
  const input = big
    ? `<textarea name="${c.name}" rows="${c.isJson ? 4 : 5}" placeholder="${ph}" ${readonlyPk ? 'readonly' : ''}>${esc(String(display))}</textarea>`
    : `<input type="text" name="${c.name}" value="${esc(String(display))}" placeholder="${ph}" ${readonlyPk ? 'readonly' : ''} />`;
  return `<label>${c.name}${!c.nullable ? ' <span class="req">*</span>' : ''}${input}</label>${note}`;
}

$('#modal-close').addEventListener('click', () => modal.classList.add('hidden'));
modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.add('hidden'); });

$('#modal-save').addEventListener('click', async () => {
  const { table, columns, pk, row } = editorCtx;
  const form = $('#modal-form');
  const body = {};
  for (const c of columns) {
    if (c.isVector) continue;
    const el = form.elements[c.name];
    if (!el) continue;
    if (c.isBool) body[c.name] = el.checked;
    else {
      const v = el.value.trim();
      // não envia PK readonly nem campos vazios na criação (deixa default)
      if (v === '' ) { if (row && !pk.includes(c.name)) body[c.name] = ''; continue; }
      body[c.name] = v;
    }
  }
  const status = $('#modal-status');
  status.textContent = table === 'msy_knowledge' ? 'Gerando embedding e salvando…' : 'Salvando…';
  status.className = 'status loading';
  try {
    if (row) {
      body.__pk = pkOf(pk, row);
      await db.update(table, body);
    } else {
      await db.insert(table, body);
    }
    modal.classList.add('hidden');
    toast('Registro salvo.');
    if (table === 'msy_knowledge') loadKnowledge();
    if (state.table === table) loadRows();
  } catch (err) {
    status.textContent = '✕ ' + err.message;
    status.className = 'status err';
  }
});

/* ===================== Delete ===================== */
async function confirmDelete(table, row, after) {
  const meta = state.meta && state.meta.table === table ? state.meta : db.tableMeta(table);
  const label = row.titulo || row.title || row.nome || row.name || Object.values(pkOf(meta.pk, row)).join(', ');
  if (!confirm(`Excluir este registro de "${table}"?\n\n${label}\n\nEsta ação não pode ser desfeita.`)) return;
  try {
    await db.remove(table, { __pk: pkOf(meta.pk, row) });
    toast('Registro excluído.');
    after && after();
  } catch (err) {
    toast(err.message, true);
  }
}

/* ===================== Helpers ===================== */
function pkOf(pk, row) {
  const o = {};
  pk.forEach((k) => (o[k] = row[k]));
  return o;
}
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}
function toJsonText(v) { try { return typeof v === 'string' ? v : JSON.stringify(v, null, 2); } catch { return String(v); } }
function cellTitle(v) { if (v == null) return ''; return typeof v === 'object' ? toJsonText(v) : String(v); }
function cell(v, c) {
  if (v === null || v === undefined) return '<span class="cell-null">null</span>';
  if (c.isVector) return `<span class="cell-vec">🧠 ${esc(v)}</span>`;
  if (c.isBool) return `<span class="cell-bool-${v}">${v ? 'true' : 'false'}</span>`;
  if (c.isArray && Array.isArray(v)) return v.map((t) => `<span class="tag-chip">${esc(t)}</span>`).join('') || '<span class="cell-null">—</span>';
  if (c.isJson) return esc(toJsonText(v).slice(0, 120));
  return esc(String(v).slice(0, 160));
}

/* ===================== Init ===================== */
loadKnowledge();
