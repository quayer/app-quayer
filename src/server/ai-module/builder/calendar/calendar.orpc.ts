/**
 * Builder Calendar — porta mecânica para oRPC (lote B5 do builder).
 *
 * Origem: ./calendar.routes.ts (3 actions).
 *   connectLink POST   /builder/calendar/connect-link
 *   status      GET    /builder/calendar/status/:projectId
 *   disconnect  DELETE /builder/calendar/:projectId
 *
 * Delegate defensivo preservado: CalendarConnection ausente (pré-migration)
 * degrada para warning payload / 404 em vez de 500. O refresh_token OAuth
 * NUNCA vive em CalendarConnection (vai AES-encriptado no
 * OrganizationProvider) — esta superfície só gerencia o LINK público.
 */
import crypto from 'crypto'
import { ORPCError } from '@orpc/server'
import { z } from 'zod'
import { database } from '@/server/services/database'
import { ProviderCategory } from '@prisma/client'
import { GOOGLE_CALENDAR_PROVIDER } from '@/lib/calendar/types'
import { invalidateCalendarAccess } from '@/lib/calendar/calendar-credential-resolver'
import { base } from '@/orpc/base'
import { ok } from '@/orpc/envelope'
import { authOrApiKey } from '@/orpc/auth.middleware'
import { builderOrg } from '../projects/routes/crud.orpc'

const authed = base.use(authOrApiKey)

// ---------------------------------------------------------------------------
// Constantes/tipos/delegate — cópia 1:1 de calendar.routes.ts
// ---------------------------------------------------------------------------

const CONNECT_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000

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

function getCalendarConnection(): CalendarConnectionDelegate | null {
  const delegate = (database as unknown as {
    calendarConnection?: CalendarConnectionDelegate
  }).calendarConnection
  return delegate ?? null
}

function getAppUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '')
}

// ==========================================
// CONNECT LINK — POST /builder/calendar/connect-link
// ==========================================
export const connectLink = authed
  .route({
    method: 'POST',
    path: '/builder/calendar/connect-link',
    summary: 'Create Google Calendar Connect Link',
  })
  .input(z.object({ projectId: z.string().uuid('projectId inválido').optional() }))
  .handler(async ({ input, context }) => {
    const { orgId } = builderOrg(context)
    const { projectId } = input

    // Se scoped a um projeto, ele precisa pertencer à org ativa.
    if (projectId) {
      const project = await database.builderProject.findFirst({
        where: { id: projectId, organizationId: orgId },
        select: { id: true },
      })
      if (!project) throw new ORPCError('NOT_FOUND', { message: 'Projeto não encontrado' })
    }

    const delegate = getCalendarConnection()
    if (!delegate) {
      console.warn(
        '[calendar/connect-link] CalendarConnection indisponível — tabela não provisionada',
      )
      throw new ORPCError('NOT_FOUND', {
        message:
          'CalendarConnection indisponível — tabela não provisionada (migration pendente)',
      })
    }

    const connectToken = `cal_${crypto.randomBytes(32).toString('hex')}`
    const connectTokenExpiresAt = new Date(Date.now() + CONNECT_TOKEN_TTL_MS)

    try {
      const conn = await delegate.create({
        data: {
          organizationId: orgId,
          builderProjectId: projectId ?? null,
          connectToken,
          connectTokenExpiresAt,
          status: 'PENDING',
        },
      })

      return ok({
        connectionId: conn.id,
        connectToken: conn.connectToken,
        expiresAt: conn.connectTokenExpiresAt,
        shareLink: `${getAppUrl()}/conectar-agenda/${conn.connectToken}`,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido'
      console.error('[calendar/connect-link] Falha:', err)
      throw new ORPCError('BAD_REQUEST', {
        message: `Erro ao criar link de conexão: ${message}`,
      })
    }
  })

// ==========================================
// STATUS — GET /builder/calendar/status/{projectId}
// ==========================================
export const status = authed
  .route({
    method: 'GET',
    path: '/builder/calendar/status/{projectId}',
    summary: 'Get Google Calendar Connection Status',
  })
  .input(z.object({ projectId: z.string().min(1, 'projectId obrigatório') }))
  .handler(async ({ input, context }) => {
    const { orgId } = builderOrg(context)

    const delegate = getCalendarConnection()
    if (!delegate) {
      console.warn('[calendar/status] CalendarConnection indisponível — retornando vazio')
      return ok({
        connected: false,
        status: null,
        calendarEmail: null,
        warning: 'CalendarConnection table not available',
      })
    }

    try {
      const conn = await delegate.findFirst({
        where: { builderProjectId: input.projectId, organizationId: orgId },
        orderBy: { createdAt: 'desc' },
      })

      if (!conn) {
        return ok({ connected: false, status: null, calendarEmail: null })
      }

      return ok({
        connectionId: conn.id,
        status: conn.status,
        connected: conn.status === 'CONNECTED',
        calendarEmail: conn.calendarEmail,
        expiresAt: conn.connectTokenExpiresAt,
      })
    } catch (err) {
      console.warn('[calendar/status] Leitura falhou:', err)
      return ok({
        connected: false,
        status: null,
        calendarEmail: null,
        warning: 'CalendarConnection read failed',
      })
    }
  })

// ==========================================
// DISCONNECT — DELETE /builder/calendar/{projectId}
// ==========================================
export const disconnect = authed
  .route({
    method: 'DELETE',
    path: '/builder/calendar/{projectId}',
    summary: 'Disconnect Google Calendar',
  })
  .input(z.object({ projectId: z.string().min(1, 'projectId obrigatório') }))
  .handler(async ({ input, context }) => {
    const { orgId } = builderOrg(context)
    const { projectId } = input

    // Ownership check — o projeto deve pertencer à org ativa.
    const project = await database.builderProject.findFirst({
      where: { id: projectId, organizationId: orgId },
      select: { id: true },
    })
    if (!project) throw new ORPCError('NOT_FOUND', { message: 'Projeto não encontrado' })

    let linksRevoked = 0
    let providerRemoved = 0

    // 1) Revoga o(s) link(s) público(s) do projeto (best-effort).
    const delegate = getCalendarConnection()
    if (delegate) {
      try {
        const res = await delegate.updateMany({
          where: {
            builderProjectId: projectId,
            organizationId: orgId,
            status: { not: 'REVOKED' },
          },
          data: { status: 'REVOKED', updatedAt: new Date() },
        })
        linksRevoked = res.count
      } catch (err) {
        console.warn(
          '[calendar/disconnect] Revoke de CalendarConnection falhou (não-fatal):',
          err,
        )
      }
    } else {
      console.warn(
        '[calendar/disconnect] CalendarConnection indisponível — pulando revoke do link',
      )
    }

    // 2) Hard-delete do provider google-calendar scoped ao projeto (derruba o
    //    refresh_token encriptado). Credencial org-level fica intacta.
    try {
      const res = await database.organizationProvider.deleteMany({
        where: {
          organizationId: orgId,
          category: ProviderCategory.AUXILIARY,
          provider: GOOGLE_CALENDAR_PROVIDER,
          builderProjectId: projectId,
        },
      })
      providerRemoved = res.count
    } catch (err) {
      console.warn(
        '[calendar/disconnect] Remoção do OrganizationProvider falhou (não-fatal):',
        err,
      )
    }

    // 3) Derruba o cache in-memory de access_token do resolver para este escopo.
    invalidateCalendarAccess(orgId, projectId)

    return ok({
      disconnected: true,
      linksRevoked,
      providerRemoved,
    })
  })

export const calendarActions = { connectLink, status, disconnect }
