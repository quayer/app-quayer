/**
 * Builder Module — Google Sheets CSV parser + SSRF allowlist (Onda B, G3 core)
 *
 * PURE, IO-LIGHT helper behind the pricing card's "importar de planilha" flow.
 * Given a `docs.google.com/spreadsheets/d/<id>` link it:
 *   1) VALIDATES the URL against a SINGLE-HOST allowlist (docs.google.com only —
 *      this is the SSRF perimeter; we never widen the existing fetch surface);
 *   2) BUILDS the published CSV export URL (gviz/tq?tqx=out:csv) for the doc +
 *      the `gid` carried in the link (defaults to the first sheet);
 *   3) FETCHES it with a hard 8s timeout, a ~2MB byte cap (streamed, so a hostile
 *      body can't OOM us) and — critically — NO cross-host redirects: any 3xx
 *      whose Location leaves docs.google.com is rejected (the classic SSRF bypass
 *      where a public host bounces you to 169.254.169.254 or an internal sheet);
 *   4) PARSES the CSV quote-aware (RFC-4180-ish: "", embedded commas/newlines),
 *      caps at 200 rows, detects whether row 0 is a header, and SUGGESTS a
 *      column→role mapping (service_name/price/category/description/image_url) by
 *      PT-BR header fuzzy match.
 *
 * NO DB, NO org logic, NO Igniter — the route file owns auth + tenant scoping and
 * just calls `parseGoogleSheet`. This mirrors Orayon's `useSheetParse` /
 * `sheetColumnRoles` semantics (UX intent), NOT its code.
 *
 * Dependency-free beyond the platform `fetch`/`URL`. TS strict, zero `any`.
 */

// ==========================================
// Public contract (consumed verbatim by the route + FE)
// ==========================================

/**
 * The ONLY URL shape we accept. Anchored, scheme-agnostic (http|https), requires
 * the `/spreadsheets/d/<id>` path on `docs.google.com`. Anything else is an
 * `invalid_url` before a single byte is fetched.
 */
