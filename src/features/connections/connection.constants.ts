/**
 * Connection Constants
 *
 * Design system para o módulo de conexões:
 * - Ícones de providers e channels
 * - Cores e badges
 * - Labels e metadados
 * - Configurações padrão
 */

import {
  MessageCircle,
  Instagram,
  Send,
  Mail,
  Smartphone,
  Cloud,
  Building2,
  Wifi,
  type LucideIcon,
} from 'lucide-react'

/**
 * Tipos
 */
export type Channel = 'WHATSAPP' | 'INSTAGRAM' | 'TELEGRAM' | 'EMAIL'
export type Provider =
  | 'WHATSAPP_WEB'
  | 'WHATSAPP_CLOUD_API'
  | 'WHATSAPP_BUSINESS_API'
  | 'INSTAGRAM_META'
  | 'TELEGRAM_BOT'
  | 'EMAIL_SMTP'
export type ConnectionStatus =
  | 'PENDING'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'DISCONNECTED'
  | 'ERROR'

/**
 * Channel Metadata
 */
export const CHANNEL_METADATA: Record<
  Channel,
  {
    label: string
    description: string
    icon: LucideIcon
    color: string
    bgColor: string
    borderColor: string
    available: boolean
  }
> = {
  WHATSAPP: {
    label: 'WhatsApp',
    description: 'Mensageria instantânea mais popular do Brasil',
    icon: MessageCircle,
    color: 'text-green-600',
    bgColor: 'bg-green-50',
    borderColor: 'border-green-200',
    available: true,
  },
  INSTAGRAM: {
    label: 'Instagram',
    description: 'Direct messages do Instagram',
    icon: Instagram,
    color: 'text-pink-600',
    bgColor: 'bg-pink-50',
    borderColor: 'border-pink-200',
    available: false, // Em breve
  },
  TELEGRAM: {
    label: 'Telegram',
    description: 'Mensageria segura e rápida',
    icon: Send,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    available: false, // Em breve
  },
  EMAIL: {
    label: 'Email',
    description: 'Email tradicional via SMTP',
    icon: Mail,
    color: 'text-gray-600',
    bgColor: 'bg-gray-50',
    borderColor: 'border-gray-200',
    available: false, // Em breve
  },
}

/**
 * Provider Metadata
 */
export const PROVIDER_METADATA: Record<
  Provider,
  {
    label: string
    description: string
    icon: LucideIcon
    channel: Channel
    color: string
    bgColor: string
    features: {
      qrCode: boolean
      templates: boolean
      media: boolean
      interactive: boolean
      businessHours: boolean
    }
    limitations?: {
      messagesPerDay?: number
      sessionsLimit?: number
      requiresApproval?: boolean
    }
    available: boolean
  }
> = {
  WHATSAPP_WEB: {
    label: 'WhatsApp Web',
    description: 'Conexão via QR Code (gratuito, ilimitado)',
    icon: Smartphone,
    channel: 'WHATSAPP',
    color: 'text-green-600',
    bgColor: 'bg-green-50',
    features: {
      qrCode: true,
      templates: false,
      media: true,
      interactive: true,
      businessHours: false,
    },
    limitations: {
      messagesPerDay: undefined, // Ilimitado (mas pode ser banido se spam)
      sessionsLimit: 1, // Uma conexão por número
    },
    available: true,
  },
  WHATSAPP_CLOUD_API: {
    label: 'WhatsApp Cloud API',
    description: 'API oficial do Meta (pago, escalável)',
    icon: Cloud,
    channel: 'WHATSAPP',
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    features: {
      qrCode: false,
      templates: true,
      media: true,
      interactive: true,
      businessHours: true,
    },
    limitations: {
      messagesPerDay: 1000, // Limite inicial (aumenta com uso)
      requiresApproval: true,
    },
    available: false, // Em breve
  },
  WHATSAPP_BUSINESS_API: {
    label: 'WhatsApp Business API',
    description: 'API oficial via parceiros (pago, enterprise)',
    icon: Building2,
    channel: 'WHATSAPP',
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
    features: {
      qrCode: false,
      templates: true,
      media: true,
      interactive: true,
      businessHours: true,
    },
    limitations: {
      requiresApproval: true,
    },
    available: false, // Em breve
  },
  INSTAGRAM_META: {
    label: 'Instagram (Meta)',
    description: 'Direct messages via Meta API',
    icon: Instagram,
    channel: 'INSTAGRAM',
    color: 'text-pink-600',
    bgColor: 'bg-pink-50',
    features: {
      qrCode: false,
      templates: true,
      media: true,
      interactive: true,
      businessHours: false,
    },
    available: false, // Em breve
  },
  TELEGRAM_BOT: {
    label: 'Telegram Bot',
    description: 'Bot do Telegram (gratuito, ilimitado)',
    icon: Send,
    channel: 'TELEGRAM',
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    features: {
      qrCode: false,
      templates: false,
      media: true,
      interactive: true,
      businessHours: false,
    },
    available: false, // Em breve
  },
  EMAIL_SMTP: {
    label: 'Email SMTP',
    description: 'Email tradicional via servidor SMTP',
    icon: Mail,
    channel: 'EMAIL',
    color: 'text-gray-600',
    bgColor: 'bg-gray-50',
    features: {
      qrCode: false,
      templates: true,
      media: true,
      interactive: false,
      businessHours: false,
    },
    available: false, // Em breve
  },
}

