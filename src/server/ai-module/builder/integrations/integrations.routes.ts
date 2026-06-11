/**
 * Integration Builder — routes (Wave 1, T16 + T17).
 *
 * The read + create surface (T16) and the credentials + test surface (T17). The
 * role-gated LIFECYCLE transitions (T18: activate/pause/resume/delete) live in
 * the sibling `integration-lifecycle.routes.ts` to keep both files under the
 * route size limit (docs/FILE_SIZE_GUIDELINES.md ≤400); the controller (T19)
 * spreads `integrationsRoutes`, which merges both objects.
 *
 *   GET   /integrations?projectId= — lista (status, trigger, lastTest*) com
 *           credenciais MASCARADAS: só QUAIS keys estão preenchidas, nunca valores.
 *   GET   /integrations/templates  — catálogo público-ish de templates (sem segredos).
 *   POST  /integrations            — cria draft + AgentTool inativo a partir de um
 *           templateSlug OU da proposta no builderState (proposalFromState).
 *   PATCH /integrations/:id/credentials — valida formato por campo, cifra campo a
 *           campo, grava; NUNCA ecoa valores (retorna { ok, updatedKeys }).
 *   POST  /integrations/:id/test   — quota fixed-window + runner; { outcome, diagnosis }.
 *
 * SEGURANÇA: valores de credenciais são WRITE-ONLY — nunca lidos de volta nem
 * logados. A list nunca seleciona a coluna `credentials` (o repository já a
 * omite); a máscara aqui é defesa em profundidade. Espelha o shape de
 * pricing.routes.ts / credential.routes.ts. Zero `any`; tudo org-scoped.
 */

import type { Prisma } from '@prisma/client'
import { z } from 'zod'
import { igniter } from '@/igniter'
import { authOrApiKeyProcedure } from '@/server/core/auth/procedures/api-key.procedure'
import { getDatabase } from '@/server/services/database'
import { encrypt } from '@/lib/crypto'
import {
  isIntegrationBuilderEnabled,
  INTEGRATION_BUILDER_OVERRIDE_COOKIE,
} from '@/lib/feature-flags/integration-builder'
import { checkFixedWindowQuota } from '@/server/ai-module/ai-agents/infra/rate-limit.service'

import { parseBuilderState } from '../cards/builder-state'
import { readBuilderStateByProject } from '../sources/builder-state-db'

import {
  createIntegrationBodySchema,
  updateCredentialsBodySchema,
  credentialFieldsSchema,
  type CredentialField,
} from './integration.schemas'
import {
  listIntegrations,
  getIntegration,
  createDraftIntegration,
  updateCredentials,
  IntegrationNameConflictError,
  type IntegrationListRow,
} from './integration.repository'
import { getIntegrationTemplate, listIntegrationTemplates } from './templates'
import { runIntegrationTest } from './test-call.runner'
import { assertIntegrationLifecycleRole } from './integration-access'
import { integrationLifecycleRoutes } from './integration-lifecycle.routes'

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Session user shape we rely on (full Prisma `User` carries `role`). */
interface AuthedUser {
  id: string
  currentOrgId?: string | null
  role?: string | null
}

