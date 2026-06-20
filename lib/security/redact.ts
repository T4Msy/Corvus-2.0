import "server-only";

/**
 * Apaga segredos (chaves de API, tokens Bearer, senhas) de qualquer texto antes
 * que ele chegue ao cliente OU a um log. Defesa em profundidade: aplicar em TODA
 * fronteira que possa repassar a mensagem de erro de um provedor externo
 * (OpenAI, n8n, etc.) — esses erros frequentemente ecoam a credencial enviada.
 */
export function redactSecrets(value: string): string {
  return value
    .replace(/sk-[A-Za-z0-9_-]{6,}/g, "sk-***REDACTED***")
    .replace(/Bearer\s+[A-Za-z0-9._-]{6,}/gi, "Bearer ***REDACTED***")
    .replace(
      /\b(api[_-]?key|secret|token|password|senha)\b(["'\s:=]+)[A-Za-z0-9._-]{8,}/gi,
      "$1$2***REDACTED***"
    );
}

// Sinais de erro de credencial/autenticação que NUNCA devem chegar ao usuário.
const AUTH_ERROR_PATTERN =
  /incorrect api key|invalid api key|invalid_api_key|api key|unauthorized|authentication|permission denied|invalid x-api-key|\b401\b|\b403\b/i;

/**
 * Converte a mensagem de erro de um provedor externo em algo seguro para o
 * usuário final. Erros de chave/autenticação viram uma mensagem genérica
 * (nunca expõem detalhe de credencial); o restante é redigido contra vazamento
 * de segredo e cai num fallback quando vazio.
 */
export function safeUpstreamReason(value: string, fallback: string): string {
  const text = (value || "").trim();
  if (!text) return fallback;
  if (AUTH_ERROR_PATTERN.test(text)) {
    return "O serviço de IA está indisponível no momento. Avise um administrador para verificar a configuração.";
  }
  return redactSecrets(text);
}