export const GOOGLE_SHEETS_URL_RE =
  /^https?:\/\/docs\.google\.com\/spreadsheets\/d\/[^/?#\s]+/i

/** Canonical column roles the FE maps detected columns onto. */
export type SheetColumnRole =
  | 'service_name'
  | 'price'
  | 'category'
  | 'description'
  | 'image_url'

export interface SheetParseResult {
  /** Header labels when `hasHeader`, else synthetic `Coluna 1..N`. */
  headers: string[]
  /** Data rows (header excluded when detected). Capped to MAX_ROWS. */
  rows: string[][]
  /** Number of data rows returned in `rows`. */
  rowCount: number
  /** Whether row 0 was detected as a header (vs. straight into data). */
  hasHeader: boolean
  /** Per-column best-guess role (header label → role), null when unmapped. */
  columnSuggestions: Record<string, SheetColumnRole | null>
}

export type SheetParseErrorKind =
  | 'invalid_url'
  | 'private_or_no_public_link'
  | 'not_found'
  | 'empty'
  | 'fetch_timeout'
  | 'fetch_failed'
  | 'too_large'
  | 'unknown'

/** Typed failure the route maps to a friendly PT-BR message + HTTP status. */
export class SheetParseError extends Error {
  readonly kind: SheetParseErrorKind

  constructor(kind: SheetParseErrorKind, message?: string) {
    super(message ?? kind)
    this.name = 'SheetParseError'
    this.kind = kind
    // Restore prototype chain across the TS `extends Error` downlevel quirk.
    Object.setPrototypeOf(this, SheetParseError.prototype)
  }
}

// ==========================================
// Bounds (exported so the route/FE share the exact numbers)
// ==========================================

/** Hard cap on returned data rows (defense against a giant published sheet). */
export const MAX_ROWS = 200
/** Byte cap on the fetched body (~2MB). Enforced while streaming. */
export const MAX_BYTES = 2 * 1024 * 1024
/** Hard per-fetch timeout. */
export const FETCH_TIMEOUT_MS = 8000
/** Slice of rows the FE shows as a mapping preview (informational). */
export const PREVIEW_ROWS = 50

// The single host this module is ever allowed to talk to.
const ALLOWED_HOST = 'docs.google.com'
// Google bounces published exports through these on the happy path; we re-validate
// EACH hop and only follow when the destination host stays inside the allowlist.
const ALLOWED_REDIRECT_HOSTS = new Set([
  'docs.google.com',
  'docs.googleusercontent.com',
])
const MAX_REDIRECTS = 4

// ==========================================
// URL handling — SSRF perimeter
// ==========================================

/**
 * Parse a `docs.google.com/spreadsheets/d/<id>` link into its doc id + optional
 * `gid` (sheet/tab). Throws `invalid_url` if it isn't a Google Sheets link on the
 * allowed host. This is the gate: NOTHING reaches `fetch` without passing here.
 */
function parseSheetUrl(sheetUrl: string): { docId: string; gid: string | null } {
  if (typeof sheetUrl !== 'string' || !GOOGLE_SHEETS_URL_RE.test(sheetUrl)) {
    throw new SheetParseError('invalid_url')
  }

  let url: URL
  try {
    url = new URL(sheetUrl)
  } catch {
    throw new SheetParseError('invalid_url')
  }

  // Allowlist: scheme MUST be http(s) and host MUST be EXACTLY docs.google.com.
  // (No subdomain wildcards — that's how the SSRF surface stays a single host.)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new SheetParseError('invalid_url')
  }
  if (url.hostname.toLowerCase() !== ALLOWED_HOST) {
    throw new SheetParseError('invalid_url')
  }

  // /spreadsheets/d/<docId>/...
  const m = url.pathname.match(/\/spreadsheets\/d\/([^/?#]+)/)
  const docId = m?.[1]
  if (!docId) throw new SheetParseError('invalid_url')

  // gid lives in the fragment (#gid=123) on UI links and sometimes the query.
  const gid = extractGid(url)

  return { docId, gid }
}

/** Pull the numeric `gid` (sheet/tab id) from the fragment or query, if present. */
function extractGid(url: URL): string | null {
  const fromQuery = url.searchParams.get('gid')
  if (fromQuery && /^\d+$/.test(fromQuery)) return fromQuery

  // Fragment form: "#gid=123456" (most common when copied from the browser).
  const hash = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash
  const hashParams = new URLSearchParams(hash)
  const fromHash = hashParams.get('gid')
  if (fromHash && /^\d+$/.test(fromHash)) return fromHash

  return null
}

/**
 * Build the published CSV export URL. `gviz/tq?tqx=out:csv` is the endpoint that
 * works for "anyone with the link" sheets WITHOUT OAuth; a private sheet answers
 * with an HTML sign-in page (we detect that downstream and raise
 * `private_or_no_public_link`).
 */
function buildCsvExportUrl(docId: string, gid: string | null): string {
  const base = `https://${ALLOWED_HOST}/spreadsheets/d/${encodeURIComponent(
    docId,
  )}/gviz/tq?tqx=out:csv`
  return gid ? `${base}&gid=${encodeURIComponent(gid)}` : base
}

/** A redirect Location is safe ONLY if it stays on an allowlisted Google host. */
function assertAllowedRedirect(location: string, currentUrl: string): string {
  let next: URL
  try {
    next = new URL(location, currentUrl)
  } catch {
    throw new SheetParseError('fetch_failed')
  }
  if (next.protocol !== 'http:' && next.protocol !== 'https:') {
    throw new SheetParseError('fetch_failed')
  }
  if (!ALLOWED_REDIRECT_HOSTS.has(next.hostname.toLowerCase())) {
    // Bounced off the allowlist → treat as a hostile/unexpected redirect, never
    // follow it. This is the SSRF kill-switch.
    throw new SheetParseError('fetch_failed')
  }
  return next.toString()
}

// ==========================================
// Fetch — timeout + byte cap + no cross-host redirects
// ==========================================

interface FetchedBody {
  status: number
  contentType: string
  text: string
}

/**
 * Fetch the CSV export with a hard timeout, manual redirect handling (each hop
 * re-validated against the allowlist) and a streamed byte cap. Returns the body
 * text + status + content-type for the caller to interpret.
 *
 * Throws `fetch_timeout` on abort, `too_large` past MAX_BYTES, `fetch_failed`
 * for network/redirect issues.
 */
async function fetchCsv(initialUrl: string): Promise<FetchedBody> {
  let current = initialUrl

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

    let res: Response
    try {
      res = await fetch(current, {
        method: 'GET',
        redirect: 'manual', // we re-validate every hop ourselves
        signal: controller.signal,
        headers: {
          accept: 'text/csv,text/plain;q=0.9,*/*;q=0.5',
          'user-agent': 'QuayerSheetImport/1.0 (+https://quayer.com)',
        },
      })
    } catch (err) {
      clearTimeout(timer)
      if (err instanceof SheetParseError) throw err
      if (isAbortError(err)) throw new SheetParseError('fetch_timeout')
      throw new SheetParseError('fetch_failed')
    }

    // Manual redirect: validate destination host before following.
    if (res.status >= 300 && res.status < 400) {
      clearTimeout(timer)
      const location = res.headers.get('location')
      if (!location) {
        // 3xx with no Location is unusable.
        throw new SheetParseError('fetch_failed')
      }
      current = assertAllowedRedirect(location, current)
      continue
    }

    try {
      const contentType = (res.headers.get('content-type') ?? '').toLowerCase()
      const text = await readCappedBody(res, controller)
      return { status: res.status, contentType, text }
    } catch (err) {
      if (err instanceof SheetParseError) throw err
      if (isAbortError(err)) throw new SheetParseError('fetch_timeout')
      throw new SheetParseError('fetch_failed')
    } finally {
      clearTimeout(timer)
    }
  }

  // Exhausted the redirect budget → suspicious, fail closed.
  throw new SheetParseError('fetch_failed')
}

/** True for the DOMException/AbortError raised when the timeout fires. */
function isAbortError(err: unknown): boolean {
  return (
    err instanceof Error &&
    (err.name === 'AbortError' || err.name === 'TimeoutError')
  )
}

/**
 * Read the response body while enforcing MAX_BYTES. Prefers streaming (so we
 * abort the moment we cross the cap instead of buffering a hostile multi-GB
 * body); falls back to a one-shot read + length check when the body isn't a
 * stream (e.g. some test/runtime shims).
 */
async function readCappedBody(
  res: Response,
  controller: AbortController,
): Promise<string> {
  // Fast reject when the server is honest about a too-big body.
  const declared = Number.parseInt(
    res.headers.get('content-length') ?? '',
    10,
  )
  if (Number.isFinite(declared) && declared > MAX_BYTES) {
    throw new SheetParseError('too_large')
  }

  const body = res.body
  if (!body || typeof body.getReader !== 'function') {
    // No stream available — buffer then check length defensively.
    const buf = new Uint8Array(await res.arrayBuffer())
    if (buf.byteLength > MAX_BYTES) throw new SheetParseError('too_large')
    return new TextDecoder('utf-8').decode(buf)
  }

  const reader = body.getReader()
  const decoder = new TextDecoder('utf-8')
  const chunks: string[] = []
  let total = 0

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) {
        total += value.byteLength
        if (total > MAX_BYTES) {
          // Stop the transfer immediately; don't keep draining a hostile body.
          controller.abort()
          throw new SheetParseError('too_large')
        }
        chunks.push(decoder.decode(value, { stream: true }))
      }
    }
    chunks.push(decoder.decode())
  } finally {
    // Best-effort release; ignore if already released by the abort.
    try {
      reader.releaseLock()
    } catch {
      /* noop */
    }
  }

  return chunks.join('')
}

