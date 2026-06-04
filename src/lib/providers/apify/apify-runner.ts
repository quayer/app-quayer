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
 * Roda `actorId` (formato `owner~actor`, ex: `apify~instagram-profile-scraper`)
 * com `input` e retorna os itens do dataset. Lança em HTTP != 2xx ou timeout —
 * o caller (tool) captura e degrada.
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
      throw new Error(`Apify ${actorId} → HTTP ${res.status}`)
    }
    const data = (await res.json()) as T[]
    return Array.isArray(data) ? data : []
  } finally {
    clearTimeout(timer)
  }
}
