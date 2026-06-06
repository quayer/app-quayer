/**
 * sniff-image.ts — Magic-bytes image sniffer compartilhado (jpeg/png/webp/gif).
 *
 * PURE, IO-free. Extraído da rota POST /api/v1/builder/pricing-image/upload para
 * reuso pelo pipeline de imagens da Onda D (extração de imagens de fontes/website).
 *
 * Por que magic bytes: Content-Type/extensão são client-controlled; sem esta
 * checagem, lixo binário spoofado vira upload no bucket. O sniff valida a
 * assinatura real do arquivo (primeiros bytes).
 *
 * Suporta jpeg/png/webp/gif. Corpo idêntico ao da rota pricing-image/upload
 * (que passa a importar daqui — coupled edit).
 */

export interface ImageKind {
  ext: 'jpg' | 'png' | 'webp' | 'gif'
  contentType: string
}

/**
 * Detecta o tipo real da imagem pelos magic bytes.
 * Retorna `null` se o buffer for pequeno demais ou não corresponder a nenhum
 * formato suportado (caller deve tratar como "não é imagem" → skip).
 */
export function sniffImage(buffer: Buffer): ImageKind | null {
  if (buffer.length < 12) return null

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { ext: 'jpg', contentType: 'image/jpeg' }
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { ext: 'png', contentType: 'image/png' }
  }

  // GIF: "GIF87a" ou "GIF89a"
  if (buffer.toString('latin1', 0, 6) === 'GIF87a' || buffer.toString('latin1', 0, 6) === 'GIF89a') {
    return { ext: 'gif', contentType: 'image/gif' }
  }

  // WEBP: "RIFF" .... "WEBP" (bytes 0-3 = RIFF, bytes 8-11 = WEBP)
  if (buffer.toString('latin1', 0, 4) === 'RIFF' && buffer.toString('latin1', 8, 12) === 'WEBP') {
    return { ext: 'webp', contentType: 'image/webp' }
  }

  return null
}
