/**
 * Calendar Routes — HTTP surface for the Google Calendar BYOK connect flow.
 *
 * Exposes 3 actions under `/calendar` (composed into the builder controller by
 * the orchestrator — this file does NOT touch builder.controller):
 *   POST   /calendar/connect-link         — create a public connect link (PENDING)
 *   GET    /calendar/status/:projectId     — connection status + calendarEmail
 *   DELETE /calendar/:projectId            — disconnect (REVOKE + drop provider)
 *
 * Mirrors provision-whatsapp.routes (authOrApiKeyProcedure, currentOrgId scoping,
 * `share`-style token, shareLink in the response). The OAuth secret (refresh_token)
 * NEVER lives in CalendarConnection — it goes AES-encrypted into OrganizationProvider
 * (category AUXILIARY, provider 'google-calendar'); this surface only manages the
 * public LINK state.
 *
 * Persistence of CalendarConnection rows is best-effort: every call to
 * `database.calendarConnection.*` is funneled through getCalendarConnection() which
 * returns null when the Prisma delegate is absent (table not migrated yet). When
 * unavailable, connect-link/status/delete degrade to a warning payload instead of a
 * 500 — same defensive pattern as getBuilderDeployment() in deploy.routes.ts.
 */

import crypto from 'crypto'
import { z } from 'zod'
import { igniter } from '@/igniter'
import { authOrApiKeyProcedure } from '@/server/core/auth/procedures/api-key.procedure'
import { database } from '@/server/services/database'
import { ProviderCategory } from '@prisma/client'
import { GOOGLE_CALENDAR_PROVIDER } from '@/lib/calendar/types'
import { invalidateCalendarAccess } from '@/lib/calendar/calendar-credential-resolver'

// ---------------------------------------------------------------------------
// Constants & types
// ---------------------------------------------------------------------------

type AuthedUser = { id: string; currentOrgId?: string | null }

/** Connect link lives for 7 days before the user must re-request it. */
const CONNECT_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000

/** Mirror of the CalendarConnectionStatus enum (avoid hard import pre-migration). */
type CalendarConnectionStatus = 'PENDING' | 'CONNECTED' | 'EXPIRED' | 'REVOKED'

type CalendarConnectionRow = {
  id: string
  organizationId: string
  builderProjectId: string | null
  connectToken: string
  connectTokenExpiresAt: Date
  status: CalendarConnectionStatus
  calendarEmail: string | null
  createdAt: Date
  updatedAt: Date
}

/**
 * Narrow delegate surface we rely on. Typed loosely (Record args) because the
 * generated Prisma delegate may not exist until the migration lands — we only
 * promise the methods we actually call.
 */
type CalendarConnectionDelegate = {
  create: (args: { data: Record<string, unknown> }) => Promise<CalendarConnectionRow>
  findFirst: (args: {
    where: Record<string, unknown>
    orderBy?: Record<string, unknown>
  }) => Promise<CalendarConnectionRow | null>
  updateMany: (args: {
    where: Record<string, unknown>
    data: Record<string, unknown>
  }) => Promise<{ count: number }>
}

/**
 * Defensive delegate accessor — returns null when CalendarConnection is not yet
 * provisioned in the Prisma client (pre-migration). Same shape as
 * getBuilderDeployment() in deploy.routes.ts:63-68.
 */
function getCalendarConnection(): CalendarConnectionDelegate | null {
  const delegate = (database as unknown as {
    calendarConnection?: CalendarConnectionDelegate
  }).calendarConnection
  return delegate ?? null
}

function getAppUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '')
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const connectLinkBodySchema = z.object({
  /** Optional Builder project scope; omit for an org-level connect link. */
  projectId: z.string().uuid('projectId inválido').optional(),
})

// ---------------------------------------------------------------------------
// POST /calendar/connect-link — create a public connect link (status PENDING)
// ---------------------------------------------------------------------------

