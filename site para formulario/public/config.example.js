// Modelo. Copie para config.js e preencha.
window.CONFIG = {
  SUPABASE_URL: "https://SEU-PROJETO.supabase.co",
  SUPABASE_KEY: "SERVICE_ROLE_KEY_AQUI",
  EMBEDDING_MODEL: "text-embedding-3-small",

  // Embeddings passam pelo webhook do n8n (a Key da OpenAI fica lá).
  // Funciona abrindo o index.html por file:// — o n8n reflete a origem no CORS.
  // Opcional: só preencha se a URL do webhook for diferente do padrão do db.js.
  EMBEDDINGS_WEBHOOK_URL: "http://129.148.33.171:5678/webhook/corvus-embeddings"

  // OPENAI_API_KEY não é mais necessária — o painel não chama a OpenAI direto.
};
