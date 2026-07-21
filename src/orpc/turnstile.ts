/**
 * oRPC — enforcement Cloudflare Turnstile (equivalente a turnstileProcedure()).
 *
 * Porta mecânica de src/server/core/auth/procedures/turnstile.procedure.ts.
 * Mesmo comportamento: fail-open sem TURNSTILE_SECRET_KEY (dev); token
 * ausente em produção = 403 bot_detected; verificação Cloudflare com timeout
 * de 5s; timeout/erro = 503 em produção, fail-open fora dela.
 *
 * DIFERENÇA DE PLUMBING (semântica preservada): a procedure original lia o
 * token do body CRU antes da validação zod; aqui o campo
 * `cf-turnstile-response` entra como opcional no schema de input das actions
 * protegidas (o wire não muda — o client já envia esse campo no body) e o
 * handler chama enforceTurnstile() ANTES de qualquer outra coisa. Único
 * delta observável: body malformado responde 400 (validação) antes do 403
 * de turnstile — corner case sem consumidor conhecido.
 */
import { ORPCError } from '@orpc/server'

const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

function getRemoteIp(headers: Headers): string | undefined {
  const forwarded = headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  const realIp = headers.get('x-real-ip')
  if (realIp) return realIp
  return undefined
}

export async function enforceTurnstile(
  headers: Headers,
  turnstileToken: string | undefined,
): Promise<void> {
  const secretKey = process.env.TURNSTILE_SECRET_KEY

  // Fail-open: no secret key configured (dev environment)
  if (!secretKey) return

  if (!turnstileToken) {
    const isProduction = process.env.NODE_ENV === 'production'
    if (isProduction) {
      console.warn('[Turnstile] Missing cf-turnstile-response token in production')
      throw new ORPCError('FORBIDDEN', {
        message: 'Verificação anti-bot obrigatória.',
        data: { error: 'bot_detected' },
      })
    }
    return
  }

  const remoteIp = getRemoteIp(headers)

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000)

    const verifyResponse = await fetch(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        secret: secretKey,
        response: turnstileToken,
        ...(remoteIp ? { remoteip: remoteIp } : {}),
      }).toString(),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    const result = (await verifyResponse.json()) as { success: boolean; 'error-codes'?: string[] }

    if (!result.success) {
      console.warn('[Turnstile] Verification failed:', result['error-codes'])
      throw new ORPCError('FORBIDDEN', {
        message: 'Verificação anti-bot falhou. Tente novamente.',
        data: { error: 'bot_detected' },
      })
    }
  } catch (error: unknown) {
    if (error instanceof ORPCError) throw error
    const isProduction = process.env.NODE_ENV === 'production'
    if (error instanceof DOMException && error.name === 'AbortError') {
      if (isProduction) {
        throw new ORPCError('SERVICE_UNAVAILABLE', {
          status: 503,
          message: 'Verificação anti-bot indisponível. Tente novamente.',
          data: { error: 'verification_unavailable' },
        })
      }
      console.warn('[Turnstile] Cloudflare API timeout (5s), failing open in non-production')
    } else {
      if (isProduction) {
        throw new ORPCError('SERVICE_UNAVAILABLE', {
          status: 503,
          message: 'Erro na verificação anti-bot. Tente novamente.',
          data: { error: 'verification_error' },
        })
      }
      console.warn('[Turnstile] Verification error, failing open in non-production:', error)
    }
  }
}
