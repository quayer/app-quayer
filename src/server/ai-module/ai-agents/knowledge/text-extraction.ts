/**
 * Text extraction para ingestão RAG — PDF, URL (HTML/PDF) e texto cru.
 *
 * Separado do ingestion service para manter cada arquivo enxuto (<200 linhas).
 * Sem estado; apenas funções puras de extração.
 */

import { isIP } from 'node:net'

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
//
// A defesa tem duas camadas:
//  1) regex textual (rápida, pega os hostnames/IP-literais mais comuns); e
//  2) parse estruturado via node:net `isIP` quando o hostname é um literal de IP,
//     o que cobre formas que escapam do regex — IPv4-mapped/embedded em IPv6,
//     NAT64, CGNAT, etc. O regex sozinho perde p.ex. ::ffff:169.254.169.254.
const PRIVATE_HOST_REGEX =
  /^(localhost|0\.0\.0\.0|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?|\[?fc00:|\[?fd00:|\[?fe80:)/i

/** Bloqueia ranges IPv4 não-roteáveis/internos a partir do octeto. */
function isBlockedIpv4(ip: string): boolean {
  const parts = ip.split('.').map((p) => Number.parseInt(p, 10))
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
    // Não é um IPv4 válido decimal pontilhado — deixa as outras camadas decidirem.
    return false
  }
  const [a, b] = parts
  if (a === 0) return true // 0.0.0.0/8 "this network"
  if (a === 10) return true // 10.0.0.0/8 privado
  if (a === 127) return true // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true // 169.254.0.0/16 link-local (metadata cloud)
  if (a === 172 && b >= 16 && b <= 31) return true // 172.16.0.0/12 privado
  if (a === 192 && b === 168) return true // 192.168.0.0/16 privado
  if (a === 100 && b >= 64 && b <= 127) return true // 100.64.0.0/10 CGNAT (RFC 6598)
  return false
}

/**
 * Bloqueia literais IPv6 perigosos, incluindo os que "embrulham" um IPv4
 * interno e portanto contornam a checagem textual de IPv4:
 *  - ::             (unspecified)
 *  - ::1            (loopback)
 *  - ::ffff:0:0/96  (IPv4-mapped → checa o IPv4 embutido)
 *  - 64:ff9b::/96   (IPv4-embedded / NAT64 well-known → checa o IPv4 embutido)
 *  - fc00::/7       (ULA: fc00::/8 + fd00::/8)
 *  - fe80::/10      (link-local)
 */
function isBlockedIpv6(ipRaw: string): boolean {
  // Remove zona scoped (fe80::1%eth0) e normaliza para minúsculas.
  const ip = ipRaw.toLowerCase().split('%')[0]

  if (ip === '::' || ip === '::1') return true

  // IPv4-mapped (::ffff:a.b.c.d ou ::ffff:0:0/96) e well-known NAT64 (64:ff9b::/96):
  // se houver um IPv4 embutido, valida-o com as regras de IPv4.
  const embeddedV4 = ip.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/)
  if (embeddedV4) {
    const isMapped = ip.startsWith('::ffff:') || ip.includes(':ffff:')
    const isNat64 = ip.startsWith('64:ff9b:') || ip.startsWith('64:ff9b::')
    if (isMapped || isNat64) {
      if (isBlockedIpv4(embeddedV4[1])) return true
    }
  }
  // IPv4-mapped/NAT64 na forma hex (sem ponto), ex.: ::ffff:a9fe:a9fe.
  if (ip.startsWith('::ffff:') || ip.startsWith('64:ff9b:') || ip.startsWith('64:ff9b::')) {
    return true
  }

  // ULA fc00::/7 → primeiro hextet começa com fc ou fd.
  if (/^fc[0-9a-f]{0,2}:/.test(ip) || /^fd[0-9a-f]{0,2}:/.test(ip)) return true
  // Link-local fe80::/10 → fe8x..febx no primeiro hextet.
  if (/^fe[89ab][0-9a-f]?:/.test(ip)) return true

  return false
}

export function assertPublicHttpUrl(raw: string): URL {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new Error('URL inválida')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`Scheme não permitido: ${url.protocol}`)
  }

  const hostname = url.hostname
  // hostname já vem sem colchetes em Node, mas normalizamos por garantia.
  const bareHost = hostname.replace(/^\[|\]$/g, '')

  // Camada textual (cobre hostnames como "localhost" e IP-literais comuns).
  if (PRIVATE_HOST_REGEX.test(hostname) || PRIVATE_HOST_REGEX.test(bareHost)) {
    throw new Error('Host privado/interno bloqueado (SSRF)')
  }

  // Camada estruturada: só quando o host é um literal de IP.
  const ipVersion = isIP(bareHost)
  if (ipVersion === 4 && isBlockedIpv4(bareHost)) {
    throw new Error('Host privado/interno bloqueado (SSRF)')
  }
  if (ipVersion === 6 && isBlockedIpv6(bareHost)) {
    throw new Error('Host privado/interno bloqueado (SSRF)')
  }

  return url
}

const FETCH_TIMEOUT_MS = 10_000
const MAX_REDIRECTS = 3

/**
 * fetch seguro: valida cada hop, timeout, segue até MAX_REDIRECTS manualmente.
 *
 * Exportado (Onda D1) para o image-pipeline reusar o MESMO guard anti-SSRF (com
 * revalidação por hop de redirect) ao baixar imagens das fontes. NÃO limita o
 * corpo da resposta — o caller aplica o cap de bytes lendo o stream/arrayBuffer.
 */
export async function safeFetch(rawUrl: string): Promise<Response> {
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

/**
 * Onda D1 — variante de `extractUrlText` que ALÉM do texto limpo devolve o HTML
 * CRU do MESMO fetch, para o image-pipeline extrair `<img>`/`url()` sem um 2º
 * round-trip nem reentrar no guard SSRF.
 *
 * Para URLs que servem PDF não há HTML (`html: ''`) — o caller (ingestSource)
 * só usa `html` quando a fonte é um site. `text` é idêntico ao de `extractUrlText`
 * (mesmo stripHtml), preservando o comportamento do RAG.
 */
export async function extractUrlTextWithHtml(
  url: string,
): Promise<{ text: string; html: string }> {
  const res = await safeFetch(url)
  if (!res.ok) throw new Error(`fetch → HTTP ${res.status}`)
  const contentType = res.headers.get('content-type') ?? ''
  if (contentType.includes('application/pdf')) {
    const buf = Buffer.from(await res.arrayBuffer())
    return { text: await extractPdfText(buf), html: '' }
  }
  const html = await res.text()
  return { text: stripHtml(html), html }
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