/**
 * Status Metadata
 */
export const STATUS_METADATA: Record<
  ConnectionStatus,
  {
    label: string
    description: string
    color: string
    bgColor: string
    borderColor: string
    textColor: string
    icon: 'pending' | 'connecting' | 'connected' | 'disconnected' | 'error'
  }
> = {
  PENDING: {
    label: 'Pendente',
    description: 'Conexão criada, aguardando configuração',
    color: 'gray',
    bgColor: 'bg-gray-100',
    borderColor: 'border-gray-300',
    textColor: 'text-gray-700',
    icon: 'pending',
  },
  CONNECTING: {
    label: 'Conectando',
    description: 'Aguardando QR Code ou autenticação',
    color: 'yellow',
    bgColor: 'bg-yellow-100',
    borderColor: 'border-yellow-300',
    textColor: 'text-yellow-700',
    icon: 'connecting',
  },
  CONNECTED: {
    label: 'Conectado',
    description: 'Conexão ativa e funcionando',
    color: 'green',
    bgColor: 'bg-green-100',
    borderColor: 'border-green-300',
    textColor: 'text-green-700',
    icon: 'connected',
  },
  DISCONNECTED: {
    label: 'Desconectado',
    description: 'Conexão desativada ou desconectada',
    color: 'gray',
    bgColor: 'bg-gray-100',
    borderColor: 'border-gray-300',
    textColor: 'text-gray-700',
    icon: 'disconnected',
  },
  ERROR: {
    label: 'Erro',
    description: 'Problema na conexão',
    color: 'red',
    bgColor: 'bg-red-100',
    borderColor: 'border-red-300',
    textColor: 'text-red-700',
    icon: 'error',
  },
}

/**
 * Helpers
 */
export function getChannelMetadata(channel: Channel) {
  return CHANNEL_METADATA[channel]
}

export function getProviderMetadata(provider: Provider) {
  return PROVIDER_METADATA[provider]
}

export function getStatusMetadata(status: ConnectionStatus) {
  return STATUS_METADATA[status]
}

export function getAvailableProviders(): Provider[] {
  return Object.entries(PROVIDER_METADATA)
    .filter(([_, meta]) => meta.available)
    .map(([provider]) => provider as Provider)
}

export function getProvidersByChannel(channel: Channel): Provider[] {
  return Object.entries(PROVIDER_METADATA)
    .filter(([_, meta]) => meta.channel === channel)
    .map(([provider]) => provider as Provider)
}

/**
 * Validações
 */
export function isProviderAvailable(provider: Provider): boolean {
  return PROVIDER_METADATA[provider]?.available ?? false
}

export function isChannelAvailable(channel: Channel): boolean {
  return CHANNEL_METADATA[channel]?.available ?? false
}

export function requiresQRCode(provider: Provider): boolean {
  return PROVIDER_METADATA[provider]?.features.qrCode ?? false
}

export function supportsTemplates(provider: Provider): boolean {
  return PROVIDER_METADATA[provider]?.features.templates ?? false
}

export function supportsInteractive(provider: Provider): boolean {
  return PROVIDER_METADATA[provider]?.features.interactive ?? false
}
