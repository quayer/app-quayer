// ============================================================================
// message-splitter.service.ts
// US-037 — Format Tags parser for AI agent responses
// Pure regex, ZERO LLM. Converts tagged text into structured MessageBlocks.
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MessageBlockType =
  | 'text'
  | 'buttons'
  | 'list'
  | 'image'
  | 'audio'
  | 'video'
  | 'document'
  | 'location'
  | 'cta'

export interface TextBlock {
  type: 'text'
  content: string
}

export interface ButtonsBlock {
  type: 'buttons'
  body: string
  buttons: Array<{ id: string; title: string }>
}

export interface ListBlock {
  type: 'list'
  body: string
  sections: Array<{ title: string; items: Array<{ id: string; title: string }> }>
}

export interface ImageBlock {
  type: 'image'
  url: string
  caption?: string
}

export interface AudioBlock {
  type: 'audio'
  url: string
}

export interface VideoBlock {
  type: 'video'
  url: string
  caption?: string
}

export interface DocumentBlock {
  type: 'document'
  url: string
  caption?: string
}

export interface LocationBlock {
  type: 'location'
  latitude: number
  longitude: number
  name?: string
  address?: string
}

export interface CtaBlock {
  type: 'cta'
  body: string
  buttonText: string
  url: string
}

export type MessageBlock =
  | TextBlock
  | ButtonsBlock
  | ListBlock
  | ImageBlock
  | AudioBlock
  | VideoBlock
  | DocumentBlock
  | LocationBlock
  | CtaBlock

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_TEXT_BLOCK_LENGTH = 800
const MAX_BUTTONS = 3
const MAX_LIST_ITEMS_PER_SECTION = 10

// Matches any Format Tag: [type:...] — lazily captures the full tag.
// Uses a non-greedy match between the outermost brackets.
const TAG_REGEX =
  /\[(buttons|list|image|url da imagem|audio|video|document|location|cta)\s*:\s*((?:[^\[\]]|\[(?:[^\[\]])*\])*)\]/gi

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Slugify text for button IDs.
 * "Opcao 1" -> "opcao-1"
 * Removes accents, lowercases, replaces non-alphanumeric with dashes.
 */
export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Strip surrounding quotes (single or double) from a string.
 */
