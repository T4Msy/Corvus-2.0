import "server-only";

/**
 * Rate limiter in-memory, best-effort.
 *
 * Limitação conhecida: o estado vive no processo da instância serverless. Na Vercel
 * cada instância tem seu próprio Map, então o limite NÃO é compartilhado globalmente —
 * é uma proteção contra abuso/rajadas por instância, não um quota distribuído. Para
 * limite global, migrar para Upstash Redis (ver backlog). Mesmo assim, corta a maior
 * parte dos picos de custo (n8n/OpenAI) por usuário.
 */

interface Bucket {
  /** Timestamps (ms) das requisições dentro da janela atual. */
  hits: number[];
}

const buckets = new Map<string, Bucket>();

// Evita crescimento ilimitado do Map em processos longos: limpa chaves ociosas.
let lastSweep = 0;
const SWEEP_INTERVAL_MS = 60_000;

function sweep(now: number, windowMs: number): void {
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    const fresh = bucket.hits.filter((t) => now - t < windowMs);
    if (fresh.length === 0) buckets.delete(key);
    else bucket.hits = fresh;
  }
}

export interface RateLimitResult {
  ok: boolean;
  /** Quantas requisições ainda restam na janela. */
  remaining: number;
  /** Segundos até liberar (quando bloqueado). */
  retryAfterSeconds: number;
}

/**
 * Janela deslizante simples.
 * @param key   identificador (ex.: `userId` ou IP).
 * @param limit máximo de requisições por janela.
 * @param windowMs tamanho da janela em ms.
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  sweep(now, windowMs);

  const bucket = buckets.get(key) ?? { hits: [] };
  const hits = bucket.hits.filter((t) => now - t < windowMs);

  if (hits.length >= limit) {
    const oldest = hits[0];
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((windowMs - (now - oldest)) / 1000)
    );
    bucket.hits = hits;
    buckets.set(key, bucket);
    return { ok: false, remaining: 0, retryAfterSeconds };
  }

  hits.push(now);
  bucket.hits = hits;
  buckets.set(key, bucket);
  return { ok: true, remaining: Math.max(0, limit - hits.length), retryAfterSeconds: 0 };
}

/** Extrai um IP best-effort dos headers de proxy (Vercel envia x-forwarded-for). */
export function clientIpFromHeaders(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip")?.trim() || "unknown";
}
