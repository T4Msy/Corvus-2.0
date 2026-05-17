# Workflow n8n — Corvus

Versão sanitizada do workflow exportado: `n8n/workflow.json`. **Não importe diretamente em produção sem revisar credenciais.**

> **Aviso de segurança:** o export original continha uma chave OpenAI em texto puro no node `Gerar Embedding`. Essa chave foi removida antes de salvar este arquivo. **Você deve revogar a chave original em platform.openai.com** mesmo após a remoção, pois ela esteve exposta em disco/repo.

---

## Estrutura — dois fluxos no mesmo workflow

### 1. Fluxo de chat (Site → Corvus)

```
Webhook (POST /webhook/corvus-ingestao)
  -> Normalize Input          (preserva imageAttachments e visualContext)
  -> Vision Gate              (se hasImages=true)
      -> Vision Analyzer      (HTTP Responses API /v1/responses com input_image)
      -> Vision Context Merge (gera visualCtxString e usedVision=true)
  -> Switch ($json.modo)
      -> "fenrir" -> Set Fenrir System Prompt -> AI Agent (Fenrir, gpt-4o, temp=1)
      -> "corvus" -> Set Corvus System Prompt -> AI Agent (Corvus, gpt-4o, temp=0.3)
  -> Format Response          -> Respond to Webhook
```

Cada AI Agent tem três sub-componentes plugados via portas auxiliares:
- **Chat Model**: OpenAI `gpt-4o`
- **Memory**: Postgres Chat Memory (tabela `msy_memoria_chat`, chaveada por `sessionId`)
- **Tool**: Supabase Vector Store em modo `retrieve-as-tool` (tabela `msy_knowledge`, top-K=5, query name `buscar_msy`) + Embeddings OpenAI

### 2. Fluxo de ingestão (Form → base vetorial)

```
Formulario (n8n FormTrigger)
  → Preparar (normaliza campos)
  → Gerar Embedding (HTTP /v1/embeddings)
  → Montar (combina dados + embedding)
  → Salvar Supabase (INSERT em msy_knowledge)
```

---

## Contrato esperado pela API V3

A nova API layer (`/api/corvus/chat`) envia o seguinte payload ao webhook de chat:

```jsonc
{
  "message": "string",                  // obrigatório, ≤8000 chars
  "modo": "corvus" | "fenrir",          // validado server-side
  "userId": "string",                   // ID do Supabase ou "convidado_*"
  "sessionId": "string",                // estável por conversa (chaveia memória)
  "conversationId": "string",
  "userContext": {
    "nome": "string",
    "cargo": "string",
    "sigla": "string",
    "tipo": "membro" | "convidado"
  },
  "hasImages": true,
  "imageUrl": "data:image/... ou https://...",    // primeira imagem
  "imageUrls": ["data:image/... ou https://..."], // atalhos para nodes simples
  "images": [/* mesmo conteudo de imageAttachments */],
  "imageAttachments": [
    {
      "name": "string",
      "type": "image/png | image/jpeg | image/webp | image/gif",
      "size": 12345,
      "signedUrl": "https://...", // URL Supabase temporaria, expira em 10 min
      "imageUrl": "https://...",  // alias para nodes OpenAI/n8n
      "url": "https://...",       // alias para compatibilidade
      "dataUrl": "data:image/..." // inline quando a imagem tem ate 5 MB
    }
  ],
  "hasDocuments": true,
  "documentAttachments": [
    {
      "name": "string",
      "type": "application/pdf | text/plain | text/markdown | text/csv | application/json | application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "size": 12345,
      "signedUrl": "https://...",
      "url": "https://...",
      "text": "texto extraido pelo Next"
    }
  ],
  "documentContext": {
    "text": "conteudo consolidado dos documentos",
    "limitations": "truncamentos ou avisos"
  },
  "documentCtxString": "bloco textual pronto para prompt"
}
```

E espera de volta:

```jsonc
{
  "ok": true,
  "reply": "texto markdown",
  "meta": { "agent": "Corvus 2.0", "model": "gpt-4o", "database": "supabase-pgvector" }
}
```

Esse contrato **já é o que o workflow atual produz** via `Format Response` + `Respond to Webhook`. ✅

Para imagens, o workflow atual ja inclui o caminho **Vision Gate -> Vision Analyzer -> Vision Context Merge** antes do roteamento para os AI Agents. O node **Vision Analyzer** usa HTTP Request para a OpenAI Responses API em `https://api.openai.com/v1/responses`, com **Authentication = Predefined Credential Type / OpenAI**, **Specify Body = JSON** e imagens como `input_image`. O resultado e gravado em `visualContext` e `visualCtxString`; os prompts dos agentes devem usar esse campo para responder sobre a imagem, sem pedir que o usuario descreva manualmente.

Para documentos, o Next extrai texto de PDF, DOCX, TXT, MD, CSV e JSON antes de chamar o n8n. O workflow deve preservar `documentContext` e `documentCtxString` desde **Normalize Input** ate os nodes de prompt.

---

## Mudanças que você deve aplicar no n8n (manualmente, na UI)

> Não edite o JSON e re-importe — perde as credenciais. Faça as mudanças direto na UI.

### A. URGENTE — corrigir vazamento da chave OpenAI

1. **Revogue a chave atual** em `platform.openai.com → API keys`.
2. Gere uma nova chave.
3. Atualize a credencial n8n `OpenAi account` (ID `OBylh3PHUYnyQB0n`) com a nova chave.
4. Abra o node **`Gerar Embedding`** (HTTP Request). O export atual ja usa credencial OpenAI; se estiver ajustando manualmente, use em vez de header `Authorization`:
   - Em **Authentication**, escolha *Predefined Credential Type → OpenAI*.
   - Selecione a credencial `OpenAi account`.
   - Remova o header `Authorization` da lista de headers.
   - Use o body atual (`model`, `input`).