/** Reads the integration-builder QA override cookie from the raw request. */
function readOverrideCookie(request: {
  headers: { get(name: string): string | null }
}): string | null {
  const cookieHeader = request.headers.get('cookie') ?? ''
  const value = cookieHeader
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${INTEGRATION_BUILDER_OVERRIDE_COOKIE}=`))
    ?.split('=')
    .slice(1)
    .join('=')
  return value ?? null
}

/** Coerces the persisted `credentialFields` Json into the typed array (safe). */
function parseCredentialFields(stored: unknown): CredentialField[] {
  const parsed = credentialFieldsSchema.safeParse(stored)
  return parsed.success ? parsed.data : []
}

/**
 * Returns the SET of credential keys that currently hold a (ciphertext) value.
 * Reads only presence (key exists + non-empty string), NEVER the value, and the
 * value never leaves this function. Tolerates null/garbage shapes.
 */
function filledCredentialKeys(credentials: unknown): Set<string> {
  if (
    credentials === null ||
    typeof credentials !== 'object' ||
    Array.isArray(credentials)
  ) {
    return new Set()
  }
  const keys = new Set<string>()
  for (const [key, value] of Object.entries(
    credentials as Record<string, unknown>,
  )) {
    if (typeof value === 'string' && value.length > 0) keys.add(key)
  }
  return keys
}

/**
 * Masks one integration list row for the wire: keeps the FE-facing metadata and
 * the credential FIELD metadata, plus which keys are filled (`filledKeys`) and a
 * `hasCredentials` flag — NEVER the values. The filled-keys set comes from a
 * separate presence-only read (`listIntegrations` itself never selects the
 * `credentials` column — defence in depth).
 */
function maskListRow(row: IntegrationListRow, filledKeys: Set<string>) {
  const fields = parseCredentialFields(row.credentialFields)
  return {
    id: row.id,
    displayName: row.displayName,
    status: row.status,
    triggerDescription: row.triggerDescription,
    templateSlug: row.templateSlug,
    lastTestAt: row.lastTestAt ? row.lastTestAt.toISOString() : null,
    lastTestStatus: row.lastTestStatus,
    hasCredentials: filledKeys.size > 0,
    // Only the NON-secret field metadata (key/label/whereToGet/placeholder) plus
    // whether each field already has a stored value — never the value itself.
    credentialFields: fields.map((f) => ({
      key: f.key,
      label: f.label,
      whereToGet: f.whereToGet,
      placeholder: f.placeholder ?? null,
      filled: filledKeys.has(f.key),
    })),
  }
}

// ---------------------------------------------------------------------------
// GET /integrations?projectId=
// ---------------------------------------------------------------------------

const listProjectIntegrations = igniter.query({
  name: 'List Integrations',
  description:
    'Lista as integrações de um projeto (org-scoped) com credenciais MASCARADAS — nunca valores, só quais campos estão preenchidos.',
  path: '/integrations' as const,
  method: 'GET',
  use: [authOrApiKeyProcedure({ required: true })],
  query: z.object({ projectId: z.string().uuid() }),
  handler: async ({ request, context, response }) => {
    const user = context.auth?.session?.user as AuthedUser | undefined
    if (!user) return response.unauthorized('Não autenticado')
    if (!user.currentOrgId) return response.badRequest('Organização não selecionada')
    const orgId = user.currentOrgId

    if (!isIntegrationBuilderEnabled(orgId, readOverrideCookie(request))) {
      return response.notFound('Recurso indisponível')
    }

    const query = request.query as { projectId?: string }
    if (!query.projectId) return response.badRequest('projectId obrigatório')

    // O projeto precisa pertencer à org (não vaza existência cross-org).
    const db = getDatabase()
    const project = await db.builderProject.findFirst({
      where: { id: query.projectId, organizationId: orgId },
      select: { id: true },
    })
    if (!project) return response.notFound('Projeto não encontrado')

    const rows = await listIntegrations(orgId, project.id)

    // Presence-only read of `credentials` (org+project scoped) → map id → filled
    // keys. The VALUES never leave `filledCredentialKeys`; only the key set is
    // used to build `hasCredentials` / per-field `filled`.
    const credRows = await db.customIntegration.findMany({
      where: { organizationId: orgId, builderProjectId: project.id, deletedAt: null },
      select: { id: true, credentials: true },
    })
    const filledById = new Map(
      credRows.map((r) => [r.id, filledCredentialKeys(r.credentials)]),
    )

    return response.success({
      integrations: rows.map((row) =>
        maskListRow(row, filledById.get(row.id) ?? new Set<string>()),
      ),
    })
  },
})

// ---------------------------------------------------------------------------
// GET /integrations/templates
// ---------------------------------------------------------------------------

const listTemplates = igniter.query({
  name: 'List Integration Templates',
  description:
    'Catálogo de templates de integração ofertáveis (slug, label, descrição, campos de credencial — metadata não-secreta, gatilho).',
  path: '/integrations/templates' as const,
  method: 'GET',
  use: [authOrApiKeyProcedure({ required: true })],
  handler: async ({ request, context, response }) => {
    const user = context.auth?.session?.user as AuthedUser | undefined
    if (!user) return response.unauthorized('Não autenticado')
    if (!user.currentOrgId) return response.badRequest('Organização não selecionada')

    if (!isIntegrationBuilderEnabled(user.currentOrgId, readOverrideCookie(request))) {
      return response.notFound('Recurso indisponível')
    }

    // Templates são metadata pública-ish (sem segredos): só os campos seguros.
    const templates = listIntegrationTemplates().map((t) => ({
      slug: t.slug,
      displayName: t.displayName,
      description: t.description,
      triggerDescription: t.triggerDescription,
      credentialFields: t.credentialFields.map((f) => ({
        key: f.key,
        label: f.label,
        whereToGet: f.whereToGet,
        placeholder: f.placeholder ?? null,
      })),
    }))
    return response.success({ templates })
  },
})

// ---------------------------------------------------------------------------
// POST /integrations
// ---------------------------------------------------------------------------

const createIntegration = igniter.mutation({
  name: 'Create Integration',
  description:
    'Cria um rascunho de integração (+ AgentTool inativo) a partir de um templateSlug OU da proposta corrente em builderState (proposalFromState).',
  path: '/integrations' as const,
  method: 'POST',
  use: [authOrApiKeyProcedure({ required: true })],
  body: createIntegrationBodySchema,
  handler: async ({ request, context, response }) => {
    const user = context.auth?.session?.user as AuthedUser | undefined
    if (!user) return response.unauthorized('Não autenticado')
    if (!user.currentOrgId) return response.badRequest('Organização não selecionada')
    const orgId = user.currentOrgId

    if (!isIntegrationBuilderEnabled(orgId, readOverrideCookie(request))) {
      return response.notFound('Recurso indisponível')
    }

    const body = request.body

    // O projeto precisa pertencer à org.
    const project = await getDatabase().builderProject.findFirst({
      where: { id: body.projectId, organizationId: orgId },
      select: { id: true },
    })
    if (!project) return response.notFound('Projeto não encontrado')

    // Resolve a ORIGEM da integração: templateSlug explícito OU a proposta no
    // estado (cujo templateSlug é a única âncora declarativa de spec na W1).
    let templateSlug: string | undefined = body.templateSlug
    let displayNameOverride: string | undefined = body.displayName

    if (!templateSlug && body.proposalFromState === true) {
      // Lê a proposta do builderState do projeto (fail-open: nunca lança).
      const state = parseBuilderState(await readBuilderStateByProject(body.projectId))
      const proposed = state.integration?.proposed
      if (!proposed) {
        return response.badRequest(
          'Não há proposta de integração no estado deste projeto.',
        )
      }
      // A proposta só carrega platform/triggerDescription/whatDataSent + um
      // templateSlug OPCIONAL. Sem um template resolvível não há requestSpec/
      // credentialFields a materializar na W1 (o caminho investigador entra na W3).
      if (!proposed.templateSlug) {
        return response.badRequest(
          'A proposta ainda não está pronta para virar integração. Tente novamente em breve.',
        )
      }
      templateSlug = proposed.templateSlug
      // Usa o label da plataforma como displayName quando o caller não mandou um.
      displayNameOverride = displayNameOverride ?? proposed.platform
    }

    if (!templateSlug) {
      return response.badRequest('Origem da integração não resolvida.')
    }

    const template = getIntegrationTemplate(templateSlug)
    if (!template) return response.badRequest('Template de integração desconhecido.')

    // Cria draft + AgentTool inativo (1 transação no repository). Conflito de
    // nome (org @@unique) vira badRequest leiga.
    try {
      const created = await createDraftIntegration({
        organizationId: orgId,
        builderProjectId: project.id,
        createdById: user.id,
        displayName: displayNameOverride?.trim() || template.displayName,
        toolName: template.toolName,
        templateSlug: template.slug,
        triggerDescription: template.triggerDescription,
        requestSpec: template.requestSpec,
        credentialFields: template.credentialFields,
      })

      // Retorna a integração MASCARADA (nunca valores — o draft nem tem ainda).
      const fields = parseCredentialFields(created.credentialFields)
      return response.success({
        integration: {
          id: created.id,
          displayName: created.displayName,
          status: created.status,
          triggerDescription: created.triggerDescription,
          templateSlug: created.templateSlug,
          credentialFields: fields.map((f) => ({
            key: f.key,
            label: f.label,
            whereToGet: f.whereToGet,
            placeholder: f.placeholder ?? null,
          })),
        },
      })
    } catch (err) {
      if (err instanceof IntegrationNameConflictError) {
        return response.badRequest('Já existe uma ferramenta com esse nome.')
      }
      throw err
    }
  },
})

// ---------------------------------------------------------------------------
// PATCH /integrations/:id/credentials
// ---------------------------------------------------------------------------

const updateIntegrationCredentials = igniter.mutation({
  name: 'Update Integration Credentials',
  description:
    'Grava os valores de credencial (cifrados campo a campo). Valida o formato por campo; NUNCA ecoa valores de volta (retorna apenas as keys atualizadas).',
  path: '/integrations/:id/credentials' as const,
  method: 'PATCH',
  use: [authOrApiKeyProcedure({ required: true })],
  body: updateCredentialsBodySchema,
  handler: async ({ request, context, response }) => {
    const user = context.auth?.session?.user as AuthedUser | undefined
    if (!user) return response.unauthorized('Não autenticado')
    if (!user.currentOrgId) return response.badRequest('Organização não selecionada')
    const orgId = user.currentOrgId

    if (!isIntegrationBuilderEnabled(orgId, readOverrideCookie(request))) {
      return response.notFound('Recurso indisponível')
    }

    const params = request.params as { id?: string }
    if (!params.id) return response.badRequest('id obrigatório')

    // Role-gate (lifecycle): ADMIN global OU MASTER da org.
    const access = await assertIntegrationLifecycleRole(user, orgId)
    if (!access.allowed) return response.forbidden(access.reason)

    const integration = await getIntegration(orgId, params.id)
    if (!integration) return response.notFound('Integração não encontrada')

    const fields = parseCredentialFields(integration.credentialFields)
    const fieldByKey = new Map(fields.map((f) => [f.key, f]))

    const submitted = request.body.values

    // Valida cada valor submetido: precisa ser um campo conhecido E (quando o
    // campo declara formatRegex) casar com o formato. NUNCA ecoa o valor no erro.
    const encryptedCredentials: Record<string, string> = {}
    for (const [key, value] of Object.entries(submitted)) {
      const field = fieldByKey.get(key)
      if (!field) {
        return response.badRequest(`Campo de credencial desconhecido: ${key}`)
      }
      if (field.formatRegex) {
        let re: RegExp
        try {
          re = new RegExp(field.formatRegex)
        } catch {
          // Regex inválido no template → não bloqueia o usuário; só não valida.
          re = /.*/
        }
        if (!re.test(value)) {
          return response.badRequest(
            `O valor de "${field.label}" está em formato inválido.`,
          )
        }
      }
      encryptedCredentials[key] = encrypt(value)
    }

    const updated = await updateCredentials(orgId, integration.id, encryptedCredentials)
    if (!updated) return response.notFound('Integração não encontrada')

    // AuditLog credentials_updated — metadata carrega só as KEYS, jamais valores.
    const metadata: Prisma.InputJsonValue = { keys: Object.keys(submitted) }
    await getDatabase().auditLog.create({
      data: {
        action: 'integration.credentials_updated',
        resource: 'custom_integration',
        resourceId: integration.id,
        userId: user.id,
        organizationId: orgId,
        metadata,
      },
    })

    // Resposta SEM nenhum valor submetido.
    return response.success({ ok: true, updatedKeys: Object.keys(submitted) })
  },
})

// ---------------------------------------------------------------------------
// POST /integrations/:id/test
// ---------------------------------------------------------------------------

const testIntegration = igniter.mutation({
  name: 'Test Integration',
  description:
    'Dispara um teste de validação da integração (quota fixed-window por org). Retorna { outcome, diagnosis, httpStatus?, durationMs } — nunca segredos/payloads.',
  path: '/integrations/:id/test' as const,
  method: 'POST',
  use: [authOrApiKeyProcedure({ required: true })],
  handler: async ({ request, context, response }) => {
    const user = context.auth?.session?.user as AuthedUser | undefined
    if (!user) return response.unauthorized('Não autenticado')
    if (!user.currentOrgId) return response.badRequest('Organização não selecionada')
    const orgId = user.currentOrgId

    if (!isIntegrationBuilderEnabled(orgId, readOverrideCookie(request))) {
      return response.notFound('Recurso indisponível')
    }

    const params = request.params as { id?: string }
    if (!params.id) return response.badRequest('id obrigatório')

    // Role-gate (lifecycle): ADMIN global OU MASTER da org.
    const access = await assertIntegrationLifecycleRole(user, orgId)
    if (!access.allowed) return response.forbidden(access.reason)

    // Quota fixed-window por org (fail-open dentro do service). Sem helper
    // tooManyRequests nesta versão do Igniter → badRequest leiga com o resetMs.
    const quota = await checkFixedWindowQuota('integrationTest', orgId)
    if (!quota.allowed) {
      const minutes = Math.max(1, Math.ceil(quota.resetMs / 60_000))
      return response.badRequest(
        `Você atingiu o limite de testes por hora. Tente novamente em ~${minutes} min.`,
      )
    }

    // O runner NUNCA lança e nunca vaza segredos/payloads.
    const result = await runIntegrationTest({
      organizationId: orgId,
      integrationId: params.id,
      requestedById: user.id,
    })

    return response.success({
      outcome: result.outcome,
      diagnosis: result.diagnosis,
      httpStatus: result.httpStatus,
      durationMs: result.durationMs,
    })
  },
})

// ---------------------------------------------------------------------------
// Aggregate export — T16 + T17 here, T18 spread from the lifecycle file. The
// controller (T19) spreads `integrationsRoutes`.
// ---------------------------------------------------------------------------

const listAndCreateRoutes = {
  listProjectIntegrations,
  listTemplates,
  createIntegration,
  updateIntegrationCredentials,
  testIntegration,
}

export const integrationsRoutes = {
  ...listAndCreateRoutes,
  ...integrationLifecycleRoutes,
}
