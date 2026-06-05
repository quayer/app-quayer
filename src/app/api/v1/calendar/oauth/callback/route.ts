/**
 * GET /api/v1/calendar/oauth/callback
 *
 * Endpoint PÚBLICO (sem login). Callback do OAuth do Google Calendar.
 *
 * Fluxo:
 *  1. Lê ?code & ?state. Valida o state contra o cookie httpOnly (timingSafeEqual),
 *     exatamente como o login Google
 *     (src/server/core/auth/oauth-google/oauth-google.controller.ts:99-126).
 *  2. Extrai o connectToken embutido no state (`${csrf}:${connectToken}`) e
 *     resolve o CalendarConnection (org + escopo de projeto).
 *  3. Troca code → tokens (exchangeCode). ATENÇÃO: refresh_token só vem na 1ª
 *     autorização; sem ele não há como persistir credencial reutilizável.
 *  4. Obtém o email da conta Google (getCalendarEmail).
 *  5. ENCRIPTA o refresh_token (crypto.encrypt) e faz UPSERT em OrganizationProvider
 *     (category AUXILIARY, provider 'google-calendar', escopo org [+ builderProjectId]),
 *     seguindo o padrão de providers.repository.ts:102-129.
 *  6. Marca o CalendarConnection como CONNECTED (+ calendarEmail) e invalida o
 *     cache do resolver.
 *  7. 302 → /conectar-agenda/[token]?connected=1.
 *
 * Segurança: nenhum token (access/refresh/code) é exposto em resposta nem em URL.
 * O refresh_token só existe encriptado em OrganizationProvider.credentials.
 *
 * Defensivo: tabela calendar_connections nova/aditiva — delegate/tabela ausentes
 * ⇒ redireciona com ?error em vez de 500.
 */

import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { Prisma, ProviderCategory } from '@prisma/client'

import { database } from '@/server/services/database'
import { encryptToken } from '@/server/ai-module/ai-agents/infra/calendar-crypto.service'
import {
  exchangeCode,
  getCalendarEmail,
} from '@/lib/calendar/google-calendar-oauth'
import { invalidateCalendarAccess } from '@/lib/calendar/calendar-credential-resolver'
import { GOOGLE_CALENDAR_PROVIDER } from '@/lib/calendar/types'

export const runtime = 'nodejs'

const isProduction = process.env.NODE_ENV === 'production'

const STATE_COOKIE = 'oauth_calendar_state'

/** Base absoluta para os redirects finais (página pública de conexão). */
function appBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || 'https://app.quayer.com'
}