5. Alternativa mais limpa: substitua o HTTP Request por um node **OpenAI** nativo do n8n com operação *Embeddings*. Reutiliza a credencial e simplifica.

### B. CORS — permitir chamadas do navegador

A API V3 é a única que chama o webhook (via Vercel server-side), então **CORS deixa de ser obrigatório**. Mas se quiser preservar a possibilidade de chamadas diretas do browser em casos de fallback/dev, configure o node Webhook:

- Em **Options** do node Webhook, ative `Allowed Origins (CORS)`.
- Liste origens explícitas: `https://seu-projeto.vercel.app`, `http://localhost:3000`.
- Garanta que `Allowed Methods` inclui `POST, OPTIONS`.
- `Allowed Headers`: `Content-Type, X-Corvus-Secret`.

### C. Header secreto — bloquear chamadas não-autorizadas

Como o webhook ficará público na internet, autentique chamadas:

1. No node Webhook, em **Authentication**, escolha *Header Auth*.
2. Crie credencial com nome do header = `X-Corvus-Secret` e valor = string aleatória forte (ex.: `openssl rand -hex 32`).
3. Coloque o mesmo valor em `N8N_WEBHOOK_SECRET` no `.env.local` da Next.js / em Environment Variables na Vercel.
4. O cliente n8n da V3 (`lib/n8n/client.ts`) já envia o header se `N8N_WEBHOOK_SECRET` estiver setado.

### D. Switch — adicionar default

O Switch atual tem dois ramos (`fenrir`, `corvus`) e nenhum default. Se `modo` chegar com valor inválido, o fluxo morre silenciosamente.

- Em **Routing Rules**, marque `Fallback Output` → "Extra (default)".
- Conecte esse output ao mesmo `Set Corvus System Prompt`.
- A V3 já valida `modo` antes de enviar, então isso é cinto-e-suspensório.

### E. Error handling — não engolir falhas

O node `Format Response` retorna `"Sem resposta do agente."` quando `output` está vazio, mascarando falhas reais do AI Agent.

- Adicione um **Error Trigger workflow** ou habilite `Continue On Fail` nos AI Agents.
- Quando falhar, retorne `{ ok: false, error: "...", code: "agent_failed" }` ao invés de uma string vazia que vira reply.
- A V3 trata `ok: false` corretamente — só precisa que o n8n envie esse formato em caso de erro.

### F. Imagens - habilitar visao real

O export atual ja vem com visao real configurada. Confira estes pontos no n8n depois de importar:

1. **Vision Gate** deve receber o output de **Normalize Input**.
2. Se `hasImages` for verdadeiro, o fluxo deve ir para **Vision Analyzer**.
3. **Vision Analyzer** deve estar assim:
   - **Method**: `POST`.
   - **URL**: `https://api.openai.com/v1/responses`.
   - **Authentication**: `Predefined Credential Type`.
   - **Credential Type**: `OpenAI API`.
   - **Credential**: `OpenAi account`.
   - **Specify Body**: `JSON`, nao `String`.
   - **JSON Body**: envia `input_text` e cada imagem como `input_image` usando `dataUrl || imageUrl || url || signedUrl`.
4. **Vision Context Merge** deve gerar `visualContext`, `visualCtxString` e `usedVision: true`.
5. **Set Corvus System Prompt** e **Set Fenrir System Prompt** devem incluir `visualCtxString` no bloco `CONTEXTO VISUAL`.

Se o retorno voltar para frases como "nao posso analisar imagens" ou "descreva a imagem", o problema esta em um destes pontos: o workflow ativo no n8n ainda e antigo, a credencial OpenAI nao esta selecionada no **Vision Analyzer**, o body esta como `String`, ou `visualCtxString` nao esta chegando no prompt final.

### G. Renomear o caminho do webhook (opcional, recomendado)

`/webhook/corvus-ingestao` é confuso porque "ingestão" remete ao formulário, não ao chat. Sugestão:

- Renomeie para `/webhook/corvus-chat` (campo *Path* do node Webhook).
- Atualize `N8N_WEBHOOK_URL` no `.env.local`.
- Não esqueça que webhooks de produção exigem o workflow estar **Active**.

---

## Como testar o workflow após as mudanças

1. No n8n, ative o workflow.
2. Local: `curl -X POST $N8N_WEBHOOK_URL -H 'Content-Type: application/json' -H "X-Corvus-Secret: $N8N_WEBHOOK_SECRET" -d '{"message":"teste","modo":"corvus","userId":"u1","sessionId":"s1","userContext":{"nome":"Teste","cargo":"","sigla":"","tipo":"membro"}}'`
3. Esperado: `200 OK` com `{ "ok": true, "reply": "..." }`.
4. Pela aplicação V3: rode `pnpm dev` (ou `npm`), abra `http://localhost:3000`, envie mensagem.

---

## Tabelas Supabase usadas pelo workflow

| Tabela | Uso |
|---|---|
| `msy_knowledge` | Base vetorial (pgvector). Lida pelo Vector Store, escrita pelo fluxo de ingestão. |
| `msy_memoria_chat` | Histórico Langchain (Postgres Chat Memory). Chaveada por `sessionId`. |
| `msy_usuarios` | Perfis de membros (lida pelo frontend, não pelo n8n). |
| `msy_conversas` | Conversas no histórico (lida pelo frontend). |
| `msy_mensagens` | Mensagens individuais (lida pelo frontend). |
