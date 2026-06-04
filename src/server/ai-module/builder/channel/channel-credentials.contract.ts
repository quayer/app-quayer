/**
 * Channel Credentials — Shared Contract
 *
 * Single source of truth for channel credential shapes consumed by parallel
 * implementers (routes, repository, frontend). This file ONLY defines:
 *   - Zod v3 schemas (validation)
 *   - inferred TS types
 *   - PURE mappers from validated credentials → Connection column objects
 *
 * It does NOT encrypt. Sensitive fields (access tokens, secrets) MUST be
 * treated as secrets and encrypted by the persistence layer (the route),
 * following the BYOK pattern in src/server/core/providers/providers.repository.ts
 * (lib/crypto encrypt/decrypt). Mappers here return PLAINTEXT shape only.
 *
 * Verified against prisma/schema.prisma (@@map "connections"):
 *   enum Channel  = WHATSAPP | INSTAGRAM | TELEGRAM | EMAIL
 *   enum Provider = WHATSAPP_WEB | WHATSAPP_CLOUD_API | WHATSAPP_BUSINESS_API
 *                 | INSTAGRAM_META | TELEGRAM_BOT | EMAIL_SMTP
 */

import { z } from 'zod'

// ==========================================
// ChannelKind — public discriminator
// ==========================================
export const CHANNEL_KINDS = ['whatsapp_business', 'whatsapp_cloud', 'instagram'] as const

export const channelKindSchema = z.enum(CHANNEL_KINDS)

/** 'whatsapp_business' | 'whatsapp_cloud' | 'instagram' */
export type ChannelKind = z.infer<typeof channelKindSchema>

// ==========================================
// Cloud API credentials (Meta WhatsApp Cloud / Business API)
// ==========================================
const requiredSecret = (label: string) =>
  z.string().trim().min(1, `${label} é obrigatório`)

export const cloudApiCredentialsSchema = z.object({
  /** System User Token — SECRET (encrypt before persisting). */
  accessToken: requiredSecret('accessToken'),
  /** Phone Number ID do Meta Business. */
  phoneNumberId: requiredSecret('phoneNumberId'),
  /** WhatsApp Business Account ID. */
  wabaId: requiredSecret('wabaId'),
  /** Verify token do webhook (Meta GET challenge) — SECRET. */
  verifyToken: requiredSecret('verifyToken'),
  /** Nome verificado da conta business (opcional, não secreto). */
  verifiedName: z.string().trim().min(1).optional(),
})

export type CloudApiCredentials = z.infer<typeof cloudApiCredentialsSchema>

// ==========================================
// Instagram credentials (Meta — manual)
// ==========================================
export const instagramCredentialsSchema = z.object({
  /** Instagram Business Account ID. */
  igAccountId: requiredSecret('igAccountId'),
  /** Page Access Token — SECRET (encrypt before persisting). */
  pageAccessToken: requiredSecret('pageAccessToken'),
  /** App Secret (valida assinatura X-Hub do webhook) — SECRET. */
  appSecret: requiredSecret('appSecret'),
  /** Verify token do webhook — SECRET. */
  verifyToken: requiredSecret('verifyToken'),
})

export type InstagramCredentials = z.infer<typeof instagramCredentialsSchema>

// ==========================================
// saveChannelCredentialsSchema — discriminated by 'kind'
// ==========================================
export const saveChannelCredentialsSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('whatsapp_business') }).merge(cloudApiCredentialsSchema),
  z.object({ kind: z.literal('whatsapp_cloud') }).merge(cloudApiCredentialsSchema),
  z.object({ kind: z.literal('instagram') }).merge(instagramCredentialsSchema),
])

export type SaveChannelCredentialsInput = z.infer<typeof saveChannelCredentialsSchema>

// ==========================================
// Connection column types (plaintext shape — route encrypts)
// ==========================================
/** Subset of Connection columns written for a Cloud API channel. */
export interface CloudApiConnectionData {
  provider: 'WHATSAPP_CLOUD_API' | 'WHATSAPP_BUSINESS_API'
  channel: 'WHATSAPP'
  cloudApiAccessToken: string
  cloudApiPhoneNumberId: string
  cloudApiWabaId: string
  cloudApiVerifyToken: string
  cloudApiVerifiedName: string | null
}

/** Subset of Connection columns written for an Instagram channel. */
export interface InstagramConnectionData {
  provider: 'INSTAGRAM_META'
  channel: 'INSTAGRAM'
  igAccountId: string
  igPageAccessToken: string
  igAppSecret: string
  igVerifyToken: string
}

export type ChannelConnectionData = CloudApiConnectionData | InstagramConnectionData

// ==========================================
// Pure mappers: validated credentials → Connection column object
// NOTE: returns PLAINTEXT. The route MUST encrypt secret fields
// (accessToken, verifyToken, pageAccessToken, appSecret) via lib/crypto.
// ==========================================

/** Maps Cloud API credentials → Connection columns. `business=true` => WHATSAPP_BUSINESS_API. */
export function toCloudApiConnectionData(
  creds: CloudApiCredentials,
  options?: { business?: boolean },
): CloudApiConnectionData {
  return {
    provider: options?.business ? 'WHATSAPP_BUSINESS_API' : 'WHATSAPP_CLOUD_API',
    channel: 'WHATSAPP',
    cloudApiAccessToken: creds.accessToken,
    cloudApiPhoneNumberId: creds.phoneNumberId,
    cloudApiWabaId: creds.wabaId,
    cloudApiVerifyToken: creds.verifyToken,
    cloudApiVerifiedName: creds.verifiedName ?? null,
  }
}

/** Maps Instagram credentials → Connection columns. */
export function toInstagramConnectionData(
  creds: InstagramCredentials,
): InstagramConnectionData {
  return {
    provider: 'INSTAGRAM_META',
    channel: 'INSTAGRAM',
    igAccountId: creds.igAccountId,
    igPageAccessToken: creds.pageAccessToken,
    igAppSecret: creds.appSecret,
    igVerifyToken: creds.verifyToken,
  }
}

/**
 * Dispatch mapper over the discriminated input.
 * Picks the correct provider/columns from `kind` alone — no extra options.
 */
export function toConnectionData(
  input: SaveChannelCredentialsInput,
): ChannelConnectionData {
  switch (input.kind) {
    case 'whatsapp_business':
      return toCloudApiConnectionData(input, { business: true })
    case 'whatsapp_cloud':
      return toCloudApiConnectionData(input, { business: false })
    case 'instagram':
      return toInstagramConnectionData(input)
  }
}

/** Names of secret fields per kind — implementers encrypt these before persist. */
export const SECRET_FIELDS: Record<ChannelKind, readonly string[]> = {
  whatsapp_business: ['accessToken', 'verifyToken'],
  whatsapp_cloud: ['accessToken', 'verifyToken'],
  instagram: ['pageAccessToken', 'appSecret', 'verifyToken'],
}
