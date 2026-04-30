/**
 * Turnstile Procedure
 *
 * Procedure Igniter.js que valida tokens Cloudflare Turnstile no servidor.
 * Composável com outras procedures: use: [turnstileProcedure(), authProcedure()]
 *
 * Comportamento:
 * - Se TURNSTILE_SECRET_KEY não configurado: skip validação (fail-open para dev)
 * - Se token ausente em prod: retorna 403 { error: 'bot_detected' }
 * - Se validação Cloudflare retorna success=false: retorna 403
 * - Timeout de 5s no fetch — se timeout: fail-open (aceitar request)
 */

import { igniter } from '@/igniter';

const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

type TurnstileProcedureOptions = Record<string, never>;

/**
 * Extracts the client IP from the request for Turnstile remoteip parameter.
 */
function getRemoteIp(request: { headers: { get?: (key: string) => string | null } }): string | undefined {
  const headers = request?.headers;
  if (!headers || typeof headers.get !== 'function') return undefined;

  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();

  const realIp = headers.get('x-real-ip');
  if (realIp) return realIp;

  return undefined;
}

export const turnstileProcedure = igniter.procedure({
  name: 'TurnstileProcedure',
  handler: async (
    _options: TurnstileProcedureOptions = {},
    ctx
  ): Promise<Record<string, never> | Response> => {
    const { request } = ctx;

    const secretKey = process.env.TURNSTILE_SECRET_KEY;

    // Fail-open: no secret key configured (dev environment)
    if (!secretKey) {
      return {};
    }

    // Extract turnstile token from request body
    const turnstileToken: string | undefined = request.body?.['cf-turnstile-response'];

    // If token is missing in production, block the request
    if (!turnstileToken) {
      const isProduction = process.env.NODE_ENV === 'production';
      if (isProduction) {
        console.warn('[TurnstileProcedure] Missing cf-turnstile-response token in production');
        return Response.json(
          { error: 'bot_detected', message: 'Verificação anti-bot obrigatória.' },
          { status: 403 }
        );
      }
      // In non-production with key configured but no token: fail-open
      return {};
    }

    // Verify token with Cloudflare
    const remoteIp = getRemoteIp(request);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const verifyResponse = await fetch(TURNSTILE_VERIFY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          secret: secretKey,
          response: turnstileToken,
          ...(remoteIp ? { remoteip: remoteIp } : {}),
        }).toString(),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const result = await verifyResponse.json() as { success: boolean; 'error-codes'?: string[] };

      if (!result.success) {
        console.warn('[TurnstileProcedure] Verification failed:', result['error-codes']);
        return Response.json(
          { error: 'bot_detected', message: 'Verificação anti-bot falhou. Tente novamente.' },
          { status: 403 }
        );
      }

      // Verification successful
      return {};
    } catch (error: unknown) {
      const isProduction = process.env.NODE_ENV === 'production';
      if (error instanceof DOMException && error.name === 'AbortError') {
        if (isProduction) {
          return Response.json(
            { error: 'verification_unavailable', message: 'Verificação anti-bot indisponível. Tente novamente.' },
            { status: 503 }
          );
        }
        console.warn('[TurnstileProcedure] Cloudflare API timeout (5s), failing open in non-production');
      } else {
        if (isProduction) {
          return Response.json(
            { error: 'verification_error', message: 'Erro na verificação anti-bot. Tente novamente.' },
            { status: 503 }
          );
        }
        console.error('[TurnstileProcedure] Error verifying token, failing open in non-production:', error);
      }
      return {};
    }
  },
});
