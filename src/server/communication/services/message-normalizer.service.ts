/**
 * Message Normalizer Service
 *
 * Pure string-formatting utility that converts rich message types
 * (audio, image, video, location, document, sticker, contacts) into
 * human-readable text descriptions suitable for LLM consumption.
 *
 * Zero LLM calls — deterministic, side-effect-free.
 */

// ── Types ───────────────────────────────────────────────────────────────────

/**
 * Subset of the Prisma `Message` model fields relevant for normalization.
 * Mirrors real column names from `schema.prisma`.
 */
export interface MessageLike {
  type: string
  content?: string | null
  transcription?: string | null
  locationName?: string | null
  latitude?: number | null
  longitude?: number | null
  geoAddress?: string | null
  geoNeighborhood?: string | null
  geoCity?: string | null
  geoState?: string | null
  geoPostalCode?: string | null
  fileName?: string | null
  mediaType?: string | null
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Normalize a message into a plain-text string for AI context building.
 *
 * Rules per message type:
 * - `location`  — combine location name, address, neighborhood/city, postal code, coordinates
 * - `audio` / `voice` — transcription when available, otherwise placeholder
 * - `image`    — placeholder with optional caption
 * - `video`    — placeholder with optional caption
 * - `document` — file name when available, otherwise placeholder
 * - `sticker`  — placeholder
 * - `contact`  — placeholder
 * - `text` / default — content as-is
 */
export function normalizeForAI(message: MessageLike): string {
  const type = message.type?.toLowerCase() ?? 'text'

  switch (type) {
    case 'location':
      return normalizeLocation(message)

    case 'audio':
    case 'voice':
      return normalizeAudio(message)

    case 'image':
      return normalizeImage(message)

    case 'video':
      return normalizeVideo(message)

    case 'document':
      return normalizeDocument(message)

    case 'sticker':
      return '[Sticker/figurinha]'

    case 'contact':
      return '[Contato compartilhado]'

    case 'text':
    default:
      return message.content || `[${message.type}]`
  }
}

// ── Internal Helpers ────────────────────────────────────────────────────────

function normalizeLocation(msg: MessageLike): string {
  const parts: string[] = []

  if (msg.locationName) parts.push(msg.locationName)
  if (msg.geoAddress) parts.push(msg.geoAddress)

  // Neighborhood / City
  const locality = [msg.geoNeighborhood, msg.geoCity].filter(Boolean).join(', ')
  if (locality) parts.push(locality)

  if (msg.geoPostalCode) parts.push(`CEP ${msg.geoPostalCode}`)

  if (msg.latitude != null && msg.longitude != null) {
    parts.push(`(${msg.latitude}, ${msg.longitude})`)
  }

  if (parts.length > 0) {
    return `[Localização]: ${parts.join(' - ')}`
  }

  return '[Localização enviada]'
}

function normalizeAudio(msg: MessageLike): string {
  if (msg.transcription) {
    return `[Audio transcrito]: ${msg.transcription}`
  }
  return '[Audio recebido]'
}

function normalizeImage(msg: MessageLike): string {
  const caption = msg.content?.trim()
  return `[Imagem enviada]${caption ? ': ' + caption : ''}`
}

function normalizeVideo(msg: MessageLike): string {
  const caption = msg.content?.trim()
  return `[Video recebido]${caption ? ': ' + caption : ''}`
}

function normalizeDocument(msg: MessageLike): string {
  if (msg.fileName) {
    return `[Documento: ${msg.fileName}]`
  }
  return '[Documento recebido]'
}
