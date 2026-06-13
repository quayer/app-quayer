/**
 * outbound-blocks — construção de blocos de saída a partir do agentText e o
 * roteamento de cada bloco para o sender UAZapi correto (texto/mídia/tags ricas).
 *
 * Extraído de outbound.service.ts para respeitar FILE_SIZE_GUIDELINES (≤500
 * linhas/service). A orquestração (claim/checkpoint durável, rate-limit, retry,
 * persistência) permanece em outbound.service.ts; aqui vive apenas a montagem e
 * o envio individual de um bloco — funções puras de mapeamento + I/O do sender.
 */

import { parseTags, type ParsedTag } from './tag-parser.service'
import { splitMessage, type MessageBlock } from './message-splitter.service'
import type { SendResult, SendOptions } from './uazapi-sender.service'
import { synthesizeTtsToMediaUrl } from './tts.service'
import type { AgentRuntimeSettings } from '@/lib/agent-runtime-settings'
import type { OutboundSender } from './outbound.types'

/**
 * Constrói os blocos de saída a partir do texto do agente: parseia tags ricas
 * (botões/mídia/lista/carrossel) e quebra o texto puro em parágrafos ≤ maxChars.
 * O índice 0 sempre tem delay_ms=0 (primeira mensagem sai imediatamente).
 */
export function buildOutboundBlocks(text: string, maxChars: number): MessageBlock[] {
  const parsed = parseTags(text)
  if (parsed.tagsFound.length === 0) {
    return splitMessage(text, { maxChars })
  }

  const blocks: MessageBlock[] = []
  const parts = parsed.textWithPlaceholders.split(/(__TAG_\d+__)/g)

  for (const part of parts) {
    if (!part) continue

    const placeholder = /^__TAG_(\d+)__$/.exec(part)
    if (placeholder) {
      const tag = parsed.tagsFound[Number(placeholder[1])]
      if (tag) blocks.push(blockFromTag(tag, blocks.length))
      continue
    }

    blocks.push(
      ...splitMessage(part, { maxChars }).map((block) => ({
        ...block,
        index: blocks.length + block.index,
      })),
    )
  }

  return blocks.map((block, index) => ({
    ...block,
    index,
    delay_ms: index === 0 ? 0 : block.delay_ms,
  }))
}

function blockFromTag(tag: ParsedTag, index: number): MessageBlock {
  return {
    type: tag.type,
    content: tag.content ?? tag.caption ?? tag.raw,
    url: tag.url,
    caption: tag.caption,
    index,
    delay_ms: index === 0 ? 0 : undefined,
    buttons: tag.buttons,
    list: tag.list,
    location: tag.location,
    flow: tag.flow,
    carousel: tag.carousel,
    cta_url: tag.cta_url,
  }
}

/**
 * Envia UM bloco via o sender apropriado para o tipo. Tags ricas sem método
 * específico no sender (ou sem dado) caem no fallback de texto legível. Bloco
 * de texto com TTS habilitado tenta sintetizar áudio (fail-open → texto).
 */
