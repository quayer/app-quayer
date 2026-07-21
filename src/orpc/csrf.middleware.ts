/**
 * oRPC — middleware CSRF equivalente a csrfProcedure() (defaults)
 *
 * Porta mecânica de src/server/core/auth/procedures/csrf.procedure.ts.
 * REUSA os mesmos utilitários do app (@/lib/auth/csrf): validateCsrfToken
 * (comparação em tempo constante), extração de header x-csrf-token e do
 * cookie csrf_token (double-submit pattern).
 *
 * Semântica preservada:
 *   - Bypass automático quando a request traz header x-api-key
 *     (allowApiKey: true, o default da procedure original — auth stateless
 *     sem cookies não tem como participar do double-submit).
 *   - Falha = 403 (no Igniter: Response.json({error}, {status:403}); aqui:
 *     ORPCError('FORBIDDEN') que o OpenAPIHandler converte em 403).
 *   - Sucesso não estende o contexto (a procedure original retornava {}).
 */
import { ORPCError } from '@orpc/server'
import {
  validateCsrfToken,
  getCsrfTokenFromHeader,
  getCsrfTokenFromCookie,
} from '@/lib/auth/csrf'
import { base } from './base'

/** Equivalente a `use: [csrfProcedure()]` (allowApiKey: true). */
export const requireCsrf = base.middleware(async ({ context, next }) => {
  const { headers } = context

  // Bypass CSRF para API keys (autenticação stateless, sem cookie)
  if (headers.get('x-api-key')) {
    return next()
  }

  // Os utilitários originais recebem um RequestLike ({ headers: { get } }) —
  // o contexto oRPC já carrega os Headers, então o objeto é montado direto.
  const requestLike = { headers }
  const headerToken = getCsrfTokenFromHeader(requestLike)
  const cookieToken = getCsrfTokenFromCookie(requestLike)

  if (!validateCsrfToken(headerToken, cookieToken)) {
    throw new ORPCError('FORBIDDEN', {
      message: 'Token CSRF inválido ou ausente. Recarregue a página e tente novamente.',
    })
  }

  return next()
})
