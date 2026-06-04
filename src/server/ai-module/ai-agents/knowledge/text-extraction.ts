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

export async function extractUrlText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'user-agent': 'QuayerKnowledgeBot/1.0 (+https://quayer.com)' },
    redirect: 'follow',
  })
  if (!res.ok) throw new Error(`fetch ${url} → HTTP ${res.status}`)
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