// ==========================================
// CSV parsing — quote-aware (RFC-4180-ish)
// ==========================================

/**
 * Parse CSV text into a matrix of string cells. Handles:
 *   - quoted fields ("...") with embedded commas and newlines,
 *   - escaped quotes inside a quoted field (""),
 *   - CRLF / CR / LF line endings,
 *   - a trailing newline (no phantom empty final row).
 *
 * Capped: stops accumulating once MAX_ROWS+1 rows exist (header + data) so a
 * pathological-but-under-byte-cap sheet can't blow the matrix up. Pure.
 */
function parseCsv(input: string, maxRows: number): string[][] {
  // Strip a UTF-8 BOM the export sometimes prepends.
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input

  const rows: string[][] = []
  let field = ''
  let row: string[] = []
  let inQuotes = false
  let started = false // any char seen on the current row (to detect a real row)

  const pushField = (): void => {
    row.push(field)
    field = ''
  }
  const pushRow = (): void => {
    pushField()
    rows.push(row)
    row = []
    started = false
  }

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++ // consume the escaped quote
        } else {
          inQuotes = false
        }
      } else {
        field += ch
      }
      continue
    }

    if (ch === '"') {
      inQuotes = true
      started = true
      continue
    }
    if (ch === ',') {
      pushField()
      started = true
      continue
    }
    if (ch === '\r') {
      // CRLF or lone CR ends the row; swallow a following LF.
      if (text[i + 1] === '\n') i++
      pushRow()
      // Stop once we've gathered header + maxRows data rows.
      if (rows.length >= maxRows + 1) return rows
      continue
    }
    if (ch === '\n') {
      pushRow()
      if (rows.length >= maxRows + 1) return rows
      continue
    }

    field += ch
    started = true
  }

  // Flush the final row unless the file ended exactly on a newline (no trailing
  // phantom row) — i.e. only flush when there is pending content.
  if (started || field.length > 0 || row.length > 0) {
    pushRow()
  }

  return rows
}

