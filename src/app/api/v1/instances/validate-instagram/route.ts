/**
 * Validate Instagram Credentials API Route
 *
 * Verifica se um Access Token e Instagram Account ID são válidos
 * consultando a Meta Graph API.
 *
 * POST /api/v1/instances/validate-instagram
 * Body: { accessToken: string, instagramAccountId: string, pageId?: string }
 * Returns: { valid: true, username, name, profilePictureUrl } | { valid: false, error: string }
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyAccessToken } from '@/lib/auth/jwt'

const META_GRAPH_VERSION = 'v20.0'

export async function POST(request: NextRequest) {
  // Authentication check — follow same pattern as agents/[id]/playground
  const token = request.cookies.get('accessToken')?.value
  if (!token) {
    return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 })
  }

  const payload = verifyAccessToken(token)
  if (!payload || !payload.userId) {
    return NextResponse.json({ error: 'Token invalido' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { accessToken, instagramAccountId, pageId } = body as {
      accessToken: string
      instagramAccountId: string
      pageId?: string
    }

    // Validate required fields
    if (!accessToken || !instagramAccountId) {
      return NextResponse.json(
        { valid: false, error: 'Access Token e Instagram Account ID são obrigatórios' },
        { status: 400 }
      )
    }

    if (typeof accessToken !== 'string' || typeof instagramAccountId !== 'string') {
      return NextResponse.json(
        { valid: false, error: 'Access Token e Instagram Account ID devem ser strings' },
        { status: 400 }
      )
    }

    // Call Meta Graph API to validate the Instagram Business Account
    const graphUrl = new URL(
      `https://graph.facebook.com/${META_GRAPH_VERSION}/${encodeURIComponent(instagramAccountId)}`
    )
    graphUrl.searchParams.set('fields', 'name,username,profile_picture_url')
    graphUrl.searchParams.set('access_token', accessToken)

    const graphResponse = await fetch(graphUrl.toString(), {
      method: 'GET',
      headers: { Accept: 'application/json' },
      // Timeout via AbortController — Meta API can be slow
      signal: AbortSignal.timeout(10_000),
    })

    const graphData = await graphResponse.json().catch(() => ({}))

    if (!graphResponse.ok) {
      const errorMessage =
        (graphData as { error?: { message?: string } })?.error?.message ||
        'Credenciais inválidas'

      console.error('[validate-instagram] Meta Graph API error:', {
        status: graphResponse.status,
        instagramAccountId,
        error: errorMessage,
      })

      return NextResponse.json({ valid: false, error: errorMessage }, { status: 200 })
    }

    const account = graphData as {
      id?: string
      name?: string
      username?: string
      profile_picture_url?: string
    }

    return NextResponse.json({
      valid: true,
      username: account.username ?? null,
      name: account.name ?? null,
      profilePictureUrl: account.profile_picture_url ?? null,
    })
  } catch (error: unknown) {
    const isAbort =
      error instanceof Error && error.name === 'TimeoutError'

    if (isAbort) {
      console.error('[validate-instagram] Meta Graph API timeout')
      return NextResponse.json(
        { valid: false, error: 'Tempo limite excedido ao contatar a Meta Graph API' },
        { status: 200 }
      )
    }

    const message = error instanceof Error ? error.message : 'Erro interno ao validar credenciais'
    console.error('[validate-instagram] Error:', error)
    return NextResponse.json({ valid: false, error: message }, { status: 500 })
  }
}
