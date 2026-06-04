/**
 * GET /api/v1/calendar/connect/[token]
 *
 * Endpoint PÚBLICO (sem login) que resolve o estado de um link de conexão
 * do Google Calendar a partir do connectToken.
 *
 * Espelha o padrão de src/app/api/v1/instances/share/[token]/route.ts
 * (link público do WhatsApp): resolve por token, valida expiração e devolve
 * só dados não-sensíveis. O segredo OAuth (refresh_token) NUNCA passa por aqui —
 * ele vive encriptado em OrganizationProvider (provider='google-calendar').
 *
 * Defensivo: a tabela calendar_connections é nova e aditiva. Se a migration
 * ainda não tiver sido aplicada (delegate ou tabela ausentes), respondemos 404
 * em vez de derrubar o handler com 500.
 */

import { NextResponse } from 'next/server'

import { database } from '@/server/services/database'

export const runtime = 'nodejs'

interface RouteContext {
  params: Promise<{ token: string }>
}

function isExpired(expiresAt: Date | null): boolean {
  return !expiresAt || expiresAt.getTime() <= Date.now()
}

/**
 * Resolve o CalendarConnection pelo connectToken (@unique).
 *
 * Defensivo contra delegate/tabela ausentes: o acesso a
 * `database.calendarConnection` é via cast indexado para não quebrar o build
 * caso o client Prisma ainda não tenha sido regenerado com o novo modelo.
 * Qualquer falha (delegate undefined, tabela inexistente — Prisma P2021) vira null.
 */
async function findCalendarConnection(token: string) {
  const delegate = (database as unknown as Record<string, unknown>)['calendarConnection'] as
    | {
        findUnique: (args: unknown) => Promise<{
          id: string
          status: string
          calendarEmail: string | null
          connectTokenExpiresAt: Date
          organization: { name: string } | null
        } | null>
      }
    | undefined

  if (!delegate || typeof delegate.findUnique !== 'function') return null

  try {
    return await delegate.findUnique({
      where: { connectToken: token },
      select: {
        id: true,
        status: true,
        calendarEmail: true,
        connectTokenExpiresAt: true,
        organization: { select: { name: true } },
      },
    })
  } catch {
    // P2021 (tabela inexistente) ou qualquer erro de schema: trata como não encontrado.
    return null
  }
}

export async function GET(_request: Request, context: RouteContext): Promise<NextResponse> {
  const { token } = await context.params

  if (!token || typeof token !== 'string') {
    return NextResponse.json(
      { error: 'Link de conexão inválido' },
      { status: 400 },
    )
  }

  const connection = await findCalendarConnection(token)

  if (!connection) {
    return NextResponse.json(
      { error: 'Link de conexão não encontrado' },
      { status: 404 },
    )
  }

  // Link expirado e ainda não conectado: trata como expirado (mas NÃO esconde
  // um link já CONNECTED — esse permanece consultável para confirmar o sucesso).
  const expired = isExpired(connection.connectTokenExpiresAt)
  const effectiveStatus =
    expired && connection.status === 'PENDING' ? 'EXPIRED' : connection.status

  // A página pública lê `state` em minúsculas (connected/expired/pending).
  // Mantemos `status` (maiúsculo, contrato interno) e adicionamos `state`.
  const state =
    effectiveStatus === 'CONNECTED'
      ? 'connected'
      : effectiveStatus === 'EXPIRED' || effectiveStatus === 'REVOKED'
        ? 'expired'
        : 'pending'

  return NextResponse.json({
    data: {
      organizationName: connection.organization?.name ?? 'Organização',
      status: effectiveStatus,
      state,
      calendarEmail: connection.calendarEmail ?? undefined,
      expiresAt: connection.connectTokenExpiresAt.toISOString(),
    },
  })
}
