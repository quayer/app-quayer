/**
 * Text extraction para ingestão RAG — PDF, URL (HTML/PDF) e texto cru.
 *
 * Separado do ingestion service para manter cada arquivo enxuto (<200 linhas).
 * Sem estado; apenas funções puras de extração.
 */

export interface ExtractableSource {
  type: string
  /** URL (type='url') ou o próprio texto/título (type='text'). */
  source: string
}

export interface ExtractOptions {
  /** Buffer do PDF (type='pdf'). */
  buffer?: Buffer
  /** Texto cru já fornecido (type='text'). */
  rawText?: string
}

export async function extractPdfText(buffer: Buffer): Promise<string> {
  // pdf-parse v2: classe PDFParse({ data }).getText()
  const mod = (await import('pdf-parse')) as unknown as {
    PDFParse: new (opts: { data: Buffer | Uint8Array }) => {
      getText: () => Promise<{ text: string }>
    }
  }
  const parser = new mod.PDFParse({ data: buffer })
  const result = await parser.getText()
  return result?.text ?? ''
}

export function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<\/(p|div|h[1-6]|li|br|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// ── SSRF guard ────────────────────────────────────────────────────────────────
// Espelha isWebhookUrlBlocked (ai-agents/tools/custom-tools.ts): bloqueia hosts
// privados/loopback/link-local e schemes não-http(s). Aqui aceitamos http E https
// (sites de FAQ legados usam http) mas revalidamos CADA hop de redirect — um host
// público que redireciona p/ 169.254.169.254 é o bypass clássico de SSRF.
const PRIVATE_HOST_REGEX =
  /^(localhost|0\.0\.0\.0|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?|\[?fc00:|\[?fd00:|\[?fe80:)/i

function assertPublicHttpUrl(raw: string): URL {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new Error('URL inválida')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`Scheme não permitido: ${url.protocol}`)
  }
  if (PRIVATE_HOST_REGEX.test(url.hostname)) {
    throw new Error('Host privado/interno bloqueado (SSRF)')
  }
  return url
}

const FETCH_TIMEOUT_MS = 10_000
const MAX_REDIRECTS = 3

/** fetch seguro: valida cada hop, timeout, segue até MAX_REDIRECTS manualmente. */
async function safeFetch(rawUrl: string): Promise<Response> {
  let current = assertPublicHttpUrl(rawUrl).toString()
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    let res: Response
    try {
      res = await fetch(current, {
        headers: { 'user-agent': 'QuayerKnowledgeBot/1.0 (+https://quayer.com)' },
        redirect: 'manual',
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timer)
    }
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location')
      if (!location) return res
      // Revalida o destino do redirect (resolve relativo ao current).
      current = assertPublicHttpUrl(new URL(location, current).toString()).toString()
      continue
    }
    return res
  }
  throw new Error('Redirects demais')
}

export async function extractUrlText(url: string): Promise<string> {
  const res = await safeFetch(url)
  if (!res.ok) throw new Error(`fetch → HTTP ${res.status}`)
  const contentType = res.headers.get('content-type') ?? ''
  if (contentType.includes('application/pdf')) {
    const buf = Buffer.from(await res.arrayBuffer())
    return extractPdfText(buf)
  }
  return stripHtml(await res.text())
}

/** Dispatcher por tipo de fonte. Lança em tipo desconhecido / dados ausentes. */
export async function extractText(
  source: ExtractableSource,
  opts: ExtractOptions,
): Promise<string> {
  switch (source.type) {
    case 'pdf':
      if (!opts.buffer) throw new Error('PDF sem buffer para ingestão')
      return extractPdfText(opts.buffer)
    case 'url':
      return extractUrlText(source.source)
    case 'text':
      return (opts.rawText ?? source.source ?? '').trim()
    default:
      throw new Error(`Tipo de fonte desconhecido: ${source.type}`)
  }
}
