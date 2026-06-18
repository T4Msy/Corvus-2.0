/* ============================================================================
 * Corvus — Painel do Banco · servidor de arquivos OPCIONAL (fallback)
 * ----------------------------------------------------------------------------
 * O site é 100% estático: o jeito normal é dar DUPLO-CLIQUE em public/index.html.
 *
 * Use este servidor SÓ se o seu navegador bloquear as chamadas à OpenAI quando
 * a página é aberta via file:// (origem "null"). Ele serve os arquivos em
 * http://127.0.0.1:4505 — uma origem http normal, sem esse problema.
 *
 * Zero dependências (só Node nativo). Rodar:  node server.js
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

http
  .createServer((req, res) => {
    let rel = decodeURIComponent(req.url.split('?')[0]);
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
    console.log('\n  Corvus — Painel do Banco (modo servidor)');
    console.log(`  Abra: http://${HOST}:${PORT}\n  Ctrl+C para parar.\n`);
  });
