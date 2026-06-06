/**
 * Apify runner — executa um actor de forma SÍNCRONA e devolve os dataset items.
 *
 * Usa o endpoint run-sync-get-dataset-items (espera o run terminar e já retorna
 * os itens). Token via header Authorization (nunca query string). Timeout via
 * AbortController — actor lento não pode travar o turno do agente.
 *
 * Genérico: serve p/ instagram-profile-scraper, instagram-scraper, website
 * crawler etc. A normalização do shape fica em arquivos específicos.
 */

const APIFY_BASE = 'https://api.apify.com/v2'

export interface RunActorOptions {
  timeoutMs?: number
}

/**
 * Erro HTTP do Apify que CARREGA o `status` — assim o classificador genérico
 * isRetriableError (retry-with-fallback) consegue distinguir 429/5xx (retriable)
 * de 4xx (propaga). Sem isso, um `new Error('HTTP 429')` era opaco e nunca
 * retentava nem dava p/ tratar rate-limit distinto.
 */
export class ApifyHttpError extends Error {
  readonly status: number
  /** Quando o Apify manda Retry-After (s), expomos em ms para backoff externo. */
  readonly retryAfterMs?: number
  constructor(actorId: string, status: number, retryAfterMs?: number) {
    super(`Apify ${actorId} → HTTP ${status}`)
    this.name = 'ApifyHttpError'
    this.status = status
    this.retryAfterMs = retryAfterMs
  }
}

/** Parseia o header Retry-After (segundos) para ms. undefined se ausente/inválido. */
function parseRetryAfterMs(res: Response): number | undefined {
  const raw = res.headers.get('retry-after')
  if (!raw) return undefined
  const seconds = Number(raw)
  return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds * 1000) : undefined
}

/**
 * Roda `actorId` (formato `owner~actor`, ex: `apify~instagram-profile-scraper`)
 * com `input` e retorna os itens do dataset. Lança `ApifyHttpError` (com status)
 * em HTTP != 2xx, ou AbortError em timeout — o caller captura, retenta (429/5xx)
 * ou degrada.
 */
export async function runActorSync<T = unknown>(
  actorId: string,
  input: unknown,
  token: string,
  options: RunActorOptions = {},
): Promise<T[]> {
  const timeoutMs = options.timeoutMs ?? 20_000
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(
      `${APIFY_BASE}/acts/${actorId}/run-sync-get-dataset-items`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(input),
        signal: controller.signal,
      },
    )
    if (!res.ok) {
      throw new ApifyHttpError(actorId, res.status, parseRetryAfterMs(res))
    }
    const data = (await res.json()) as T[]
    return Array.isArray(data) ? data : []
  } finally {
    clearTimeout(timer)
  }
}
