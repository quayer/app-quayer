/**
 * Configuração estática dos canais conectáveis pela página /canais:
 * metadados das 3 opções + specs dos campos de credenciais (Cloud / Instagram).
 * Mantido separado para enxugar channel-selector-modal.tsx (< 200 linhas).
 */

import { Instagram, MessageSquare, Phone } from 'lucide-react'

import type { ChannelOptionMeta } from './channel-options'
import type { ChannelCredentialField } from './channel-credential-form'

export const CHANNEL_OPTIONS: readonly ChannelOptionMeta[] = [
  {
    key: 'whatsapp_business',
    title: 'WhatsApp Business',
    description: 'Conexão direta via QR Code (UAZAPI). Ideal para começar rápido.',
    icon: MessageSquare,
  },
  {
    key: 'whatsapp_cloud',
    title: 'WhatsApp Cloud API',
    description: 'API oficial da Meta. Requer número verificado e tokens da WABA.',
    icon: Phone,
  },
  {
    key: 'instagram',
    title: 'Instagram Direct',
    description: 'Responde DMs do Instagram via API oficial da Meta.',
    icon: Instagram,
  },
] as const

export const WHATSAPP_CLOUD_FIELDS: readonly ChannelCredentialField[] = [
  {
    name: 'accessToken',
    label: 'Access Token',
    placeholder: 'EAAB...',
    secret: true,
    minLength: 20,
    hint: 'Token permanente da System User da Meta.',
  },
  {
    name: 'phoneNumberId',
    label: 'Phone Number ID',
    placeholder: '1099...',
    hint: 'ID do número no WhatsApp Manager.',
  },
  { name: 'wabaId', label: 'WABA ID', placeholder: '1023...' },
  {
    name: 'verifyToken',
    label: 'Verify Token',
    placeholder: 'string-secreta-do-webhook',
    hint: 'O mesmo valor configurado no webhook da Meta.',
  },
] as const

export const INSTAGRAM_FIELDS: readonly ChannelCredentialField[] = [
  { name: 'igAccountId', label: 'Instagram Account ID', placeholder: '17841...' },
  {
    name: 'pageAccessToken',
    label: 'Page Access Token',
    placeholder: 'EAAB...',
    secret: true,
    minLength: 20,
  },
  { name: 'appSecret', label: 'App Secret', placeholder: '32 caracteres', secret: true },
  {
    name: 'verifyToken',
    label: 'Verify Token',
    placeholder: 'string-secreta-do-webhook',
    hint: 'O mesmo valor configurado no webhook da Meta.',
  },
] as const
