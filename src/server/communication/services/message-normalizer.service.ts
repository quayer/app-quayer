type MessageRecord = Record<string, unknown>

const AUDIO_TYPES = new Set(['audio', 'voice', 'ptt'])
const MEDIA_TYPES = new Set(['image', 'video', 'document'])
const KNOWN_TYPES = new Set([
  'text',
  'conversation',
  'location',
  'contact',
  'contacts',
  'sticker',
  'poll',
  'list',
  'buttons',
  'button',
  'interactive',
  ...AUDIO_TYPES,
  ...MEDIA_TYPES,
])

function isRecord(value: unknown): value is MessageRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function cleanText(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value.replace(/\s+/g, ' ').trim()
}

function getString(record: MessageRecord, keys: string[]): string {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string') {
      const cleaned = cleanText(value)
      if (cleaned) return cleaned
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value)
    }
  }

  return ''
}

function getType(message: MessageRecord): string {
  const type = getString(message, ['type', 'messageType']).toLowerCase()
  if (KNOWN_TYPES.has(type)) return type

  const mediaType = getString(message, ['mediaType']).toLowerCase()
  return mediaType || type
}

function joinParts(parts: Array<string | false | null | undefined>): string {
  return parts.filter((part): part is string => typeof part === 'string' && part.length > 0).join(' | ')
}

function formatField(label: string, value: string): string {
  return value ? `${label}: ${value}` : ''
}

function getContent(message: MessageRecord): string {
  return getString(message, ['content', 'caption', 'body', 'text', 'description'])
}

function normalizeAudio(message: MessageRecord): string {
  const transcription = getString(message, ['transcription', 'transcript'])
  if (transcription) return `[Audio transcrito]: ${transcription}`

  return joinParts([
    '[Audio]',
    getContent(message),
    formatField('fileName', getString(message, ['fileName', 'filename'])),
    formatField('mediaType', getString(message, ['mediaType'])),
    formatField('mimeType', getString(message, ['mimeType', 'mimetype', 'mediaMimetype'])),
    formatField('mediaUrl', getString(message, ['mediaUrl', 'url'])),
  ])
}

function normalizeMedia(message: MessageRecord, type: string): string {
  const labelByType: Record<string, string> = {
    image: 'Imagem',
    video: 'Video',
    document: 'Documento',
  }

  return joinParts([
    `[${labelByType[type] ?? 'Midia'}]`,
    getContent(message),
    formatField('fileName', getString(message, ['fileName', 'filename'])),
    formatField('mediaType', getString(message, ['mediaType'])),
    formatField('mimeType', getString(message, ['mimeType', 'mimetype', 'mediaMimetype'])),
    formatField('mediaUrl', getString(message, ['mediaUrl', 'url'])),
  ])
}

function normalizeLocation(message: MessageRecord): string {
  const latitude = getString(message, ['latitude', 'lat'])
  const longitude = getString(message, ['longitude', 'lng', 'lon'])

  return joinParts([
    '[Localizacao]',
    getString(message, ['locationName', 'name']),
    formatField('geoAddress', getString(message, ['geoAddress', 'address'])),
    formatField('neighborhood', getString(message, ['geoNeighborhood', 'neighborhood'])),
    formatField('city', getString(message, ['geoCity', 'city'])),
    formatField('state', getString(message, ['geoState', 'state'])),
    formatField('postalCode', getString(message, ['geoPostalCode', 'postalCode', 'zipCode'])),
    latitude || longitude ? `lat/lng: ${latitude || '?'}, ${longitude || '?'}` : '',
  ])
}

function collectLabels(value: unknown): string[] {
  if (!Array.isArray(value)) return []

  return value
    .map((item) => {
      if (typeof item === 'string') return cleanText(item)
      if (!isRecord(item)) return ''
      return getString(item, ['title', 'label', 'text', 'name', 'id'])
    })
    .filter(Boolean)
}

function normalizeContact(message: MessageRecord): string {
  const contact = isRecord(message.contact) ? message.contact : message
  return joinParts([
    '[Contato]',
    getString(contact, ['displayName', 'name', 'fullName', 'pushName']),
    formatField('phone', getString(contact, ['phone', 'phoneNumber', 'waId', 'jid'])),
    formatField('email', getString(contact, ['email'])),
    formatField('organization', getString(contact, ['organization', 'company'])),
  ])
}

function normalizeSticker(message: MessageRecord): string {
  return joinParts([
    '[Sticker]',
    getString(message, ['emoji', 'content', 'caption']),
    formatField('fileName', getString(message, ['fileName', 'filename'])),
    formatField('mimeType', getString(message, ['mimeType', 'mimetype', 'mediaMimetype'])),
  ])
}

function normalizePoll(message: MessageRecord): string {
  const options = collectLabels(message.options)
  return joinParts([
    '[Enquete]',
    getString(message, ['name', 'title', 'question', 'content']),
    options.length ? `opcoes: ${options.join(', ')}` : '',
  ])
}

function normalizeList(message: MessageRecord): string {
  const rows = collectLabels(message.rows).concat(collectLabels(message.sections))
  return joinParts([
    '[Lista]',
    getString(message, ['title', 'content', 'body', 'description']),
    rows.length ? `itens: ${rows.join(', ')}` : '',
  ])
}

function normalizeButtons(message: MessageRecord): string {
  const buttons = collectLabels(message.buttons).concat(collectLabels(message.buttonOptions))
  return joinParts([
    '[Botoes]',
    getString(message, ['content', 'body', 'text', 'title']),
    buttons.length ? `opcoes: ${buttons.join(', ')}` : '',
  ])
}

function normalizeInteractive(message: MessageRecord): string {
  return joinParts([
    '[Interativo]',
    getString(message, ['content', 'body', 'title', 'text']),
    formatField('selected', getString(message, ['selectedOption', 'selectedText', 'selectedId'])),
  ])
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

export function normalizeForAI(message: unknown): string {
  if (typeof message === 'string') return cleanText(message)
  if (message == null) return ''
  if (!isRecord(message)) return String(message)

  const type = getType(message)

  if (type === 'text' || type === 'conversation') return getContent(message)
  if (AUDIO_TYPES.has(type)) return normalizeAudio(message)
  if (MEDIA_TYPES.has(type)) return normalizeMedia(message, type)
  if (type === 'location') return normalizeLocation(message)
  if (type === 'contact' || type === 'contacts') return normalizeContact(message)
  if (type === 'sticker') return normalizeSticker(message)
  if (type === 'poll') return normalizePoll(message)
  if (type === 'list') return normalizeList(message)
  if (type === 'buttons' || type === 'button') return normalizeButtons(message)
  if (type === 'interactive') return normalizeInteractive(message)

  const content = getContent(message)
  if (content) {
    return type ? `[${type}]: ${content}` : content
  }

  return safeJson(message)
}
