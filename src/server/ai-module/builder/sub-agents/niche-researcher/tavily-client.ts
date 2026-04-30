/**
 * Tavily HTTP Client — thin wrapper
 *
 * Standalone client used by the NicheResearcher sub-agent. The logic is
 * duplicated (not shared) from `tools/search-web.tool.ts` on purpose: the
 * sub-agent may eventually subsume that tool, but for now both coexist and
 * we want the sub-agent to have no coupling to the legacy tool file.
 *
 * Contract:
 *   - Reads `TAVILY_API_KEY` from `process.env`.
 *   - If the env var is missing, fails softly with `reason: 'NO_API_KEY'`
 *     WITHOUT performing any network I/O.
 *   - Enforces a 15s timeout via AbortController (also honors a caller signal).
 *   - NEVER throws — all errors are captured into the tagged result union.
 */

const TAVILY_ENDPOINT = 'https://api.tavily.com/search'
const REQUEST_TIMEOUT_MS = 15_000
const SNIPPET_MAX_LENGTH = 300

export interface TavilySearchItem {
  title: string
  url: string
  snippet: string
}

export type TavilyResult =
  | { ok: true; results: TavilySearchItem[] }
  | {
      ok: false
      reason: 'NO_API_KEY' | 'HTTP_ERROR' | 'NETWORK'
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

function truncateSnippet(text: string | undefined): string {
  if (!text) return ''
  const trimmed = text.trim()
  if (trimmed.length <= SNIPPET_MAX_LENGTH) return trimmed
  return `${trimmed.slice(0, SNIPPET_MAX_LENGTH - 1).trimEnd()}…`
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
  const apiKey = process.env.TAVILY_API_KEY
  if (!apiKey) {
    return {
      ok: false,
      reason: 'NO_API_KEY',
      message: 'TAVILY_API_KEY not configured',
    }
  }

  const maxResults = opts.maxResults ?? 5

  const timeoutController = new AbortController()
  const timeoutId = setTimeout(
    () => timeoutController.abort(),
    REQUEST_TIMEOUT_MS,
  )
  const onCallerAbort = () => timeoutController.abort()
  if (opts.signal) {
    if (opts.signal.aborted) {
      clearTimeout(timeoutId)
      return {
        ok: false,
        reason: 'NETWORK',
        message: 'Aborted by caller signal',
      }
    }
    opts.signal.addEventListener('abort', onCallerAbort, { once: true })
  }

  try {
    const response = await fetch(TAVILY_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        max_results: maxResults,
        search_depth: 'basic',
      }),
      signal: timeoutController.signal,
    })

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      return {
        ok: false,
        reason: 'HTTP_ERROR',
        message: `Tavily search failed (${response.status}): ${text.slice(0, 200)}`,
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

    return { ok: true, results }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown network error'
    return { ok: false, reason: 'NETWORK', message }
  } finally {
    clearTimeout(timeoutId)
    opts.signal?.removeEventListener('abort', onCallerAbort)
  }
}
