/**
 * sniff-media.ts — Magic-bytes media sniffer compartilhado (image/video/document).
 *
 * PURE, IO-free. Espelha src/lib/images/sniff-image.ts e o REUSA para a família
 * `image` (jpeg/png/webp/gif), estendendo a detecção para `video` (mp4/webm/
 * quicktime) e `document` (pdf). Usado pela rota generalizada de upload de mídia
 * (Fase E1) e por qualquer pipeline que precise validar a assinatura real.
 *
 * Por que magic bytes: Content-Type/extensão são client-controlled; sem esta
 * checagem, lixo binário spoofado vira upload no bucket. O sniff valida a
 * assinatura real do arquivo (primeiros bytes) → mediaType server-authoritative.
 *
 * Folha: sem dependentes no momento da criação. Não muta o input.
 */

import { sniffImage } from '@/lib/images/sniff-image'

export interface MediaKind {
  mediaType: 'image' | 'video' | 'document'
  ext: string
  contentType: string
}

/**
 * Detecta o tipo real da mídia pelos magic bytes.
 *
 * Ordem de detecção: PDF → MP4/MOV (ftyp box) → WEBM/MKV (EBML) → image (delega
 * a `sniffImage`, reusando o sniffer compartilhado). Retorna `null` se o buffer
 * for pequeno demais (< 12 bytes) ou não corresponder a nenhum formato suportado.
 */
export function sniffMedia(buffer: Buffer): MediaKind | null {
  if (buffer.length < 12) return null

  // DOCUMENT — PDF: "%PDF" (25 50 44 46)
  if (
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46
  ) {
    return { mediaType: 'document', ext: 'pdf', contentType: 'application/pdf' }
  }

  // VIDEO — MP4/MOV: ISO Base Media File Format. Bytes 4-7 = "ftyp", o major
  // brand (bytes 8-11) distingue QuickTime (.mov) de MP4.
  if (buffer.toString('latin1', 4, 8) === 'ftyp') {
    const majorBrand = buffer.toString('latin1', 8, 12)
    // QuickTime: major brand "qt  " (com dois espaços).
    if (majorBrand === 'qt  ') {
      return { mediaType: 'video', ext: 'mov', contentType: 'video/quicktime' }
    }
    // Demais brands ISO-BMFF (isom, mp41, mp42, iso2, avc1, M4V , etc.) → mp4.
    return { mediaType: 'video', ext: 'mp4', contentType: 'video/mp4' }
  }

  // VIDEO — WEBM/MKV: EBML header (1A 45 DF A3). WebM é um subset do Matroska;
  // ambos usam o mesmo magic. Reportamos como webm (caso comum no WhatsApp).
  if (
    buffer[0] === 0x1a &&
    buffer[1] === 0x45 &&
    buffer[2] === 0xdf &&
    buffer[3] === 0xa3
  ) {
    return { mediaType: 'video', ext: 'webm', contentType: 'video/webm' }
  }

  // IMAGE — delega ao sniffer compartilhado (jpeg/png/webp/gif) e mapeia
  // ImageKind → MediaKind com mediaType:'image'.
  const image = sniffImage(buffer)
  if (image) {
    return { mediaType: 'image', ext: image.ext, contentType: image.contentType }
  }

  return null
}