// ==========================================
// Header detection + PT-BR column→role fuzzy match
// ==========================================

/** Strip accents + lowercase + collapse whitespace for fuzzy header matching. */
function normalizeLabel(label: string): string {
  return label
    .normalize('NFD')
    // Drop combining diacritics (the NFD-separated accent marks, U+0300–U+036F).
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

// Role keyword tables (PT-BR + a few EN fallbacks). Order in the array is the
// match priority; the first role whose any-keyword is found wins for a column.
const ROLE_KEYWORDS: ReadonlyArray<readonly [SheetColumnRole, readonly string[]]> = [
  [
    'image_url',
    ['foto', 'fotos', 'imagem', 'imagens', 'img', 'image', 'picture', 'url da foto', 'link da foto'],
  ],
  [
    'price',
    ['preco', 'precos', 'valor', 'valores', 'price', 'custo', 'r ', 'rs', 'preco r'],
  ],
  [
    'category',
    ['categoria', 'categorias', 'grupo', 'tipo', 'segmento', 'category', 'cat'],
  ],
  [
    'description',
    ['descricao', 'descricoes', 'detalhe', 'detalhes', 'observacao', 'obs', 'description', 'desc'],
  ],
  [
    'service_name',
    ['servico', 'servicos', 'produto', 'produtos', 'item', 'itens', 'nome', 'service', 'name', 'titulo'],
  ],
]

/** Best-guess role for a single header label (null when nothing matches). */
function roleForHeader(label: string): SheetColumnRole | null {
  const norm = normalizeLabel(label)
  if (!norm) return null

  // Token-aware: split into words so "valor unitario" matches `valor` cleanly
  // and we don't false-match substrings (e.g. "categoria" must not hit `cat` of
  // another word). We check both the whole normalized string and its tokens.
  const tokens = new Set(norm.split(' '))

  for (const [role, keywords] of ROLE_KEYWORDS) {
    for (const kw of keywords) {
      const k = kw.trim()
      if (!k) continue
      if (k.includes(' ')) {
        // Multi-word keyword → substring match on the full normalized label.
        if (norm.includes(k)) return role
      } else if (tokens.has(k) || norm === k) {
        return role
      }
    }
  }
  return null
}

/**
 * Decide whether row 0 is a header. Heuristic (mirrors Orayon's intent): a header
 * row is mostly non-empty, mostly non-numeric text, and at least one cell maps to
 * a known role. A first row that is largely numeric (i.e. already data) is NOT a
 * header.
 */
function detectHeader(firstRow: string[]): boolean {
  const cells = firstRow.map((c) => c.trim())
  const nonEmpty = cells.filter((c) => c.length > 0)
  if (nonEmpty.length === 0) return false

  const numericCount = nonEmpty.filter((c) => isNumericish(c)).length
  // If half-or-more of the populated cells look like numbers/prices, it's data.
  if (numericCount * 2 >= nonEmpty.length) return false

  // A real header usually has at least one column we can name a role for.
  const anyRole = cells.some((c) => roleForHeader(c) !== null)
  if (anyRole) return true

  // Fallback: all-text, no-numbers first row is still very likely a header.
  return numericCount === 0
}

/** Loose "is this cell basically a number / BRL price" check. */
function isNumericish(cell: string): boolean {
  const c = cell.replace(/^r\$\s?/i, '').replace(/\s+/g, '')
  if (!c) return false
  // Accept "1.234,56", "1234.56", "1234", "12,5", optional sign.
  return /^[+-]?(\d{1,3}(\.\d{3})*|\d+)([.,]\d+)?$/.test(c)
}

// ==========================================
// Orchestrator
// ==========================================

/**
 * Parse a public Google Sheet into headers + rows + a suggested column→role map.
 *
 * Throws `SheetParseError` for every failure mode (the route maps `.kind` to a
 * status + PT-BR message). Never returns a partial/ambiguous success.
 */
export async function parseGoogleSheet(
  sheetUrl: string,
): Promise<SheetParseResult> {
  const { docId, gid } = parseSheetUrl(sheetUrl)
  const exportUrl = buildCsvExportUrl(docId, gid)

  const { status, contentType, text } = await fetchCsv(exportUrl)

  // ── Interpret the HTTP/content signals BEFORE trusting the body as CSV. ──
  if (status === 404) throw new SheetParseError('not_found')
  if (status === 401 || status === 403) {
    throw new SheetParseError('private_or_no_public_link')
  }
  if (status >= 400) throw new SheetParseError('fetch_failed')

  // A private / not-published sheet answers 200 with an HTML sign-in page rather
  // than CSV. Detect that: HTML content-type OR a body that opens like markup.
  const looksHtml =
    contentType.includes('text/html') ||
    /^\s*<(?:!doctype|html|head|meta|body)\b/i.test(text)
  if (looksHtml) throw new SheetParseError('private_or_no_public_link')

  if (text.trim().length === 0) throw new SheetParseError('empty')

  // ── Parse + shape. ──
  const matrix = parseCsv(text, MAX_ROWS)
  if (matrix.length === 0) throw new SheetParseError('empty')

  const hasHeader = detectHeader(matrix[0] ?? [])

  // Column count = widest row, so a ragged sheet still yields a stable grid.
  const colCount = matrix.reduce((max, r) => Math.max(max, r.length), 0)
  if (colCount === 0) throw new SheetParseError('empty')

  const headerRow = hasHeader ? matrix[0] : []
  const headers: string[] = Array.from({ length: colCount }, (_, i) => {
    const label = headerRow[i]?.trim()
    return label && label.length > 0 ? label : `Coluna ${i + 1}`
  })

  // Normalize every data row to exactly colCount cells (pad short, trim long).
  const dataRows = hasHeader ? matrix.slice(1) : matrix
  const rows: string[][] = dataRows
    .slice(0, MAX_ROWS)
    .map((r) => {
      const out = new Array<string>(colCount)
      for (let i = 0; i < colCount; i++) out[i] = (r[i] ?? '').trim()
      return out
    })
    // Drop fully-empty rows (trailing blanks from the export are common noise).
    .filter((r) => r.some((c) => c.length > 0))

  if (rows.length === 0) throw new SheetParseError('empty')

  // Column suggestions keyed by the (possibly synthetic) header label. When the
  // sheet has no header we still try to name roles off the synthetic labels —
  // those won't match, so they correctly stay null and the FE maps manually.
  const columnSuggestions: Record<string, SheetColumnRole | null> = {}
  const usedRoles = new Set<SheetColumnRole>()
  for (let i = 0; i < colCount; i++) {
    const label = headers[i]
    const sourceLabel = hasHeader ? (headerRow[i]?.trim() ?? '') : ''
    let role = sourceLabel ? roleForHeader(sourceLabel) : null
    // Don't suggest the same role for two columns — keep the first, null the rest
    // (the FE can still override). This mirrors Orayon's one-role-per-column map.
    if (role && usedRoles.has(role)) role = null
    if (role) usedRoles.add(role)
    columnSuggestions[label] = role
  }

  return {
    headers,
    rows,
    rowCount: rows.length,
    hasHeader,
    columnSuggestions,
  }
}
