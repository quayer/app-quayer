/**
 * Tavily HTTP Client — single shared implementation
 *
 * The canonical Tavily caller for the whole app. The `search_web` Builder tool
 * (`tools/search-web.tool.ts`) is a thin wrapper that maps this result union to
 * its own shape — no fetch logic is duplicated anymore.
 *
 * Contract:
 *   - Reads `TAVILY_API_KEY` via getServerConfig().
 *   - If the env var is missing, fails softly with `reason: 'NO_API_KEY'`
 *     WITHOUT performing any network I/O.
 *   - Redis cache 1h (fail-open) before the network call — ver tavily-cache.ts.
 *   - Enforces a 15s timeout per attempt via AbortController (also honors a
 *     caller signal).
 *   - Retries transient failures (HTTP 5xx + real network errors) up to
 *     MAX_ATTEMPTS with a short backoff. 429 (RATE_LIMITED), HTTP 4xx and
 *     caller/timeout aborts are NOT retried — 429 is a distinct quota signal,
 *     4xx is definitive, and an abort already spent the latency budget.
 *   - NEVER throws — all errors are captured into the tagged result union.
 */

import { getServerConfig } from '@/server/services/server-config'
import { getRedis } from '@/server/services/redis'
import {
  readTavilyCache,
  writeTavilyCache,
  tavilyCacheKey,
} from '@/server/ai-module/builder/services/tavily-cache'

const TAVILY_ENDPOINT = 'https://api.tavily.com/search'
const REQUEST_TIMEOUT_MS = 15_000
const SNIPPET_MAX_LENGTH = 300
const SEARCH_DEPTH = 'basic'
/** Total attempts on a transient failure (1 = no retry). 2 = one retry. */
const MAX_ATTEMPTS = 2
/** Backoff before a retry; multiplied by the attempt number. */
const RETRY_BASE_DELAY_MS = 400

export interface TavilySearchItem {
  title: string
  url: string
  snippet: string
}

export type TavilyResult =
  | { ok: true; results: TavilySearchItem[] }
  | {
      ok: false
      reason: 'NO_API_KEY' | 'RATE_LIMITED' | 'HTTP_ERROR' | 'NETWORK'
      message: string
    }

export interface SearchTavilyOptions {
  maxResults?: number
  signal?: AbortSignal
}

interface TavilyApiResult {
  title?: string
  url?: string
  content?: string
}

interface TavilyApiResponse {
  results?: TavilyApiResult[]
}

/** One network attempt's outcome + whether it's worth retrying. */
type AttemptResult =
  | { ok: true; results: TavilySearchItem[]; retriable: false }
  | {
      ok: false
      reason: 'RATE_LIMITED' | 'HTTP_ERROR' | 'NETWORK'
      message: string
      retriable: boolean
    }

type TavilyFailure = Extract<TavilyResult, { ok: false }>

function truncateSnippet(text: string | undefined): string {
  if (!text) return ''
  const trimmed = text.trim()
  if (trimmed.length <= SNIPPET_MAX_LENGTH) return trimmed
  return `${trimmed.slice(0, SNIPPET_MAX_LENGTH - 1).trimEnd()}…`
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * A single Tavily fetch with its own 15s timeout + caller-signal wiring.
 * Classifies the outcome and flags whether a retry is warranted. Never throws.
 */
async function runTavilyFetch(
  apiKey: string,
  query: string,
  maxResults: number,
  signal?: AbortSignal,
): Promise<AttemptResult> {
  const timeoutController = new AbortController()
  const timeoutId = setTimeout(
    () => timeoutController.abort(),
    REQUEST_TIMEOUT_MS,
  )
  const onCallerAbort = () => timeoutController.abort()
  if (signal) {
    if (signal.aborted) {
      clearTimeout(timeoutId)
      return {
        ok: false,
        reason: 'NETWORK',
        message: 'Aborted by caller signal',
        retriable: false,
      }
    }
    signal.addEventListener('abort', onCallerAbort, { once: true })
  }

  try {
    const response = await fetch(TAVILY_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        max_results: maxResults,
        search_depth: SEARCH_DEPTH,
      }),
      signal: timeoutController.signal,
    })

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      // 429 distinto de erro genérico: quota/rate-limit é transitório e o caller
      // pode logar/alertar diferente (não é uma falha de query). NÃO re-tenta —
      // martelar o endpoint sob 429 só piora a quota.
      if (response.status === 429) {
        return {
          ok: false,
          reason: 'RATE_LIMITED',
          message: `Tavily rate limit (429): ${text.slice(0, 200)}`,
          retriable: false,
        }
      }
      // 5xx é transitório (servidor) → retriable; 4xx é definitivo → não.
      const retriable = response.status >= 500 && response.status < 600
      return {
        ok: false,
        reason: 'HTTP_ERROR',
        message: `Tavily search failed (${response.status}): ${text.slice(0, 200)}`,
        retriable,
      }
    }

    const data = (await response.json()) as TavilyApiResponse
    const results: TavilySearchItem[] = (data.results ?? [])
      .slice(0, maxResults)
      .map((r) => ({
        title: (r.title ?? '').trim() || r.url || 'Untitled',
        url: r.url ?? '',
        snippet: truncateSnippet(r.content),
      }))
      .filter((r) => r.url)

    return { ok: true, results, retriable: false }
  } catch (err) {
    // Timeout e caller-abort chegam como AbortError → não re-tenta (o budget de
    // latência já foi gasto). Erros de rede reais (ECONNRESET/DNS) → retriable.
    const isAbort = err instanceof Error && err.name === 'AbortError'
    const message = err instanceof Error ? err.message : 'Unknown network error'
    return { ok: false, reason: 'NETWORK', message, retriable: !isAbort }
  } finally {
    clearTimeout(timeoutId)
    signal?.removeEventListener('abort', onCallerAbort)
  }
}

/**
 * Execute a Tavily search. Returns a tagged result — never throws.
 *
 * When TAVILY_API_KEY is unset we short-circuit with `NO_API_KEY` and
 * deliberately DO NOT call `fetch` so callers can degrade gracefully.
 */
export async function searchTavily(
  query: string,
  opts: SearchTavilyOptions = {},
): Promise<TavilyResult> {
  const apiKey = getServerConfig().TAVILY_API_KEY
  if (!apiKey) {
    return {
      ok: false,
      reason: 'NO_API_KEY',
      message: 'TAVILY_API_KEY not configured',
    }
  }

  const maxResults = opts.maxResults ?? 5

  // Cache 1h (fail-open) — perguntas de nicho repetem na mesma sessão.
  const cacheKey = tavilyCacheKey(query, maxResults, SEARCH_DEPTH)
  const cached = await readTavilyCache(getRedis(), cacheKey)
  if (cached) return { ok: true, results: cached }

  let last: TavilyFailure = {
    ok: false,
    reason: 'NETWORK',
    message: 'no attempt made',
  }
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const result = await runTavilyFetch(apiKey, query, maxResults, opts.signal)
    if (result.ok) {
      await writeTavilyCache(getRedis(), cacheKey, result.results)
      return { ok: true, results: result.results }
    }
    last = { ok: false, reason: result.reason, message: result.message }
    if (!result.retriable || attempt >= MAX_ATTEMPTS) break
    await sleep(RETRY_BASE_DELAY_MS * attempt)
  }
  return last
}