const connectLink = igniter.mutation({
  name: 'Create Google Calendar Connect Link',
  description:
    'Cria um link público de conexão do Google Calendar (CalendarConnection PENDING, token de 7 dias) e retorna o shareLink.',
  path: '/calendar/connect-link',
  method: 'POST',
  use: [authOrApiKeyProcedure({ required: true })],
  body: connectLinkBodySchema,
  handler: async ({ request, context, response }) => {
    const user = context.auth?.session?.user as AuthedUser | undefined
    if (!user) return response.unauthorized('Não autenticado')
    if (!user.currentOrgId) return response.badRequest('Organização não selecionada')

    const { projectId } = request.body

    // If scoped to a project, it must belong to the active org.
    if (projectId) {
      const project = await database.builderProject.findFirst({
        where: { id: projectId, organizationId: user.currentOrgId },
        select: { id: true },
      })
      if (!project) return response.notFound('Projeto não encontrado')
    }

    const delegate = getCalendarConnection()
    if (!delegate) {
      console.warn('[calendar/connect-link] CalendarConnection indisponível — tabela não provisionada')
      return response.notFound(
        'CalendarConnection indisponível — tabela não provisionada (migration pendente)',
      )
    }

    // `cal_` prefix mirrors the `share_` convention of provision-whatsapp.routes:72.
    const connectToken = `cal_${crypto.randomBytes(32).toString('hex')}`
    const connectTokenExpiresAt = new Date(Date.now() + CONNECT_TOKEN_TTL_MS)

    try {
      const conn = await delegate.create({
        data: {
          organizationId: user.currentOrgId,
          builderProjectId: projectId ?? null,
          connectToken,
          connectTokenExpiresAt,
          status: 'PENDING',
        },
      })

      return response.success({
        connectionId: conn.id,
        connectToken: conn.connectToken,
        expiresAt: conn.connectTokenExpiresAt,
        shareLink: `${getAppUrl()}/conectar-agenda/${conn.connectToken}`,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido'
      console.error('[calendar/connect-link] Falha:', err)
      return response.badRequest(`Erro ao criar link de conexão: ${message}`)
    }
  },
})

// ---------------------------------------------------------------------------
// GET /calendar/status/:projectId — connection status + calendarEmail
// ---------------------------------------------------------------------------

const status = igniter.query({
  name: 'Get Google Calendar Connection Status',
  description:
    'Retorna o status da conexão do Google Calendar do projeto (status + calendarEmail), org-scoped.',
  path: '/calendar/status/:projectId' as const,
  method: 'GET',
  use: [authOrApiKeyProcedure({ required: true })],
  handler: async ({ request, context, response }) => {
    const user = context.auth?.session?.user as AuthedUser | undefined
    if (!user) return response.unauthorized('Não autenticado')
    if (!user.currentOrgId) return response.badRequest('Organização não selecionada')

    const params = request.params as { projectId?: string }
    const projectId = params.projectId
    if (!projectId) return response.badRequest('projectId obrigatório')

    const delegate = getCalendarConnection()
    if (!delegate) {
      console.warn('[calendar/status] CalendarConnection indisponível — retornando vazio')
      return response.success({
        connected: false,
        status: null,
        calendarEmail: null,
        warning: 'CalendarConnection table not available',
      })
    }

    try {
      // Latest link for this project, scoped to the active org. The newest row
      // reflects the current intent (a fresh connect-link supersedes older ones).
      const conn = await delegate.findFirst({
        where: { builderProjectId: projectId, organizationId: user.currentOrgId },
        orderBy: { createdAt: 'desc' },
      })

      if (!conn) {
        return response.success({ connected: false, status: null, calendarEmail: null })
      }

      return response.success({
        connectionId: conn.id,
        status: conn.status,
        connected: conn.status === 'CONNECTED',
        calendarEmail: conn.calendarEmail,
        expiresAt: conn.connectTokenExpiresAt,
      })
    } catch (err) {
      console.warn('[calendar/status] Leitura falhou:', err)
      return response.success({
        connected: false,
        status: null,
        calendarEmail: null,
        warning: 'CalendarConnection read failed',
      })
    }
  },
})

// ---------------------------------------------------------------------------
// DELETE /calendar/:projectId — disconnect (REVOKE + drop the OAuth provider)
// ---------------------------------------------------------------------------

const disconnect = igniter.mutation({
  name: 'Disconnect Google Calendar',
  description:
    'Desconecta o Google Calendar do projeto: marca CalendarConnection como REVOKED e remove o OrganizationProvider google-calendar.',
  path: '/calendar/:projectId' as const,
  method: 'DELETE',
  use: [authOrApiKeyProcedure({ required: true })],
  body: z.object({}).optional(),
  handler: async ({ request, context, response }) => {
    const user = context.auth?.session?.user as AuthedUser | undefined
    if (!user) return response.unauthorized('Não autenticado')
    if (!user.currentOrgId) return response.badRequest('Organização não selecionada')

    const params = request.params as { projectId?: string }
    const projectId = params.projectId
    if (!projectId) return response.badRequest('projectId obrigatório')

    // Ownership check — the project must belong to the active org.
    const project = await database.builderProject.findFirst({
      where: { id: projectId, organizationId: user.currentOrgId },
      select: { id: true },
    })
    if (!project) return response.notFound('Projeto não encontrado')

    let linksRevoked = 0
    let providerRemoved = 0

    // 1) Revoke the public link(s) for this project (best-effort, pre-migration safe).
    const delegate = getCalendarConnection()
    if (delegate) {
      try {
        const res = await delegate.updateMany({
          where: {
            builderProjectId: projectId,
            organizationId: user.currentOrgId,
            status: { not: 'REVOKED' },
          },
          data: { status: 'REVOKED', updatedAt: new Date() },
        })
        linksRevoked = res.count
      } catch (err) {
        console.warn('[calendar/disconnect] Revoke de CalendarConnection falhou (não-fatal):', err)
      }
    } else {
      console.warn('[calendar/disconnect] CalendarConnection indisponível — pulando revoke do link')
    }

    // 2) Hard-delete the project-scoped google-calendar provider (drops the
    //    encrypted refresh_token). Org-level credential is left intact.
    try {
      const res = await database.organizationProvider.deleteMany({
        where: {
          organizationId: user.currentOrgId,
          category: ProviderCategory.AUXILIARY,
          provider: GOOGLE_CALENDAR_PROVIDER,
          builderProjectId: projectId,
        },
      })
      providerRemoved = res.count
    } catch (err) {
      console.warn('[calendar/disconnect] Remoção do OrganizationProvider falhou (não-fatal):', err)
    }

    // 3) Drop the resolver's in-memory access_token cache for this scope.
    invalidateCalendarAccess(user.currentOrgId, projectId)

    return response.success({
      disconnected: true,
      linksRevoked,
      providerRemoved,
    })
  },
})

export const calendarRoutes = { connectLink, status, disconnect }
