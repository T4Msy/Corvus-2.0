/* ============================================================================
 * Corvus — Painel do Banco · servidor local (NECESSÁRIO p/ embeddings)
 * ----------------------------------------------------------------------------
 * As leituras do Supabase funcionam direto do navegador (PostgREST manda CORS).
 * Mas a OpenAI NÃO permite chamadas do navegador (não envia Access-Control-
 * Allow-Origin) — então gerar embedding via file:// OU http direto SEMPRE quebra
 * por CORS. A solução é este servidor: ele expõe /api/embeddings e gera o
 * embedding pelo Node (server-to-server, sem CORS). O db.js chama esse proxy.
 *
 * COMO o embedding é gerado (nesta ordem):
 *   1) Se N8N_EMBEDDINGS_WEBHOOK_URL estiver setado → manda pro webhook do n8n,
 *      que usa a Key da OpenAI já configurada lá. NÃO precisa de chave no painel.
 *      Importe n8n/embeddings-proxy-workflow.json e ative (path corvus-embeddings).
 *   2) Senão → OpenAI direta, com process.env.OPENAI_API_KEY ou a chave do config.js.
 *
 * Rodar (com n8n, recomendado):
 *   N8N_EMBEDDINGS_WEBHOOK_URL=https://SEU-n8n/webhook/corvus-embeddings node server.js
 * Rodar (OpenAI direta):  node server.js
 * Abra:  http://127.0.0.1:4505   (NÃO abra o index.html por file://)
 * ========================================================================== */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 4505;
const HOST = '127.0.0.1';
const ROOT = path.join(__dirname, 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
};

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    let buf = '';
    req.on('data', (c) => { buf += c; if (buf.length > 2e6) req.destroy(); });
    req.on('end', () => resolve(buf));
    req.on('error', reject);
  });
}

/* Gera o embedding. Preferência: webhook do n8n (usa a Key da OpenAI que já está
 * configurada lá — não precisa de chave no painel). Se N8N_EMBEDDINGS_WEBHOOK_URL
 * não estiver setado, cai pra OpenAI direta com a chave do config.js/env. */
/* Webhook de embeddings do n8n. Padrão = instância da MSY (mesmo host dos outros
 * webhooks corvus-*). Sobrescreva com N8N_EMBEDDINGS_WEBHOOK_URL se mudar. Para
 * desligar o n8n e usar OpenAI direta, rode com N8N_EMBEDDINGS_WEBHOOK_URL=off. */
const N8N_EMBED_URL =
  process.env.N8N_EMBEDDINGS_WEBHOOK_URL ||
  'http://129.148.33.171:5678/webhook/corvus-embeddings';

async function embedViaN8n(input, model) {
  const url = N8N_EMBED_URL;
  if (!url || url === 'off') return null; // n8n desligado → fallback OpenAI
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input, model: model || 'text-embedding-3-small' }),
  });
  const j = await r.json().catch(() => null);
  const obj = Array.isArray(j) ? j[0] : j;
  const embedding = obj && obj.embedding;
  if (!r.ok || !Array.isArray(embedding)) {
    throw new Error('n8n: ' + ((obj && (obj.error || obj.message)) || ('HTTP ' + r.status)));
  }
  return embedding;
}

async function embedViaOpenAi(input, model, key) {
  const apiKey = process.env.OPENAI_API_KEY || key;
  if (!apiKey) throw new Error('Sem n8n (N8N_EMBEDDINGS_WEBHOOK_URL) e sem OPENAI_API_KEY — não há como gerar embedding.');
  const r = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
    body: JSON.stringify({ model: model || 'text-embedding-3-small', input }),
  });
  const j = await r.json();
  if (!r.ok || j.error) throw new Error(j.error ? j.error.message : 'OpenAI ' + r.status);
  return j.data[0].embedding;
}

async function handleEmbeddings(req, res) {
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }
  if (req.method !== 'POST') { res.writeHead(405, CORS); return res.end('method not allowed'); }
  try {
    const { input, model, key } = JSON.parse((await readBody(req)) || '{}');
    if (!input || !String(input).trim()) throw new Error('input vazio.');
    const embedding = (await embedViaN8n(input, model)) || (await embedViaOpenAi(input, model, key));
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', ...CORS });
    res.end(JSON.stringify({ embedding }));
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', ...CORS });
    res.end(JSON.stringify({ error: String((e && e.message) || e) }));
  }
}

http
  .createServer((req, res) => {
    const urlPath = req.url.split('?')[0];
    if (urlPath === '/api/embeddings') return void handleEmbeddings(req, res);

    let rel = decodeURIComponent(urlPath);
    if (rel === '/' || rel === '') rel = '/index.html';
    const file = path.join(ROOT, path.normalize(rel));
    if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end('forbidden'); }
    fs.readFile(file, (err, buf) => {
      if (err) { res.writeHead(404); return res.end('not found'); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      res.end(buf);
    });
  })
  .listen(PORT, HOST, () => {
    const via = N8N_EMBED_URL && N8N_EMBED_URL !== 'off'
      ? 'n8n → ' + N8N_EMBED_URL + ' (Key do n8n)'
      : 'OpenAI direta (config.js/env)';
    console.log('\n  Corvus — Painel do Banco (modo servidor + proxy de embeddings)');
    console.log(`  Embeddings via: ${via}`);
    console.log(`  Abra: http://${HOST}:${PORT}\n  Ctrl+C para parar.\n`);
  });
