# Corvus — Painel do Banco (local, 100% estático)

Site local (HTML/CSS/JS) para gerenciar o banco de dados do Corvus. **Funciona em qualquer PC: é só abrir o `index.html`** — não precisa instalar nada, não precisa de Node.

- **➕ Adicionar Conhecimento** — recria o formulário do n8n (`Título`, `Categoria`, `Tags`, `Conteúdo`). Ao salvar, gera o **embedding** (`text-embedding-3-small`) de `título + conteúdo` e insere em `msy_knowledge` com `ativo=true` — entra direto no RAG do Corvus.
- **🗄️ Banco de Dados** — explorador de **todas** as tabelas: listar, buscar, criar, **editar** (clica no registro) e **excluir**. Colunas de vetor (embedding) são ocultas e regeneradas automaticamente.

## Como usar

**Modo normal (qualquer PC):** abra **`public/index.html`** (duplo-clique). Pronto.

**Modo servidor (opcional):** se o seu navegador bloquear a chamada à OpenAI ao abrir via `file://`, rode `node server.js` (zero dependências) e acesse **http://127.0.0.1:4505**.

## Como funciona

O site fala **direto** com o Supabase (REST/PostgREST) e a OpenAI (embeddings), pelo navegador. A configuração fica em **`public/config.js`**:

```js
window.CONFIG = {
  SUPABASE_URL: "https://....supabase.co",
  SUPABASE_KEY: "<service_role>",   // admin: ignora RLS
  OPENAI_API_KEY: "sk-...",
  EMBEDDING_MODEL: "text-embedding-3-small"
};
```

O schema das tabelas vem embutido em `public/schema.js` (gerado a partir do banco).

## ⚠️ Segurança — leia

- O `config.js` contém a **service_role** do Supabase e a **chave da OpenAI**. Quem tiver a pasta tem **controle total do banco** e acesso à sua conta OpenAI.
- **Trate a pasta como senha.** Para usar em outro PC, copie a pasta inteira (o `config.js` vai junto).
- `config.js` está no **`.gitignore`** — não é enviado ao GitHub. Não force o commit dele.
- É uma ferramenta **administrativa de uso local**. Não publique numa URL pública.
- Se a chave vazar, **rotacione** no painel do Supabase (e lembre de atualizar os nós do n8n).

## Estrutura

```
site para formulario/
  server.js            # servidor estático opcional (fallback), zero deps
  iniciar.bat          # atalho p/ o modo servidor no Windows
  public/
    index.html         # UI (abas: formulário + explorador)
    styles.css         # tema escuro MSY
    config.js          # chaves (NÃO commitar) — gerado do .env.local
    config.example.js  # modelo sem chaves
    schema.js          # schema do banco embutido
    db.js              # camada de dados (Supabase REST + OpenAI)
    app.js             # lógica da UI
```
