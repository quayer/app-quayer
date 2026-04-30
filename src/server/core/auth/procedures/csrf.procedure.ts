/**
 * CSRF Procedure
 *
 * Procedure Igniter.js que valida CSRF token em mutations sensíveis.
 * Composável com authProcedure: use: [authProcedure(), csrfProcedure()]
 */

import { igniter } from '@/igniter';
import {
  validateCsrfToken,
  getCsrfTokenFromHeader,
  getCsrfTokenFromCookie,
} from '@/lib/auth/csrf';

type CsrfProcedureOptions = {
  /** Se true, bypass CSRF para requests com API key (stateless auth) */
  allowApiKey?: boolean;
};

/**
 * Procedure que valida CSRF token comparando header X-CSRF-Token com cookie csrf_token.
 *
 * Bypass automático para:
 * - Requests com header X-API-Key (autenticação stateless, sem cookies)
 */
export const csrfProcedure = igniter.procedure({
  name: 'CsrfProcedure',
  handler: async (
    options: CsrfProcedureOptions = { allowApiKey: true },
    ctx
  ): Promise<Record<string, never> | Response> => {
    const { request } = ctx;
    const { allowApiKey = true } = options;

    // Bypass CSRF para API keys (autenticação stateless, sem cookie)
    if (allowApiKey && request.headers.get('x-api-key')) {
      return {};
    }

    const headerToken = getCsrfTokenFromHeader(request);
    const cookieToken = getCsrfTokenFromCookie(request);

    if (!validateCsrfToken(headerToken, cookieToken)) {
      return Response.json(
        { error: 'Token CSRF inválido ou ausente. Recarregue a página e tente novamente.' },
        { status: 403 }
      );
    }

    // Validação OK — retorna contexto vazio (não estende contexto)
    return {};
  },
});