/** Redireciona para a página de conexão, limpando o cookie de state (one-shot). */
function redirectToConnectPage(
  token: string | null,
  query: Record<string, string>,
): NextResponse {
  const base = appBaseUrl()
  const path = token ? `/conectar-agenda/${encodeURIComponent(token)}` : '/conectar-agenda'
  const url = new URL(path, base)
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v)

  const res = NextResponse.redirect(url, 302)
  res.cookies.set(STATE_COOKIE, '', {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
  return res
}

/** Lê o cookie httpOnly de state CSRF a partir do header Cookie. */
function readStateCookie(request: Request): string {
  const cookieHeader = request.headers.get('cookie') || ''
  return (
    cookieHeader
      .split(';')
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${STATE_COOKIE}=`))
      ?.split('=')
      .slice(1)
      .join('=') ?? ''
  )
}

/** Comparação constant-time. Rejeita imediatamente se comprimentos diferem. */
function statesMatch(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false
  return crypto.timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'))
}

// ── Delegate defensivo (tabela nova/aditiva) ─────────────────────────────────

interface CalendarConnectionRow {
  id: string
  status: string
  organizationId: string
  builderProjectId: string | null
  connectTokenExpiresAt: Date
}

function calendarConnectionDelegate():
  | {
      findUnique: (args: unknown) => Promise<CalendarConnectionRow | null>
      update: (args: unknown) => Promise<unknown>
    }
  | null {
  const delegate = (database as unknown as Record<string, unknown>)['calendarConnection'] as
    | {
        findUnique: (args: unknown) => Promise<CalendarConnectionRow | null>
        update: (args: unknown) => Promise<unknown>
      }
    | undefined
  if (!delegate || typeof delegate.findUnique !== 'function') return null
  return delegate
}

async function findConnectionByToken(
  delegate: NonNullable<ReturnType<typeof calendarConnectionDelegate>>,
  token: string,
): Promise<CalendarConnectionRow | null> {
  try {
    return await delegate.findUnique({
      where: { connectToken: token },
      select: {
        id: true,
        status: true,
        organizationId: true,
        builderProjectId: true,
        connectTokenExpiresAt: true,
      },
    })
  } catch {
    return null
  }
}

// ── Persistência da credencial OAuth ─────────────────────────────────────────

/**
 * UPSERT do OrganizationProvider com o refresh_token encriptado.
 *
 * Segue providers.repository.ts:102-129: a unique key é
 * (organizationId, category, provider, builderProjectId, priority); para o escopo
 * de organização usamos builderProjectId='' no WHERE do upsert (mesmo workaround
 * do repository) e builderProjectId=null no create. Override de projeto usa o id real.
 */
async function persistCalendarProvider(params: {
  organizationId: string
  builderProjectId: string | null
  encryptedRefreshToken: string
  calendarEmail: string
}): Promise<void> {
  const { organizationId, builderProjectId, encryptedRefreshToken, calendarEmail } = params

  const credentials = {
    refreshToken: encryptedRefreshToken,
    calendarEmail,
  } as Prisma.InputJsonValue

  await database.organizationProvider.upsert({
    where: {
      organizationId_category_provider_builderProjectId_priority: {
        organizationId,
        category: ProviderCategory.AUXILIARY,
        provider: GOOGLE_CALENDAR_PROVIDER,
        builderProjectId: builderProjectId ?? '',
        priority: 0,
      },
    },
    create: {
      organizationId,
      category: ProviderCategory.AUXILIARY,
      provider: GOOGLE_CALENDAR_PROVIDER,
      name: 'Google Calendar',
      isActive: true,
      isPrimary: true,
      priority: 0,
      builderProjectId,
      credentials,
    },
    update: {
      credentials,
      isActive: true,
      updatedAt: new Date(),
    },
  })
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state') ?? ''
  const oauthError = url.searchParams.get('error')

  // Token embutido no state (`${csrf}:${connectToken}`) — usado para o redirect
  // mesmo em caminhos de erro, quando possível.
  const tokenFromState = state.includes(':') ? state.slice(state.indexOf(':') + 1) : null

  // Usuário negou consentimento no Google (?error=access_denied).
  if (oauthError) {
    return redirectToConnectPage(tokenFromState, { error: oauthError })
  }

  if (!code || !state) {
    return redirectToConnectPage(tokenFromState, { error: 'missing_params' })
  }

  // ── Validação de state CSRF (constant-time vs. cookie httpOnly) ──────────────
  const cookieState = readStateCookie(request)
  if (!statesMatch(cookieState, state)) {
    console.error('[calendar/oauth/callback] State mismatch — possível CSRF')
    return redirectToConnectPage(tokenFromState, { error: 'invalid_state' })
  }

  const connectToken = tokenFromState
  if (!connectToken) {
    return redirectToConnectPage(null, { error: 'invalid_state' })
  }

  // ── Resolver o CalendarConnection (defensivo p/ tabela ausente) ─────────────
  const delegate = calendarConnectionDelegate()
  if (!delegate) {
    return redirectToConnectPage(connectToken, { error: 'not_available' })
  }

  const connection = await findConnectionByToken(delegate, connectToken)
  if (!connection) {
    return redirectToConnectPage(connectToken, { error: 'not_found' })
  }
  if (connection.status === 'REVOKED') {
    return redirectToConnectPage(connectToken, { error: 'revoked' })
  }

  try {
    // ── Troca code → tokens ──────────────────────────────────────────────────
    const tokens = await exchangeCode(code)

    // refresh_token só vem na 1ª autorização (access_type=offline + prompt=consent).
    // Sem ele não há credencial reutilizável: pedir reautorização.
    if (!tokens.refreshToken) {
      console.error('[calendar/oauth/callback] sem refresh_token (re-auth sem prompt=consent?)')
      return redirectToConnectPage(connectToken, { error: 'no_refresh_token' })
    }

    // ── Email da conta Google ────────────────────────────────────────────────
    let calendarEmail: string
    try {
      calendarEmail = await getCalendarEmail(tokens.accessToken)
    } catch {
      // Email é não-crítico para o storage; segue com placeholder se falhar.
      calendarEmail = ''
    }

    // ── Encripta refresh_token e persiste OrganizationProvider (QH-12: AES-256-GCM) ─
    const encryptedRefreshToken = encryptToken(tokens.refreshToken)
    await persistCalendarProvider({
      organizationId: connection.organizationId,
      builderProjectId: connection.builderProjectId,
      encryptedRefreshToken,
      calendarEmail,
    })

    // ── Marca o CalendarConnection como CONNECTED ────────────────────────────
    try {
      await delegate.update({
        where: { id: connection.id },
        data: {
          status: 'CONNECTED',
          calendarEmail: calendarEmail || null,
          updatedAt: new Date(),
        },
      })
    } catch (err) {
      // Provider já foi persistido com sucesso; falha aqui não deve perder a credencial.
      console.warn('[calendar/oauth/callback] update CalendarConnection falhou (não-fatal):', err)
    }

    // ── Invalida cache do resolver para refletir a nova credencial ───────────
    invalidateCalendarAccess(
      connection.organizationId,
      connection.builderProjectId ?? undefined,
    )

    return redirectToConnectPage(connectToken, { connected: '1' })
  } catch (err) {
    // Não logar detalhes em produção (podem conter PII do provedor).
    if (!isProduction) {
      console.error('[calendar/oauth/callback] falha:', err instanceof Error ? err.message : err)
    } else {
      console.error('[calendar/oauth/callback] falha no fluxo OAuth')
    }
    return redirectToConnectPage(connectToken, { error: 'oauth_failed' })
  }
}
