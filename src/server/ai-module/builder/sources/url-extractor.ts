/**
 * Builder Module — Source ref extractor (Orayon Uplift, W4 source-ingestion)
 *
 * PURE, IO-free detector for "cole seu site/IG" turns. Given a chat message it
 * finds http(s) URLs and Instagram handles/links, NORMALIZES them (strips
 * tracking params, lowercases host), classifies each as `url` | `instagram`,
 * dedupes, and returns the refs. Plain chat (no link/handle) returns `[]` so
 * non-source turns are left completely untouched by the caller.
 *
 * IMPORTANT — NO FETCH HERE. The actual download happens later on the async
 * `quayer:source-enrich` job via the existing `safeFetch`/`extractUrlText`
 * (text-extraction.ts). Instagram is just `instagram.com/<handle>` through that
 * same guarded fetch — so for `type:'instagram'` we emit a canonical absolute
 * URL (`https://www.instagram.com/<handle>`) the job can feed straight into
 * `safeFetch` with zero new fetch paths.
 *
 * Output shape matches `SourceIngestionItem` (builder-state.ts) sans status:
 *   { value, type }  where `value` is always a normalized absolute http(s) URL.
 *
 * Contract: spec docs/builder/ORAYON_UPLIFT_SPEC.md §5 (source-ingestion).
 */

/** A single detected source reference (pre-fetch, pre-ingestion). */
export interface SourceRef {
  /** Normalized absolute http(s) URL ready for the async fetch path. */
  value: string
  type: 'url' | 'instagram'
}

// ---------------------------------------------------------------------------
// Detection regexes
// ---------------------------------------------------------------------------

/**
 * Bare http(s) URL. Intentionally liberal on the path/query/fragment; we lean
 * on the WHATWG `URL` parser below to reject malformed candidates. We stop at
 * whitespace and the angle/quote/paren wrappers people commonly put around
 * pasted links.
 */
