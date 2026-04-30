import type { MessageBlock } from '../message-splitter.service'

export interface SendResult {
  messageId: string
  success: boolean
  error?: string
}

export interface TypedSender {
  readonly name: string
  sendText(params: { to: string; instanceId: string; text: string; token?: string }): Promise<SendResult>
  sendMedia(params: { to: string; instanceId: string; type: 'image' | 'audio' | 'video' | 'document'; url: string; caption?: string; fileName?: string; token?: string }): Promise<SendResult>
  sendButtons(params: { to: string; instanceId: string; body: string; buttons: Array<{ id: string; title: string }>; token?: string }): Promise<SendResult>
  sendList(params: { to: string; instanceId: string; body: string; sections: Array<{ title: string; items: Array<{ id: string; title: string }> }>; buttonText?: string; token?: string }): Promise<SendResult>
  sendLocation(params: { to: string; instanceId: string; lat: number; lng: number; name?: string; address?: string; token?: string }): Promise<SendResult>
  sendBlock(params: { to: string; instanceId: string; block: MessageBlock; token?: string }): Promise<SendResult>
  supportsFeature(feature: 'buttons' | 'list' | 'carousel' | 'cta' | 'flow'): boolean
}
