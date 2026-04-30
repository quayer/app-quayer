import { uazService } from '@/lib/uaz/uaz.service'
import { markBotEcho } from '../bot-echo.service'
import type { MessageBlock } from '../message-splitter.service'
import type { SendResult, TypedSender } from './sender.interface'

const FEATURES: Record<string, boolean> = {
  buttons: true,
  list: true,
  carousel: true,
  cta: false,
  flow: false,
}

/**
 * Typed sender for UAZAPI broker (unofficial WhatsApp API).
 *
 * Wraps `UAZService` methods, adds typing-indicator delay and bot-echo marking.
 */
export class UazapiSender implements TypedSender {
  readonly name = 'uazapi'

  // ---------------------------------------------------------------------------
  // Typing indicator — simulates human-like delay before each message
  // ---------------------------------------------------------------------------

  private async typingDelay(block: MessageBlock): Promise<void> {
    const length =
      (block.type === 'text' ? block.content?.length : undefined) ??
      ('body' in block ? (block as { body?: string }).body?.length : undefined) ??
      50
    const ms = Math.min(length, 200) * 50
    await new Promise<void>((r) => setTimeout(r, ms))
  }

  // ---------------------------------------------------------------------------
  // Primitive senders
  // ---------------------------------------------------------------------------

  async sendText(params: {
    to: string
    instanceId: string
    text: string
    token?: string
  }): Promise<SendResult> {
    try {
      const token = params.token ?? params.instanceId
      const res = (await uazService.sendText(token, {
        number: params.to,
        text: params.text,
      })) as { key?: { id?: string }; messageId?: string }

      const messageId = res?.key?.id ?? res?.messageId ?? ''
      if (messageId) await markBotEcho(messageId)

      return { messageId, success: true }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      return { messageId: '', success: false, error: msg }
    }
  }

  async sendMedia(params: {
    to: string
    instanceId: string
    type: 'image' | 'audio' | 'video' | 'document'
    url: string
    caption?: string
    fileName?: string
    token?: string
  }): Promise<SendResult> {
    try {
      const token = params.token ?? params.instanceId
      const mimeMap: Record<string, string> = {
        image: 'image/jpeg',
        audio: 'audio/mpeg',
        video: 'video/mp4',
        document: 'application/pdf',
      }

      const res = (await uazService.sendMedia(token, {
        number: params.to,
        mediatype: params.type,
        mimetype: mimeMap[params.type] ?? 'application/octet-stream',
        media: params.url,
        caption: params.caption,
        fileName: params.fileName,
      })) as { key?: { id?: string }; messageId?: string }

      const messageId = res?.key?.id ?? res?.messageId ?? ''
      if (messageId) await markBotEcho(messageId)

      return { messageId, success: true }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      return { messageId: '', success: false, error: msg }
    }
  }

  async sendButtons(params: {
    to: string
    instanceId: string
    body: string
    buttons: Array<{ id: string; title: string }>
    token?: string
  }): Promise<SendResult> {
    try {
      const token = params.token ?? params.instanceId
      const res = (await uazService.sendButtons(token, {
        number: params.to,
        text: params.body,
        buttons: params.buttons.map((b) => ({ id: b.id, text: b.title })),
      })) as { key?: { id?: string }; messageId?: string }

      const messageId = res?.key?.id ?? res?.messageId ?? ''
      if (messageId) await markBotEcho(messageId)

      return { messageId, success: true }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      return { messageId: '', success: false, error: msg }
    }
  }

  async sendList(params: {
    to: string
    instanceId: string
    body: string
    sections: Array<{ title: string; items: Array<{ id: string; title: string }> }>
    buttonText?: string
    token?: string
  }): Promise<SendResult> {
    try {
      const token = params.token ?? params.instanceId
      const res = (await uazService.sendList(token, {
        number: params.to,
        title: '',
        buttonText: params.buttonText ?? 'Ver opcoes',
        sections: params.sections.map((s) => ({
          title: s.title,
          rows: s.items.map((i) => ({ id: i.id, title: i.title })),
        })),
        description: params.body,
      })) as { key?: { id?: string }; messageId?: string }

      const messageId = res?.key?.id ?? res?.messageId ?? ''
      if (messageId) await markBotEcho(messageId)

      return { messageId, success: true }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      return { messageId: '', success: false, error: msg }
    }
  }

  async sendLocation(params: {
    to: string
    instanceId: string
    lat: number
    lng: number
    name?: string
    address?: string
    token?: string
  }): Promise<SendResult> {
    try {
      const token = params.token ?? params.instanceId
      const res = (await uazService.sendLocation(token, {
        number: params.to,
        latitude: params.lat,
        longitude: params.lng,
        name: params.name,
        address: params.address,
      })) as { key?: { id?: string }; messageId?: string }

      const messageId = res?.key?.id ?? res?.messageId ?? ''
      if (messageId) await markBotEcho(messageId)

      return { messageId, success: true }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      return { messageId: '', success: false, error: msg }
    }
  }

  // ---------------------------------------------------------------------------
  // Block dispatcher
  // ---------------------------------------------------------------------------

  async sendBlock(params: {
    to: string
    instanceId: string
    block: MessageBlock
    token?: string
  }): Promise<SendResult> {
    const { to, instanceId, block, token } = params

    // Typing indicator delay
    await this.typingDelay(block)

    switch (block.type) {
      case 'text':
        return this.sendText({ to, instanceId, text: block.content, token })

      case 'image':
        return this.sendMedia({ to, instanceId, type: 'image', url: block.url, caption: block.caption, token })

      case 'audio':
        return this.sendMedia({ to, instanceId, type: 'audio', url: block.url, token })

      case 'video':
        return this.sendMedia({ to, instanceId, type: 'video', url: block.url, caption: block.caption, token })

      case 'document':
        return this.sendMedia({ to, instanceId, type: 'document', url: block.url, caption: block.caption, token })

      case 'buttons':
        return this.sendButtons({ to, instanceId, body: block.body, buttons: block.buttons, token })

      case 'list':
        return this.sendList({ to, instanceId, body: block.body, sections: block.sections, token })

      case 'location':
        return this.sendLocation({ to, instanceId, lat: block.latitude, lng: block.longitude, name: block.name, address: block.address, token })

      case 'cta':
        // UAZAPI doesn't support CTA natively — fallback to text with URL
        return this.sendText({ to, instanceId, text: `${block.body}\n\n${block.buttonText}: ${block.url}`, token })

      default: {
        // Exhaustive — should never happen
        const _exhaustive: never = block
        return { messageId: '', success: false, error: `Unsupported block type: ${(_exhaustive as MessageBlock).type}` }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Feature support
  // ---------------------------------------------------------------------------

  supportsFeature(feature: 'buttons' | 'list' | 'carousel' | 'cta' | 'flow'): boolean {
    return FEATURES[feature] ?? false
  }
}
