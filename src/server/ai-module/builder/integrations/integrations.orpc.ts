/**
 * Builder Integrations — porta mecânica para oRPC (lote B6 do builder).
 *
 * Origem: ./integrations.routes.ts (5 actions: T16 read+create, T17 creds+test).
 *   listProjectIntegrations      GET   /builder/integrations?projectId=
 *   listTemplates                GET   /builder/integrations/templates
 *   createIntegration            POST  /builder/integrations
 *   updateIntegrationCredentials PATCH /builder/integrations/:id/credentials
 *   testIntegration              POST  /builder/integrations/:id/test
 *
 * SEGURANÇA preservada: credenciais WRITE-ONLY (cifradas campo a campo, nunca
 * ecoadas); list nunca lê valores (máscara presence-only); feature-flag gate +
 * role-gate lifecycle idênticos ao original.
 */
import type { Prisma } from '@prisma/client'
import { ORPCError } from '@orpc/server'
import { z } from 'zod'
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
import { base } from '@/orpc/base'
import { ok } from '@/orpc/envelope'
import { authOrApiKey } from '@/orpc/auth.middleware'
import { builderOrg } from '../projects/routes/crud.orpc'

const authed = base.use(authOrApiKey)

// ---------------------------------------------------------------------------
// Helpers compartilhados — cópia 1:1 de integrations.routes.ts (o cookie de
// override QA agora é lido de context.headers)
// ---------------------------------------------------------------------------

type LifecycleUser = { id: string; currentOrgId?: string | null; role?: string | null }