const URL_REGEX = /https?:\/\/[^\s<>"'()\][]+/gi

/**
 * Instagram link WITHOUT a scheme — e.g. `instagram.com/acme`, `www.instagram.com/acme/`.
 * The scheme'd form (`https://instagram.com/...`) is caught by URL_REGEX and
 * re-classified as instagram in normalization. Capture group 1 = handle.
 */
const IG_BARE_URL_REGEX =
  /(?:^|[\s(])(?:www\.)?instagram\.com\/([A-Za-z0-9._]+)/gi

/**
 * `@handle` mention. Instagram handles are 1-30 chars: letters, digits, dot,
 * underscore. Must be bounded so we don't grab the local-part of an email
 * (`foo@bar.com`) — we require the `@` to be at a boundary that is NOT a word
 * char and NOT a dot (which would mean it's mid-token, e.g. an email).
 */
const IG_HANDLE_REGEX = /(?:^|[^\w@.])@([A-Za-z0-9._]{1,30})\b/g

// Hosts we treat as Instagram regardless of how they were pasted.
const INSTAGRAM_HOSTS = new Set(['instagram.com', 'www.instagram.com'])

// Tracking / analytics query params stripped from every URL before dedupe.
const TRACKING_PARAM_REGEX = /^(utm_|fbclid$|gclid$|igshid$|igsh$|mc_|ref$|ref_src$|_ga$|si$|spm$)/i

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

/**
 * Parse, validate and canonicalize a URL for stable dedupe. Returns:
 *   - the parsed `URL` (host already lowercased, tracking params stripped) for
 *     classification, plus
 *   - the canonical string `value` (no fragment, trailing slash trimmed).
 * Returns null on invalid / non-http(s) URLs.
 */
function normalizeUrl(raw: string): { url: URL; value: string } | null {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null

  // Lowercase the host (origin is case-insensitive); leave path/query casing.
  url.hostname = url.hostname.toLowerCase()

  // Drop tracking/analytics query params; preserve real ones in order.
  const kept: [string, string][] = []
  for (const [key, val] of url.searchParams.entries()) {
    if (!TRACKING_PARAM_REGEX.test(key)) kept.push([key, val])
  }
  url.search = ''
  for (const [key, val] of kept) url.searchParams.append(key, val)

  // Fragments are never content-bearing for ingestion.
  url.hash = ''

  // Canonical string: trim a trailing path slash so "/acme/" === "/acme" and a
  // host-only "https://acme.com/" === "https://acme.com" (only when there is no
  // query string clinging to it).
  let value = url.toString()
  if (!url.search && value.endsWith('/')) {
    value = value.replace(/\/+$/, '')
  }

  return { url, value }
}

/** Build the canonical Instagram profile URL for a handle. */
function instagramUrlFromHandle(handle: string): string {
  return `https://www.instagram.com/${handle.toLowerCase()}`
}

/**
 * Canonicalize a SINGLE already-pasted source value into the SAME canonical
 * form `extractSourceRefs` emits: lowercased host, tracking params stripped,
 * no fragment, **no trailing slash**. This is the ONE canonical shape persisted
 * everywhere (KnowledgeSource.source, the builderState mirror, mergeSources
 * dedupe) — callers that receive a raw URL from a request body or an LLM tool
 * call (POST /sources/ingest, teach_agent) MUST run it through here, otherwise
 * "https://acme.com.br" and "https://acme.com.br/" become two distinct sources.
 *
 * Fail-open: non-URL / unparseable input is returned trimmed, unchanged (the
 * caller's Zod validation owns rejection; this helper never throws).
 */
export function canonicalizeSourceValue(raw: string): string {
  if (typeof raw !== 'string') return ''
  const trimmed = raw.trim()
  if (trimmed.length === 0) return trimmed
  const normalized = normalizeUrl(trimmed)
  return normalized ? normalized.value : trimmed
}

// ---------------------------------------------------------------------------
// extractSourceRefs
// ---------------------------------------------------------------------------

/**
 * Detect, normalize, classify and dedupe source references in a chat message.
 *
 * Pure — no IO, no fetch. Returns `[]` for plain chat (no URL / IG handle),
 * which the caller uses to leave non-source turns untouched.
 *
 * Dedupe key is the final normalized `value`, so `@acme`,
 * `instagram.com/acme`, and `https://www.instagram.com/acme/?igshid=x` all
 * collapse to a single `{ value:'https://www.instagram.com/acme', type:'instagram' }`.
 */
export function extractSourceRefs(text: string): SourceRef[] {
  if (typeof text !== 'string' || text.trim().length === 0) return []

  const byValue = new Map<string, SourceRef>()

  const add = (value: string, type: SourceRef['type']): void => {
    // Instagram always wins over a generic url classification for the same value
    // (shouldn't happen post-normalization, but keep it deterministic).
    const existing = byValue.get(value)
    if (existing && existing.type === 'instagram') return
    byValue.set(value, { value, type })
  }

  // 1) Scheme'd URLs (covers https://instagram.com/... too).
  for (const match of text.matchAll(URL_REGEX)) {
    // Trim trailing punctuation that commonly clings to pasted links.
    const raw = match[0].replace(/[.,;:!?]+$/, '')
    const normalized = normalizeUrl(raw)
    if (!normalized) continue
    const { url, value } = normalized

    if (INSTAGRAM_HOSTS.has(url.hostname)) {
      const handle = url.pathname.split('/').filter(Boolean)[0]
      if (handle) {
        add(instagramUrlFromHandle(handle), 'instagram')
      } else {
        // instagram.com root with no profile → treat as a plain url source.
        add(value, 'url')
      }
      continue
    }
    add(value, 'url')
  }

  // 2) Bare instagram.com links (no scheme).
  for (const match of text.matchAll(IG_BARE_URL_REGEX)) {
    const handle = match[1]
    if (handle) add(instagramUrlFromHandle(handle), 'instagram')
  }

  // 3) `@handle` mentions.
  for (const match of text.matchAll(IG_HANDLE_REGEX)) {
    const handle = match[1]
    // A lone "@" or a handle that is only dots/underscores is noise.
    if (!handle || !/[A-Za-z0-9]/.test(handle)) continue
    add(instagramUrlFromHandle(handle), 'instagram')
  }

  return [...byValue.values()]
}
