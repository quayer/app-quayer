/**
 * API Keys Schemas
 *
 * Zod schemas for API key validation
 */

import { z } from 'zod'

// Available scopes for API keys
export const API_KEY_SCOPES = [
  'read',           // Read-only access
  'write',          // Create/update access
  'delete',         // Delete access
  'admin',          // Full admin access
  'instances:read', // Read instances
  'instances:write',// Manage instances
  'messages:read',  // Read messages
  'messages:write', // Send messages
  'contacts:read',  // Read contacts
  'contacts:write', // Manage contacts
  'webhooks:manage',// Manage webhooks
  'sessions:read',  // Read chat sessions
  'sessions:write', // Manage chat sessions
] as const

export type ApiKeyScope = typeof API_KEY_SCOPES[number]

// Expiration options
export const EXPIRATION_OPTIONS = [
  { value: 'never', label: 'Nunca expira', days: null },
  { value: '30d', label: '30 dias', days: 30 },
  { value: '60d', label: '60 dias', days: 60 },
  { value: '90d', label: '90 dias', days: 90 },
  { value: '180d', label: '6 meses', days: 180 },
  { value: '365d', label: '1 ano', days: 365 },
] as const

// Create API key schema
export const createApiKeySchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório').max(100, 'Nome muito longo'),
  scopes: z.array(z.enum(API_KEY_SCOPES as unknown as [string, ...string[]])).default(['read', 'write']),
  expiration: z.enum(['never', '30d', '60d', '90d', '180d', '365d']).default('never'),
  organizationId: z.string().uuid().optional(), // Admin can specify org
})

// Update API key schema
export const updateApiKeySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  scopes: z.array(z.enum(API_KEY_SCOPES as unknown as [string, ...string[]])).optional(),
})

// API key response (safe to send to client - no hash)
export const apiKeyResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  prefix: z.string(),
  scopes: z.array(z.string()),
  expiresAt: z.date().nullable(),
  lastUsedAt: z.date().nullable(),
  lastUsedIp: z.string().nullable(),
  usageCount: z.number(),
  isActive: z.boolean(),
  createdAt: z.date(),
})

// API key with full key (only returned on creation)
export const apiKeyWithKeySchema = apiKeyResponseSchema.extend({
  key: z.string(), // Full key - only shown once
})

export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>
export type UpdateApiKeyInput = z.infer<typeof updateApiKeySchema>
export type ApiKeyResponse = z.infer<typeof apiKeyResponseSchema>
export type ApiKeyWithKey = z.infer<typeof apiKeyWithKeySchema>
