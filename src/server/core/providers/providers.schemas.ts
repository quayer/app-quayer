/**
 * Providers — Zod schemas for BYOK (Bring Your Own Key) endpoints.
 */

import { z } from 'zod'

export const SUPPORTED_PROVIDERS = ['openai', 'anthropic', 'google'] as const
export type SupportedProvider = (typeof SUPPORTED_PROVIDERS)[number]

export const providerParamSchema = z.object({
  provider: z.enum(SUPPORTED_PROVIDERS),
})

export const upsertProviderBodySchema = z.object({
  apiKey: z
    .string()
    .min(16, 'API key must be at least 16 characters')
    .max(512, 'API key too long'),
  config: z.record(z.unknown()).optional(),
})

export type UpsertProviderBody = z.infer<typeof upsertProviderBodySchema>

// Shape returned to the client — never includes the raw apiKey.
export interface ProviderListItem {
  provider: SupportedProvider
  isConfigured: boolean
  lastFour: string | null
  updatedAt: string | null
}
