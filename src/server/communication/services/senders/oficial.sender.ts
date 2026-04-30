import { markBotEcho } from '../bot-echo.service'
import type { MessageBlock } from '../message-splitter.service'
import type { SendResult, TypedSender } from './sender.interface'

const META_GRAPH_URL = 'https://graph.facebook.com/v21.0'

const FEATURES: Record<string, boolean> = {
  buttons: true,
  list: true,
  carousel: false,
  cta: true,
  flow: true,
}

interface MetaSendResponse {
  messaging_product: string
  contacts?: Array<{ wa_id: string }>
  messages?: Array<{ id: string }>
}

/**
 * Typed sender for Meta Cloud API (WhatsApp Business API + Instagram).
 *
 * Uses `fetch` directly against the Graph API.
 * `instanceId` is the phone_number_id (or IG account id).
 * `token` is the permanent system-user access token.
 */
export class OficialSender implements TypedSender {
  readonly name = 'oficial'

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private async post(phoneNumberId: string, token: string, body: Record<string, unknown>): Promise<MetaSendResponse> {
    const url = `${META_GRAPH_URL}/${phoneNumberId}/messages`
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    const data = (await res.json()) as MetaSendResponse & { error?: { message?: string } }

    if (!res.ok) {
      throw new Error(`Meta API [${res.status}]: ${data?.error?.message ?? JSON.stringify(data)}`)
    }

    return data
  }

  private extractMessageId(data: MetaSendResponse): string {
    return data?.messages?.[0]?.id ?? ''
  }

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
      const token = params.token ?? ''
      const data = await this.post(params.instanceId, token, {
        messaging_product: 'whatsapp',
        to: params.to,
        type: 'text',
        text: { body: params.text },
      })

      const messageId = this.extractMessageId(data)
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
      const token = params.token ?? ''
      const mediaPayload: Record<string, unknown> = { link: params.url }
      if (params.caption) mediaPayload.caption = params.caption
      if (params.fileName) mediaPayload.filename = params.fileName

      const data = await this.post(params.instanceId, token, {
        messaging_product: 'whatsapp',
        to: params.to,
        type: params.type,
        [params.type]: mediaPayload,
      })

      const messageId = this.extractMessageId(data)
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
      const token = params.token ?? ''
      const data = await this.post(params.instanceId, token, {
        messaging_product: 'whatsapp',
        to: params.to,
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text: params.body },
          action: {
            buttons: params.buttons.map((b) => ({
              type: 'reply',
              reply: { id: b.id, title: b.title },
            })),
          },
        },
      })

      const messageId = this.extractMessageId(data)
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
      const token = params.token ?? ''
      const data = await this.post(params.instanceId, token, {
        messaging_product: 'whatsapp',
        to: params.to,
        type: 'interactive',
        interactive: {
          type: 'list',
          body: { text: params.body },
          action: {
            button: params.buttonText ?? 'Ver opcoes',
            sections: params.sections.map((s) => ({
              title: s.title,
              rows: s.items.map((i) => ({ id: i.id, title: i.title })),
            })),
          },
        },
      })

      const messageId = this.extractMessageId(data)
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
      const token = params.token ?? ''
      const data = await this.post(params.instanceId, token, {
        messaging_product: 'whatsapp',
        to: params.to,
        type: 'location',
        location: {
          latitude: params.lat,
          longitude: params.lng,
          name: params.name ?? '',
          address: params.address ?? '',
        },
      })

      const messageId = this.extractMessageId(data)
      if (messageId) await markBotEcho(messageId)

      return { messageId, success: true }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      return { messageId: '', success: false, error: msg }
    }
  }

  /**
   * Send a CTA URL button (supported natively on Cloud API).
   */
  private async sendCta(params: {
    to: string
    instanceId: string
    body: string
    buttonText: string
    url: string
    token?: string
  }): Promise<SendResult> {
    try {
      const token = params.token ?? ''
      const data = await this.post(params.instanceId, token, {
        messaging_product: 'whatsapp',
        to: params.to,
        type: 'interactive',
        interactive: {
          type: 'cta_url',
          body: { text: params.body },
          action: {
            name: 'cta_url',
            parameters: {
              display_text: params.buttonText,
              url: params.url,
            },
          },
        },
      })

      const messageId = this.extractMessageId(data)
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
        return this.sendCta({ to, instanceId, body: block.body, buttonText: block.buttonText, url: block.url, token })

      default: {
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
