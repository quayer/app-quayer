/**
 * Rate Limit Procedure
 *
 * Procedure Igniter.js que aplica um RateLimiter antes do handler. Substitui o
 * bloco repetido em vários controllers de auth:
 *
 *   const rl = await someLimiter.check(getClientIdentifier(request));
 *   if (!rl.success) return response.status(429).json({ ... });
 *
 * Uso:
 *   use: [rateLimitProcedure({ limiter: authRateLimiter })]
 *   use: [rateLimitProcedure({ limiter: otpVerifyLoginRateLimiter, prefix: 'verify-login' })]
 *   use: [rateLimitProcedure({
 *           limiter: authRateLimiter,
 *           identifierFn: (req) => `${getClientIdentifier(req)}:${req.body?.email ?? ''}`,
 *        })]
 *
 * Para identifiers que dependem de campos do body (email, phone, etc.) use
 * `identifierFn`. Para o caso comum por IP basta passar `limiter`.
 *
 * Doc: `procedures/procedures.skill.md`
 */

import { igniter } from '@/igniter';
import { getClientIdentifier } from '../_shared/helpers';

export type RateLimiterLike = {
  check: (identifier: string) => Promise<{ success: boolean; retryAfter?: number }>;
};

export type RateLimitProcedureOptions = {
  /** Instância de RateLimiter (de `@/lib/rate-limit/rate-limiter`). */
  limiter: RateLimiterLike;
  /** Prefixo aplicado ao identifier (ex.: 'verify-magic'). Default: nenhum. */
  prefix?: string;
  /**
   * Função custom para extrair o identifier do request. Default:
   * `getClientIdentifier(request)` (IP, com fallback seguro em produção).
   */
  identifierFn?: (request: any) => string;
};

export const rateLimitProcedure = (options: RateLimitProcedureOptions) =>
  igniter.procedure({
    name: 'RateLimitProcedure',
    handler: async (_opts: Record<string, never> = {}, ctx): Promise<Record<string, never> | Response> => {
      const { request } = ctx;

      const baseId = options.identifierFn
        ? options.identifierFn(request)
        : getClientIdentifier(request);

      const identifier = options.prefix ? `${options.prefix}:${baseId}` : baseId;

      const result = await options.limiter.check(identifier);
      if (!result.success) {
        return Response.json(
          { error: 'Too many requests', retryAfter: result.retryAfter },
          { status: 429 },
        );
      }

      return {};
    },
  })();
