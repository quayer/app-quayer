/**
 * GET /api/v1/calendar/connect/[token]/oauth/start
 *
 * Endpoint PÚBLICO (sem login). Inicia o fluxo OAuth do Google Calendar para um
 * link de conexão (connectToken). Valida o token + expiração, gera um state CSRF,
 * grava-o em cookie httpOnly (junto com o connectToken atrelado) e redireciona
 * (302) para a tela de consentimento do Google.
 *
 * Padrão de CSRF idêntico ao login Google
 * (src/server/core/auth/oauth-google/oauth-google.controller.ts:67-126):
 * state aleatório de 32 bytes (64 hex), cookie httpOnly+SameSite=Lax de curta
 * duração, validado por timingSafeEqual no callback.
 *
 * O state carrega `${csrf}:${connectToken}` para que o callback (que NÃO recebe
 * o token na rota) saiba qual CalendarConnection marcar como CONNECTED. O cookie
 * httpOnly guarda o MESMO valor — o callback compara cookie vs. query param.
 *
 * Defensivo: tabela calendar_connections é nova/aditiva. Delegate/tabela ausentes
 * ⇒ 404 (não 500).
 */

import { NextResponse } from 'next/server'
import crypto from 'crypto'

import { database } from '@/server/services/database'
import { buildAuthUrl } from '@/lib/calendar/google-calendar-oauth'

export const runtime = 'nodejs'

const isProduction = process.env.NODE_ENV === 'production'

/** Cookie que guarda o state CSRF + connectToken. 10 min cobrem o round-trip. */
const STATE_COOKIE = 'oauth_calendar_state'
const STATE_COOKIE_MAX_AGE = 600

interface RouteContext {
  params: Promise<{ token: string }>
}

function isExpired(expiresAt: Date | null): boolean {
  return !expiresAt || expiresAt.getTime() <= Date.now()
}

/**
 * Resolve o CalendarConnection pelo connectToken. Defensivo contra delegate/tabela
 * ausentes (retorna null em qualquer falha de schema).
 */
async function findCalendarConnection(token: string) {
  const delegate = (database as unknown as Record<string, unknown>)['calendarConnection'] as
    | {
        findUnique: (args: unknown) => Promise<{
          id: string
          status: string
          connectTokenExpiresAt: Date
        } | null>
      }
    | undefined

  if (!delegate || typeof delegate.findUnique !== 'function') return null

  try {
    return await delegate.findUnique({
      where: { connectToken: token },
      select: { id: true, status: true, connectTokenExpiresAt: true },
    })
  } catch {
    return null
  }
}

export async function GET(_request: Request, context: RouteContext): Promise<NextResponse> {
  const { token } = await context.params

  if (!token || typeof token !== 'string') {
    return NextResponse.json({ error: 'Link de conexão inválido' }, { status: 400 })
  }

  const connection = await findCalendarConnection(token)

  if (!connection) {
    return NextResponse.json({ error: 'Link de conexão não encontrado' }, { status: 404 })
  }

  // Bloqueia início de OAuth se o link já expirou ou foi revogado.
  if (connection.status === 'REVOKED') {
    return NextResponse.json({ error: 'Link de conexão revogado' }, { status: 410 })
  }
  if (isExpired(connection.connectTokenExpiresAt) && connection.status !== 'CONNECTED') {
    return NextResponse.json({ error: 'Link de conexão expirado' }, { status: 410 })
  }

  // CSRF state: 32 bytes aleatórios + o connectToken atrelado.
  // Formato `${csrf}:${connectToken}` — o callback separa e valida ambos.
  const csrf = crypto.randomBytes(32).toString('hex')
  const state = `${csrf}:${token}`

  let authUrl: string
  try {
    authUrl = buildAuthUrl({ state })
  } catch (err) {
    // GOOGLE_CALENDAR_CLIENT_ID/REDIRECT_URI ausentes em runtime.
    console.error('[calendar/oauth/start] buildAuthUrl falhou:', err instanceof Error ? err.message : err)
    return NextResponse.json(
      { error: 'Integração de calendário não configurada' },
      { status: 503 },
    )
  }

  // 302 para o Google + cookie httpOnly com o state (one-shot, validado no callback).
  const res = NextResponse.redirect(authUrl, 302)
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: STATE_COOKIE_MAX_AGE,
  })
  return res
}