export async function sendBlock(
  sender: OutboundSender,
  token: string,
  baseUrl: string,
  recipient: string,
  block: MessageBlock,
  organizationId: string,
  tts?: AgentRuntimeSettings['tts'],
): Promise<SendResult> {
  const options = { delayMs: block.delay_ms }

  switch (block.type) {
    case 'text':
      if (tts?.enabled && sender.sendAudio) {
        try {
          const audioUrl = await synthesizeTtsToMediaUrl({
            organizationId,
            text: block.content,
            settings: tts,
          })
          if (audioUrl) {
            return sender.sendAudio(token, baseUrl, recipient, audioUrl, options)
          }
        } catch (err) {
          console.warn(
            '[outbound] TTS failed, falling back to text:',
            err instanceof Error ? err.message : String(err),
          )
        }
      }
      return sender.sendText(token, baseUrl, recipient, block.content, options)
    case 'image':
      if (sender.sendImage && block.url) {
        return sender.sendImage(token, baseUrl, recipient, block.url, block.caption, options)
      }
      return sendFallbackText(sender, token, baseUrl, recipient, block, options)
    case 'audio':
      if (sender.sendAudio && block.url) {
        return sender.sendAudio(token, baseUrl, recipient, block.url, options)
      }
      return sendFallbackText(sender, token, baseUrl, recipient, block, options)
    case 'document':
      if (sender.sendDocument && block.url) {
        return sender.sendDocument(token, baseUrl, recipient, block.url, block.caption, options)
      }
      return sendFallbackText(sender, token, baseUrl, recipient, block, options)
    case 'video':
      if (sender.sendVideo && block.url) {
        return sender.sendVideo(token, baseUrl, recipient, block.url, block.caption, options)
      }
      return sendFallbackText(sender, token, baseUrl, recipient, block, options)
    case 'location':
      if (sender.sendLocation && block.location) {
        return sender.sendLocation(token, baseUrl, recipient, block.location, options)
      }
      return sendFallbackText(sender, token, baseUrl, recipient, block, options)
    case 'buttons':
      if (sender.sendButtons && block.buttons?.length) {
        return sender.sendButtons(
          token,
          baseUrl,
          recipient,
          { text: block.content, buttons: block.buttons },
          options,
        )
      }
      return sendFallbackText(sender, token, baseUrl, recipient, block, options)
    case 'list':
      if (sender.sendList && block.list?.sections.length) {
        return sender.sendList(
          token,
          baseUrl,
          recipient,
          { text: block.content, button: block.list.button, sections: block.list.sections },
          options,
        )
      }
      return sendFallbackText(sender, token, baseUrl, recipient, block, options)
    case 'carousel':
      if (sender.sendCarousel && block.carousel?.cards.length) {
        return sender.sendCarousel(
          token,
          baseUrl,
          recipient,
          { text: block.content, cards: block.carousel.cards },
          options,
        )
      }
      return sendFallbackText(sender, token, baseUrl, recipient, block, options)
    case 'cta_url':
    case 'flow':
      return sendFallbackText(sender, token, baseUrl, recipient, block, options)
    default:
      return sendFallbackText(sender, token, baseUrl, recipient, block, options)
  }
}

function sendFallbackText(
  sender: OutboundSender,
  token: string,
  baseUrl: string,
  recipient: string,
  block: MessageBlock,
  options: SendOptions,
): Promise<SendResult> {
  return sender.sendText(token, baseUrl, recipient, fallbackTextForBlock(block), options)
}

function fallbackTextForBlock(block: MessageBlock): string {
  if (block.type === 'cta_url' && block.cta_url) {
    return [block.content, `${block.cta_url.display_text}: ${block.cta_url.url}`]
      .filter(Boolean)
      .join('\n')
  }
  if (block.type === 'flow' && block.flow) {
    const flowLabel = block.flow.flow_name ?? block.flow.flow_id
    return [block.flow.flow_cta, flowLabel ? `Formulario: ${flowLabel}` : 'Formulario']
      .filter(Boolean)
      .join('\n')
  }
  if (block.type === 'location' && block.location) {
    const { latitude, longitude, name, address } = block.location
    return [name, address, `https://maps.google.com/?q=${latitude},${longitude}`]
      .filter(Boolean)
      .join('\n')
  }
  if (block.url) {
    return [block.caption ?? block.content, block.url].filter(Boolean).join('\n')
  }
  if (block.buttons?.length) {
    return [block.content, ...block.buttons.map((button) => `- ${button.title}`)]
      .filter(Boolean)
      .join('\n')
  }
  if (block.list?.sections.length) {
    const rows = block.list.sections.flatMap((section) => [
      section.title,
      ...section.rows.map((row) => `- ${row.title}`),
    ])
    return [block.content, ...rows].filter(Boolean).join('\n')
  }
  if (block.carousel?.cards.length) {
    const cards = block.carousel.cards.map((card) =>
      [card.body, card.button_url ?? card.header_url].filter(Boolean).join(' - '),
    )
    return [block.content, ...cards].filter(Boolean).join('\n')
  }
  return block.content
}