export function readIntegrationOverrideCookie(headers: Headers): string | null {
  const cookieHeader = headers.get('cookie') ?? ''
  const value = cookieHeader
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${INTEGRATION_BUILDER_OVERRIDE_COOKIE}=`))
    ?.split('=')
    .slice(1)
    .join('=')
  return value ?? null
}

/** Gate de feature-flag idêntico ao original (flag off ⇒ 404 opaco). */
export function assertIntegrationBuilderEnabled(orgId: string, headers: Headers): void {
  if (!isIntegrationBuilderEnabled(orgId, readIntegrationOverrideCookie(headers))) {
    throw new ORPCError('NOT_FOUND', { message: 'Recurso indisponível' })
  }
}

/** Role-gate lifecycle (ADMIN global OU MASTER da org) — 403 com a razão. */
export async function assertLifecycleRoleOrThrow(
  user: LifecycleUser,
  orgId: string,
): Promise<void> {
  const access = await assertIntegrationLifecycleRole(user, orgId)
  if (!access.allowed) {
    throw new ORPCError('FORBIDDEN', { message: access.reason })
  }
}

/** Usuário completo da sessão (o role importa para o role-gate). */
export function sessionUser(context: {
  auth: { session: { user: unknown } }
}): LifecycleUser {
  const user = context.auth.session.user as LifecycleUser | null
  if (!user) throw new ORPCError('UNAUTHORIZED', { message: 'Não autenticado' })
  return user
}

function parseCredentialFields(stored: unknown): CredentialField[] {
  const parsed = credentialFieldsSchema.safeParse(stored)
  return parsed.success ? parsed.data : []
}

function filledCredentialKeys(credentials: unknown): Set<string> {
  if (
    credentials === null ||
    typeof credentials !== 'object' ||
    Array.isArray(credentials)
  ) {
    return new Set()
  }
  const keys = new Set<string>()
  for (const [key, value] of Object.entries(credentials as Record<string, unknown>)) {
    if (typeof value === 'string' && value.length > 0) keys.add(key)
  }
  return keys
}

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
    credentialFields: fields.map((f) => ({
      key: f.key,
      label: f.label,
      whereToGet: f.whereToGet,
      placeholder: f.placeholder ?? null,
      filled: filledKeys.has(f.key),
    })),
  }
}

// ==========================================
// LIST — GET /builder/integrations?projectId=
// ==========================================
export const listProjectIntegrations = authed
  .route({
    method: 'GET',
    path: '/builder/integrations',
    summary: 'List Integrations',
  })
  .input(z.object({ projectId: z.string().uuid() }))
  .handler(async ({ input, context }) => {
    const { orgId } = builderOrg(context)
    assertIntegrationBuilderEnabled(orgId, context.headers)

    const db = getDatabase()
    const project = await db.builderProject.findFirst({
      where: { id: input.projectId, organizationId: orgId },
      select: { id: true },
    })
    if (!project) throw new ORPCError('NOT_FOUND', { message: 'Projeto não encontrado' })

    const rows = await listIntegrations(orgId, project.id)

    // Presence-only read — os VALORES nunca saem de filledCredentialKeys.
    const credRows = await db.customIntegration.findMany({
      where: { organizationId: orgId, builderProjectId: project.id, deletedAt: null },
      select: { id: true, credentials: true },
    })
    const filledById = new Map(
      credRows.map((r) => [r.id, filledCredentialKeys(r.credentials)]),
    )

    return ok({
      integrations: rows.map((row) =>
        maskListRow(row, filledById.get(row.id) ?? new Set<string>()),
      ),
    })
  })

// ==========================================
// TEMPLATES — GET /builder/integrations/templates
// ==========================================
export const listTemplates = authed
  .route({
    method: 'GET',
    path: '/builder/integrations/templates',
    summary: 'List Integration Templates',
  })
  .handler(async ({ context }) => {
    const { orgId } = builderOrg(context)
    assertIntegrationBuilderEnabled(orgId, context.headers)

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
    return ok({ templates })
  })

// ==========================================
// CREATE — POST /builder/integrations
// ==========================================
export const createIntegration = authed
  .route({
    method: 'POST',
    path: '/builder/integrations',
    summary: 'Create Integration',
  })
  .input(createIntegrationBodySchema)
  .handler(async ({ input, context }) => {
    const user = sessionUser(context)
    const { orgId } = builderOrg(context)
    assertIntegrationBuilderEnabled(orgId, context.headers)

    const project = await getDatabase().builderProject.findFirst({
      where: { id: input.projectId, organizationId: orgId },
      select: { id: true },
    })
    if (!project) throw new ORPCError('NOT_FOUND', { message: 'Projeto não encontrado' })

    // Resolve a ORIGEM: templateSlug explícito OU a proposta no builderState.
    let templateSlug: string | undefined = input.templateSlug
    let displayNameOverride: string | undefined = input.displayName

    if (!templateSlug && input.proposalFromState === true) {
      const state = parseBuilderState(await readBuilderStateByProject(input.projectId))
      const proposed = state.integration?.proposed
      if (!proposed) {
        throw new ORPCError('BAD_REQUEST', {
          message: 'Não há proposta de integração no estado deste projeto.',
        })
      }
      if (!proposed.templateSlug) {
        throw new ORPCError('BAD_REQUEST', {
          message:
            'A proposta ainda não está pronta para virar integração. Tente novamente em breve.',
        })
      }
      templateSlug = proposed.templateSlug
      displayNameOverride = displayNameOverride ?? proposed.platform
    }

    if (!templateSlug) {
      throw new ORPCError('BAD_REQUEST', { message: 'Origem da integração não resolvida.' })
    }

    const template = getIntegrationTemplate(templateSlug)
    if (!template) {
      throw new ORPCError('BAD_REQUEST', { message: 'Template de integração desconhecido.' })
    }

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

      const fields = parseCredentialFields(created.credentialFields)
      return ok({
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
        throw new ORPCError('BAD_REQUEST', {
          message: 'Já existe uma ferramenta com esse nome.',
        })
      }
      throw err
    }
  })

// ==========================================
// CREDENTIALS — PATCH /builder/integrations/{id}/credentials
// ==========================================
export const updateIntegrationCredentials = authed
  .route({
    method: 'PATCH',
    path: '/builder/integrations/{id}/credentials',
    summary: 'Update Integration Credentials',
  })
  .input(updateCredentialsBodySchema.extend({ id: z.string().min(1, 'id obrigatório') }))
  .handler(async ({ input, context }) => {
    const user = sessionUser(context)
    const { orgId } = builderOrg(context)
    assertIntegrationBuilderEnabled(orgId, context.headers)
    await assertLifecycleRoleOrThrow(user, orgId)

    const integration = await getIntegration(orgId, input.id)
    if (!integration) {
      throw new ORPCError('NOT_FOUND', { message: 'Integração não encontrada' })
    }

    const fields = parseCredentialFields(integration.credentialFields)
    const fieldByKey = new Map(fields.map((f) => [f.key, f]))

    const submitted = input.values

    // Valida cada valor: campo conhecido E (se declara formatRegex) formato ok.
    // NUNCA ecoa o valor no erro.
    const encryptedCredentials: Record<string, string> = {}
    for (const [key, value] of Object.entries(submitted)) {
      const field = fieldByKey.get(key)
      if (!field) {
        throw new ORPCError('BAD_REQUEST', {
          message: `Campo de credencial desconhecido: ${key}`,
        })
      }
      if (field.formatRegex) {
        let re: RegExp
        try {
          re = new RegExp(field.formatRegex)
        } catch {
          re = /.*/
        }
        if (!re.test(value)) {
          throw new ORPCError('BAD_REQUEST', {
            message: `O valor de "${field.label}" está em formato inválido.`,
          })
        }
      }
      encryptedCredentials[key] = encrypt(value)
    }

    const updated = await updateCredentials(orgId, integration.id, encryptedCredentials)
    if (!updated) {
      throw new ORPCError('NOT_FOUND', { message: 'Integração não encontrada' })
    }

    // AuditLog — metadata carrega só as KEYS, jamais valores.
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

    return ok({ ok: true, updatedKeys: Object.keys(submitted) })
  })

// ==========================================
// TEST — POST /builder/integrations/{id}/test
// ==========================================
export const testIntegration = authed
  .route({
    method: 'POST',
    path: '/builder/integrations/{id}/test',
    summary: 'Test Integration',
  })
  .input(z.object({ id: z.string().min(1, 'id obrigatório') }))
  .handler(async ({ input, context }) => {
    const user = sessionUser(context)
    const { orgId } = builderOrg(context)
    assertIntegrationBuilderEnabled(orgId, context.headers)
    await assertLifecycleRoleOrThrow(user, orgId)

    // Quota fixed-window por org (fail-open dentro do service).
    const quota = await checkFixedWindowQuota('integrationTest', orgId)
    if (!quota.allowed) {
      const minutes = Math.max(1, Math.ceil(quota.resetMs / 60_000))
      throw new ORPCError('BAD_REQUEST', {
        message: `Você atingiu o limite de testes por hora. Tente novamente em ~${minutes} min.`,
      })
    }

    // O runner NUNCA lança e nunca vaza segredos/payloads.
    const result = await runIntegrationTest({
      organizationId: orgId,
      integrationId: input.id,
      requestedById: user.id,
    })

    return ok({
      outcome: result.outcome,
      diagnosis: result.diagnosis,
      httpStatus: result.httpStatus,
      durationMs: result.durationMs,
    })
  })

export const integrationsListCreateActions = {
  listProjectIntegrations,
  listTemplates,
  createIntegration,
  updateIntegrationCredentials,
  testIntegration,
}
