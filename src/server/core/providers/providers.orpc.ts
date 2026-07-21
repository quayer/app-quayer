/**
 * Providers (BYOK) — porta mecânica do controller para oRPC (Igniter -> oRPC).
 *
 * Origem: ./routes/crud.routes.ts (6 actions), controller ./providers.controller.ts.
 *
 * Preservação de URL (basePath /api/v1 + controller /providers + action):
 *   listProviders      GET    /api/v1/providers
 *   upsertProvider     PATCH  /api/v1/providers/:provider
 *   deleteProvider     DELETE /api/v1/providers/:provider
 *   listProviderKeys   GET    /api/v1/providers/:provider/keys
 *   createProviderKey  POST   /api/v1/providers/:provider/keys
 *   deleteProviderKey  DELETE /api/v1/providers/keys/:id
 *
 * Precedência: /providers/keys/{id} (segmento estático `keys`) vence
 * /providers/{provider} no radix router do oRPC — coberto por teste.
 *
 * Fidelidade ao original:
 *   - `provider` NÃO é validado por zod-enum: o handler checa includes() e
 *     responde 400 `Unsupported provider: X` (mesma mensagem/status).
 *   - Toda a lógica de dados fica no providersRepository REUSADO (criptografia
 *     AES das keys, lastFour, primary/priority) — nada reimplementado.
 *   - Shapes de sucesso via ok() (envelope Igniter { data, error: null }).
 */
import { ORPCError } from '@orpc/server'
import { z } from 'zod'
import { base } from '@/orpc/base'
import { ok } from '@/orpc/envelope'
import { requireAuth } from '@/orpc/auth.middleware'
import { providersRepository } from './providers.repository'
import {
  upsertProviderBodySchema,
  SUPPORTED_PROVIDERS,
  type SupportedProvider,
} from './providers.schemas'

const createKeyBodySchema = z.object({
  apiKey: z.string().min(8),
  name: z.string().min(1).max(60),
})

function orgOf(user: unknown): string | null {
  return (user as { currentOrgId?: string | null })?.currentOrgId ?? null
}

/**
 * Guardas comuns dos 6 handlers, copiadas 1:1: 401 sem user (defensivo — o
 * middleware já barra antes) e 400 sem org ativa.
 */
function requireOrg(context: { auth: { session: { user: unknown } } }): string {
  const user = context.auth.session.user
  if (!user) throw new ORPCError('UNAUTHORIZED', { message: 'Not authenticated' })
  const orgId = orgOf(user)
  if (!orgId) throw new ORPCError('BAD_REQUEST', { message: 'No active organization' })
  return orgId
}

/** Mesma validação manual do original (não é zod: mensagem/status idênticos). */
function assertSupported(provider: string): SupportedProvider {
  if (!(SUPPORTED_PROVIDERS as readonly string[]).includes(provider)) {
    throw new ORPCError('BAD_REQUEST', { message: `Unsupported provider: ${provider}` })
  }
  return provider as SupportedProvider
}

/** Builder autenticado — equivale a `use: [authProcedure({ required: true })]`. */
const authed = base.use(requireAuth)

// ──────────────────────────────────────────────────────────────────────────
// LIST — GET /providers
// ──────────────────────────────────────────────────────────────────────────
export const listProviders = authed
  .route({
    method: 'GET',
    path: '/providers',
    summary: 'List Providers',
    description: 'Return BYOK configuration status for all supported AI providers',
  })
  .handler(async ({ context }) => {
    const orgId = requireOrg(context)
    const items = await providersRepository.list(orgId)
    return ok(items)
  })

// ──────────────────────────────────────────────────────────────────────────
// UPSERT — PATCH /providers/{provider}
// ──────────────────────────────────────────────────────────────────────────
export const upsertProvider = authed
  .route({
    method: 'PATCH',
    path: '/providers/{provider}',
    summary: 'Upsert Provider',
    description: 'Store (or replace) an API key for the given AI provider',
  })
  .input(upsertProviderBodySchema.extend({ provider: z.string() }))
  .handler(async ({ input, context }) => {
    const orgId = requireOrg(context)
    const provider = assertSupported(input.provider)

    const item = await providersRepository.upsert(orgId, provider, input.apiKey, input.config)
    return ok(item)
  })

// ──────────────────────────────────────────────────────────────────────────
// DELETE — DELETE /providers/{provider}
// ──────────────────────────────────────────────────────────────────────────
export const deleteProvider = authed
  .route({
    method: 'DELETE',
    path: '/providers/{provider}',
    summary: 'Delete Provider',
    description: 'Remove a stored API key so the org falls back to the env-level key',
  })
  .input(z.object({ provider: z.string() }))
  .handler(async ({ input, context }) => {
    const orgId = requireOrg(context)
    const provider = assertSupported(input.provider)

    const deleted = await providersRepository.remove(orgId, provider)
    if (!deleted) throw new ORPCError('NOT_FOUND', { message: 'Provider not configured' })

    return ok({ success: true })
  })

// ──────────────────────────────────────────────────────────────────────────
// LIST KEYS — GET /providers/{provider}/keys (multi-key BYOK)
// ──────────────────────────────────────────────────────────────────────────
export const listProviderKeys = authed
  .route({
    method: 'GET',
    path: '/providers/{provider}/keys',
    summary: 'List Provider Keys',
    description: 'Lista todas as chaves BYOK (rotuladas) de um provider para a org',
  })
  .input(z.object({ provider: z.string() }))
  .handler(async ({ input, context }) => {
    const orgId = requireOrg(context)
    const provider = assertSupported(input.provider)

    const keys = await providersRepository.listKeys(orgId, provider)
    return ok(keys)
  })

// ──────────────────────────────────────────────────────────────────────────
// CREATE KEY — POST /providers/{provider}/keys
// ──────────────────────────────────────────────────────────────────────────
export const createProviderKey = authed
  .route({
    method: 'POST',
    path: '/providers/{provider}/keys',
    summary: 'Create Provider Key',
    description: 'Cria uma nova chave BYOK rotulada para o provider (múltiplas chaves)',
  })
  .input(createKeyBodySchema.extend({ provider: z.string() }))
  .handler(async ({ input, context }) => {
    const orgId = requireOrg(context)
    const provider = assertSupported(input.provider)

    const key = await providersRepository.createKey(orgId, provider, input.apiKey, input.name)
    return ok(key)
  })

// ──────────────────────────────────────────────────────────────────────────
// DELETE KEY — DELETE /providers/keys/{id}
// ──────────────────────────────────────────────────────────────────────────
export const deleteProviderKey = authed
  .route({
    method: 'DELETE',
    path: '/providers/keys/{id}',
    summary: 'Delete Provider Key',
    description: 'Remove uma chave BYOK específica por id (org-scoped)',
  })
  .input(z.object({ id: z.string() }))
  .handler(async ({ input, context }) => {
    const orgId = requireOrg(context)

    const deleted = await providersRepository.deleteKeyById(orgId, input.id)
    if (!deleted) throw new ORPCError('NOT_FOUND', { message: 'Key not found' })
    return ok({ success: true })
  })

/** Namespace espelhando o controller (api.providers.* no client Igniter). */
export const providers = {
  listProviders,
  upsertProvider,
  deleteProvider,
  listProviderKeys,
  createProviderKey,
  deleteProviderKey,
}
