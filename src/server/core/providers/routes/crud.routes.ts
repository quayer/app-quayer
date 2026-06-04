/**
 * Providers — CRUD routes (BYOK).
 *
 * GET    /providers           → list configured providers for current org
 * PATCH  /providers/:provider → upsert key (encrypts before save)
 * DELETE /providers/:provider → remove key (org falls back to env)
 */

import { z } from 'zod'
import { igniter } from '@/igniter'
import { authProcedure } from '@/server/core/auth/procedures/auth.procedure'
import { providersRepository } from '../providers.repository'
import {
  upsertProviderBodySchema,
  SUPPORTED_PROVIDERS,
  type SupportedProvider,
} from '../providers.schemas'

const createKeyBodySchema = z.object({
  apiKey: z.string().min(8),
  name: z.string().min(1).max(60),
})

function orgOf(user: unknown): string | null {
  return (user as { currentOrgId?: string | null })?.currentOrgId ?? null
}

export const providersCrudRoutes = {
  // ──────────────────────────────────────────────────────────────────────
  // GET /providers
  // ──────────────────────────────────────────────────────────────────────
  listProviders: igniter.query({
    name: 'List Providers',
    description: 'Return BYOK configuration status for all supported AI providers',
    path: '/',
    method: 'GET',
    use: [authProcedure({ required: true })],
    handler: async ({ context, response }) => {
      const user = context.auth?.session?.user
      if (!user) return response.unauthorized('Not authenticated')

      const orgId = (user as { currentOrgId?: string | null }).currentOrgId
      if (!orgId) return response.badRequest('No active organization')

      const items = await providersRepository.list(orgId)
      return response.success(items)
    },
  }),

  // ──────────────────────────────────────────────────────────────────────
  // PATCH /providers/:provider
  // ──────────────────────────────────────────────────────────────────────
  upsertProvider: igniter.mutation({
    name: 'Upsert Provider',
    description: 'Store (or replace) an API key for the given AI provider',
    path: '/:provider',
    method: 'PATCH',
    use: [authProcedure({ required: true })],
    body: upsertProviderBodySchema,
    handler: async ({ request, context, response }) => {
      const user = context.auth?.session?.user
      if (!user) return response.unauthorized('Not authenticated')

      const orgId = (user as { currentOrgId?: string | null }).currentOrgId
      if (!orgId) return response.badRequest('No active organization')

      const { provider } = request.params as { provider: string }
      if (!(SUPPORTED_PROVIDERS as readonly string[]).includes(provider)) {
        return response.badRequest(`Unsupported provider: ${provider}`)
      }

      const { apiKey, config } = request.body
      const item = await providersRepository.upsert(
        orgId,
        provider as SupportedProvider,
        apiKey,
        config,
      )
      return response.success(item)
    },
  }),

  // ──────────────────────────────────────────────────────────────────────
  // DELETE /providers/:provider
  // ──────────────────────────────────────────────────────────────────────
  deleteProvider: igniter.mutation({
    name: 'Delete Provider',
    description: 'Remove a stored API key so the org falls back to the env-level key',
    path: '/:provider',
    method: 'DELETE',
    use: [authProcedure({ required: true })],
    handler: async ({ request, context, response }) => {
      const user = context.auth?.session?.user
      if (!user) return response.unauthorized('Not authenticated')

      const orgId = (user as { currentOrgId?: string | null }).currentOrgId
      if (!orgId) return response.badRequest('No active organization')

      const { provider } = request.params as { provider: string }
      if (!(SUPPORTED_PROVIDERS as readonly string[]).includes(provider)) {
        return response.badRequest(`Unsupported provider: ${provider}`)
      }

      const deleted = await providersRepository.remove(orgId, provider as SupportedProvider)
      if (!deleted) return response.notFound('Provider not configured')

      return response.success({ success: true })
    },
  }),

  // ── Multi-key (BYOK por agente) ─────────────────────────────────────────────

  // GET /providers/:provider/keys — lista todas as chaves rotuladas do provider
  listProviderKeys: igniter.query({
    name: 'List Provider Keys',
    description: 'Lista todas as chaves BYOK (rotuladas) de um provider para a org',
    path: '/:provider/keys',
    method: 'GET',
    use: [authProcedure({ required: true })],
    handler: async ({ request, context, response }) => {
      const user = context.auth?.session?.user
      if (!user) return response.unauthorized('Not authenticated')
      const orgId = orgOf(user)
      if (!orgId) return response.badRequest('No active organization')

      const { provider } = request.params as { provider: string }
      if (!(SUPPORTED_PROVIDERS as readonly string[]).includes(provider)) {
        return response.badRequest(`Unsupported provider: ${provider}`)
      }
      const keys = await providersRepository.listKeys(orgId, provider as SupportedProvider)
      return response.success(keys)
    },
  }),

  // POST /providers/:provider/keys — cria uma nova chave rotulada (não sobrescreve)
  createProviderKey: igniter.mutation({
    name: 'Create Provider Key',
    description: 'Cria uma nova chave BYOK rotulada para o provider (múltiplas chaves)',
    path: '/:provider/keys',
    method: 'POST',
    use: [authProcedure({ required: true })],
    body: createKeyBodySchema,
    handler: async ({ request, context, response }) => {
      const user = context.auth?.session?.user
      if (!user) return response.unauthorized('Not authenticated')
      const orgId = orgOf(user)
      if (!orgId) return response.badRequest('No active organization')

      const { provider } = request.params as { provider: string }
      if (!(SUPPORTED_PROVIDERS as readonly string[]).includes(provider)) {
        return response.badRequest(`Unsupported provider: ${provider}`)
      }
      const { apiKey, name } = request.body
      const key = await providersRepository.createKey(
        orgId,
        provider as SupportedProvider,
        apiKey,
        name,
      )
      return response.success(key)
    },
  }),

  // DELETE /providers/keys/:id — remove uma chave específica por id
  deleteProviderKey: igniter.mutation({
    name: 'Delete Provider Key',
    description: 'Remove uma chave BYOK específica por id (org-scoped)',
    path: '/keys/:id',
    method: 'DELETE',
    use: [authProcedure({ required: true })],
    handler: async ({ request, context, response }) => {
      const user = context.auth?.session?.user
      if (!user) return response.unauthorized('Not authenticated')
      const orgId = orgOf(user)
      if (!orgId) return response.badRequest('No active organization')

      const { id } = request.params as { id: string }
      const deleted = await providersRepository.deleteKeyById(orgId, id)
      if (!deleted) return response.notFound('Key not found')
      return response.success({ success: true })
    },
  }),
}