function unquote(s: string): string {
  const trimmed = s.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

// ---------------------------------------------------------------------------
// Tag Parsers
// ---------------------------------------------------------------------------

function parseButtons(inner: string): ButtonsBlock | ListBlock | TextBlock {
  // [buttons:"body text" | Option 1 | Option 2 | Option 3]
  const parts = inner.split('|').map((p) => p.trim())
  if (parts.length < 2) {
    return { type: 'text', content: `[buttons:${inner}]` }
  }

  const body = unquote(parts[0])
  const buttonLabels = parts.slice(1).filter(Boolean)

  const buttons = buttonLabels.map((label) => ({
    id: slugify(label),
    title: label.trim(),
  }))

  // If > MAX_BUTTONS, convert to a list block
  if (buttons.length > MAX_BUTTONS) {
    return {
      type: 'list',
      body,
      sections: [
        {
          title: 'Opcoes',
          items: buttons.map((b) => ({ id: b.id, title: b.title })),
        },
      ],
    }
  }

  return { type: 'buttons', body, buttons }
}

function parseList(inner: string): ListBlock | TextBlock {
  // [list:"body text" | Section Name > item1, item2, item3]
  const bodyAndSections = inner.split('|').map((p) => p.trim())
  if (bodyAndSections.length < 2) {
    return { type: 'text', content: `[list:${inner}]` }
  }

  const body = unquote(bodyAndSections[0])
  const rawSections = bodyAndSections.slice(1)

  const sections: Array<{ title: string; items: Array<{ id: string; title: string }> }> = []

  for (const raw of rawSections) {
    const sectionParts = raw.split('>')
    const sectionTitle = sectionParts.length > 1 ? sectionParts[0].trim() : 'Opcoes'
    const itemsStr = sectionParts.length > 1 ? sectionParts.slice(1).join('>') : sectionParts[0]
    const itemLabels = itemsStr
      .split(',')
      .map((i) => i.trim())
      .filter(Boolean)

    // Enforce max items per section — split into multiple sections if needed
    for (let i = 0; i < itemLabels.length; i += MAX_LIST_ITEMS_PER_SECTION) {
      const chunk = itemLabels.slice(i, i + MAX_LIST_ITEMS_PER_SECTION)
      const suffix = i > 0 ? ` (${Math.floor(i / MAX_LIST_ITEMS_PER_SECTION) + 1})` : ''
      sections.push({
        title: `${sectionTitle}${suffix}`,
        items: chunk.map((label) => ({ id: slugify(label), title: label })),
      })
    }
  }

  if (sections.length === 0) {
    return { type: 'text', content: `[list:${inner}]` }
  }

  return { type: 'list', body, sections }
}

function parseImage(inner: string): ImageBlock | TextBlock {
  // [image:"URL"|"caption"] or just [image:"URL"]
  const parts = inner.split('|').map((p) => p.trim())
  const url = unquote(parts[0])
  if (!url) {
    return { type: 'text', content: `[image:${inner}]` }
  }
  const caption = parts[1] ? unquote(parts[1]) : undefined
  return { type: 'image', url, ...(caption ? { caption } : {}) }
}

function parseAudio(inner: string): AudioBlock | TextBlock {
  // [audio:"URL"]
  const url = unquote(inner.trim())
  if (!url) {
    return { type: 'text', content: `[audio:${inner}]` }
  }
  return { type: 'audio', url }
}

function parseVideo(inner: string): VideoBlock | TextBlock {
  // [video:URL|caption]
  const parts = inner.split('|').map((p) => p.trim())
  const url = unquote(parts[0])
  if (!url) {
    return { type: 'text', content: `[video:${inner}]` }
  }
  const caption = parts[1] ? unquote(parts[1]) : undefined
  return { type: 'video', url, ...(caption ? { caption } : {}) }
}

function parseDocument(inner: string): DocumentBlock | TextBlock {
  // [document:URL|caption]
  const parts = inner.split('|').map((p) => p.trim())
  const url = unquote(parts[0])
  if (!url) {
    return { type: 'text', content: `[document:${inner}]` }
  }
  const caption = parts[1] ? unquote(parts[1]) : undefined
  return { type: 'document', url, ...(caption ? { caption } : {}) }
}

function parseLocation(inner: string): LocationBlock | TextBlock {
  // [location:lat,lng | Name | Address]
  const parts = inner.split('|').map((p) => p.trim())
  if (parts.length < 1) {
    return { type: 'text', content: `[location:${inner}]` }
  }

  const coords = parts[0].split(',').map((c) => c.trim())
  const latitude = parseFloat(coords[0])
  const longitude = parseFloat(coords[1])

  if (isNaN(latitude) || isNaN(longitude)) {
    return { type: 'text', content: `[location:${inner}]` }
  }

  const name = parts[1] ? parts[1].trim() : undefined
  const address = parts[2] ? parts[2].trim() : undefined

  return {
    type: 'location',
    latitude,
    longitude,
    ...(name ? { name } : {}),
    ...(address ? { address } : {}),
  }
}

function parseCta(inner: string): CtaBlock | TextBlock {
  // [cta:"body" | Button Text | https://url]
  const parts = inner.split('|').map((p) => p.trim())
  if (parts.length < 3) {
    return { type: 'text', content: `[cta:${inner}]` }
  }

  const body = unquote(parts[0])
  const buttonText = parts[1].trim()
  const url = parts[2].trim()

  if (!body || !buttonText || !url) {
    return { type: 'text', content: `[cta:${inner}]` }
  }

  return { type: 'cta', body, buttonText, url }
}

function parseTag(tagType: string, inner: string): MessageBlock {
  const normalizedType = tagType.toLowerCase()

  try {
    switch (normalizedType) {
      case 'buttons':
        return parseButtons(inner)
      case 'list':
        return parseList(inner)
      case 'image':
      case 'url da imagem':
        return parseImage(inner)
      case 'audio':
        return parseAudio(inner)
      case 'video':
        return parseVideo(inner)
      case 'document':
        return parseDocument(inner)
      case 'location':
        return parseLocation(inner)
      case 'cta':
        return parseCta(inner)
      default:
        // Fallback: treat as plain text
        return { type: 'text', content: `[${tagType}:${inner}]` }
    }
  } catch {
    // FALLBACK: malformed tag → plain text (never crash)
    return { type: 'text', content: `[${tagType}:${inner}]` }
  }
}

// ---------------------------------------------------------------------------
// Text Splitting
// ---------------------------------------------------------------------------

/**
 * Split a long text into chunks <= MAX_TEXT_BLOCK_LENGTH, respecting:
 * - Paragraph breaks (\n\n)
 * - List items (- or *)
 * - Never cut mid-sentence (split at last . or \n before limit)
 */
function splitTextIntoChunks(text: string): string[] {
  const trimmed = text.trim()
  if (!trimmed) return []
  if (trimmed.length <= MAX_TEXT_BLOCK_LENGTH) return [trimmed]

  const chunks: string[] = []
  let remaining = trimmed

  while (remaining.length > MAX_TEXT_BLOCK_LENGTH) {
    const slice = remaining.slice(0, MAX_TEXT_BLOCK_LENGTH)

    // Priority 1: paragraph break
    let splitIdx = slice.lastIndexOf('\n\n')

    // Priority 2: newline before a list item (- or *)
    if (splitIdx === -1) {
      const listMatch = slice.match(/\n(?=[-*] )/g)
      if (listMatch) {
        splitIdx = slice.lastIndexOf('\n')
        // Find the last newline that precedes a list item
        for (let i = slice.length - 1; i >= 0; i--) {
          if (
            slice[i] === '\n' &&
            i + 1 < slice.length &&
            (slice[i + 1] === '-' || slice[i + 1] === '*') &&
            i + 2 < slice.length &&
            slice[i + 2] === ' '
          ) {
            splitIdx = i
            break
          }
        }
      }
    }

    // Priority 3: last sentence-ending period followed by space or newline
    if (splitIdx === -1) {
      for (let i = slice.length - 1; i >= 0; i--) {
        if (slice[i] === '.' && (i + 1 >= slice.length || slice[i + 1] === ' ' || slice[i + 1] === '\n')) {
          splitIdx = i + 1 // include the period
          break
        }
      }
    }

    // Priority 4: last newline
    if (splitIdx === -1) {
      splitIdx = slice.lastIndexOf('\n')
    }

    // Priority 5: last space (avoid cutting mid-word)
    if (splitIdx === -1) {
      splitIdx = slice.lastIndexOf(' ')
    }

    // Worst case: hard cut at max length
    if (splitIdx <= 0) {
      splitIdx = MAX_TEXT_BLOCK_LENGTH
    }

    const chunk = remaining.slice(0, splitIdx).trim()
    if (chunk) chunks.push(chunk)
    remaining = remaining.slice(splitIdx).trim()
  }

  if (remaining.trim()) {
    chunks.push(remaining.trim())
  }

  return chunks
}

// ---------------------------------------------------------------------------
// Main: splitMessage
// ---------------------------------------------------------------------------

/**
 * Parse AI agent response text containing Format Tags into structured
 * MessageBlocks ready for WhatsApp/Instagram senders.
 *
 * Algorithm:
 * 1. EXTRACT — regex detects tags, replaces with placeholders {TAG_0}, {TAG_1}
 * 2. SPLIT — remaining text split into blocks <= 800 chars
 * 3. REINTEGRATE — placeholders replaced with parsed tag blocks
 */
export function splitMessage(text: string): MessageBlock[] {
  if (!text || typeof text !== 'string') return []

  // Step 1: Extract tags and replace with placeholders
  const tagMap = new Map<string, MessageBlock>()
  let tagIndex = 0

  const textWithPlaceholders = text.replace(TAG_REGEX, (_match, tagType: string, inner: string) => {
    const placeholder = `{TAG_${tagIndex}}`
    tagMap.set(placeholder, parseTag(tagType, inner))
    tagIndex++
    return placeholder
  })

  // Step 2: Split the text (with placeholders) into chunks
  const rawParts = textWithPlaceholders.split(/(\{TAG_\d+\})/)
  const blocks: MessageBlock[] = []

  for (const part of rawParts) {
    const trimmed = part.trim()
    if (!trimmed) continue

    // Step 3: Reintegrate — if it's a placeholder, use the parsed tag
    const tagBlock = tagMap.get(trimmed)
    if (tagBlock) {
      blocks.push(tagBlock)
      continue
    }

    // Check if text contains embedded placeholders (text around tags)
    if (/\{TAG_\d+\}/.test(trimmed)) {
      // Should not happen after split, but handle gracefully
      const subParts = trimmed.split(/(\{TAG_\d+\})/)
      for (const sub of subParts) {
        const subTrimmed = sub.trim()
        if (!subTrimmed) continue
        const subTag = tagMap.get(subTrimmed)
        if (subTag) {
          blocks.push(subTag)
        } else {
          const textChunks = splitTextIntoChunks(subTrimmed)
          for (const chunk of textChunks) {
            blocks.push({ type: 'text', content: chunk })
          }
        }
      }
    } else {
      // Plain text — split into chunks respecting the 800-char limit
      const textChunks = splitTextIntoChunks(trimmed)
      for (const chunk of textChunks) {
        blocks.push({ type: 'text', content: chunk })
      }
    }
  }

  return blocks
}
