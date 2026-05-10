/**
 * Passkey — Login Routes
 *
 * Fluxo de autenticação com email explícito:
 *   POST /passkey/login/options  → passkeyLoginOptions
 *   POST /passkey/login/verify   → passkeyLoginVerify
 *
 * passkeyLoginVerify usa `check2faAndIssueChallenge` + `finalizeLogin` para
 * eliminar a duplicação com `passkeyConditionalVerify`.
 */

import { z } from 'zod';
import { igniter } from '@/igniter';
import { database as db } from '@/server/services/database';
import {
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import type { AuthenticatorTransportFuture } from '@simplewebauthn/server';
import { csrfProcedure } from '../procedures/csrf.procedure';
import { rateLimitProcedure } from '../procedures/rate-limit.procedure';
import { getClientIdentifier } from '../_shared/helpers';
import { check2faAndIssueChallenge } from '../_shared/two-factor-gate';
import { finalizeLogin } from '../_shared/finalize-login';
import { RateLimiter } from '@/lib/rate-limit/rate-limiter';
import { getWebAuthnConfig, webauthnAuthenticationResponseSchema } from './passkey.shared';

// Rate limiters por email+IP (10 req / 10 min)
const passkeyLoginOptionsLimiter = new RateLimiter({
  limit: 10, window: 600, prefix: 'passkey-login-options', failClosedInProduction: true,
});
const passkeyLoginVerifyLimiter = new RateLimiter({
  limit: 10, window: 600, prefix: 'passkey-login-verify', failClosedInProduction: true,
});

export const loginRoutes = {
  /**
   * Passkey Login Options - Gerar opções de autenticação via passkey
   */
  passkeyLoginOptions: igniter.mutation({
    name: 'Passkey Login Options',
    path: '/passkey/login/options',
    method: 'POST',
    body: z.object({ email: z.string().email() }),
    handler: async ({ request, response }) => {
      const { email } = request.body;
      const clientIp = getClientIdentifier(request);
      // Rate limit por email+IP (preferido) ou só IP como fallback
      const rlIdentifier = email ? `${email}:${clientIp}` : clientIp;
      const rl = await passkeyLoginOptionsLimiter.check(rlIdentifier);
      if (!rl.success) {
        return response.status(429).json({ error: 'Too many requests', retryAfter: rl.retryAfter });
      }

      const user = await db.user.findUnique({
        where: { email },
        include: { passkeyCredentials: true },
      });

      if (!user || user.passkeyCredentials.length === 0) {
        return response.badRequest('Não foi possível completar a autenticação com passkey');
      }

      const { rpId: rpID } = getWebAuthnConfig();
      const options = await generateAuthenticationOptions({
        rpID,
        allowCredentials: user.passkeyCredentials.map(cred => ({
          id: cred.credentialId,
          transports: cred.transports as AuthenticatorTransportFuture[],
        })),
        userVerification: 'preferred',
      });

      await db.passkeyChallenge.deleteMany({
        where: { userId: user.id, type: 'authentication' },
      });
      await db.passkeyChallenge.create({
        data: {
          challenge: options.challenge,
          userId: user.id,
          email: user.email,
          type: 'authentication',
          expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        },
      });

      return response.success({ ...options, userId: user.id });
    },
  }),

  /**
   * Passkey Login Verify - Verificar autenticação via passkey e criar sessão
   */
  passkeyLoginVerify: igniter.mutation({
    name: 'Passkey Login Verify',
    path: '/passkey/login/verify',
    method: 'POST',
    use: [csrfProcedure()],
    body: z.object({ email: z.string().email(), response: webauthnAuthenticationResponseSchema }),
    handler: async ({ request, response }) => {
      const { email } = request.body;
      const clientIp = getClientIdentifier(request);
      // Rate limit por email+IP (preferido) ou só IP como fallback
      const rlIdentifier = email ? `${email}:${clientIp}` : clientIp;
      const rl = await passkeyLoginVerifyLimiter.check(rlIdentifier);
      if (!rl.success) {
        return response.status(429).json({ error: 'Too many requests', retryAfter: rl.retryAfter });
      }

      const user = await db.user.findUnique({
        where: { email },
        include: {
          passkeyCredentials: true,
          organizations: {
            where: { isActive: true },
            include: { organization: true },
            take: 1,
          },
        },
      });

      if (!user) return response.badRequest('Não foi possível completar a autenticação com passkey');

      const challenge = await db.passkeyChallenge.findFirst({
        where: { userId: user.id, type: 'authentication', expiresAt: { gt: new Date() } },
        orderBy: { createdAt: 'desc' },
      });
      if (!challenge) return response.badRequest('Challenge não encontrado ou expirado');

      const credential = user.passkeyCredentials.find(
        c => c.credentialId === request.body.response.id
      );
      if (!credential) return response.badRequest('Passkey não encontrada');

      const { rpId: rpID, origin } = getWebAuthnConfig();

      const { verified, authenticationInfo } = await verifyAuthenticationResponse({
        response: request.body.response as any,
        expectedChallenge: challenge.challenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
        credential: {
          id: credential.credentialId,
          publicKey: new Uint8Array(credential.publicKey as Buffer),
          counter: Number(credential.counter),
          transports: credential.transports as AuthenticatorTransportFuture[],
        },
      });

      if (!verified) return response.badRequest('Autenticação com passkey falhou');

      await db.passkeyCredential.update({
        where: { id: credential.id },
        data: { counter: BigInt(authenticationInfo.newCounter), lastUsedAt: new Date() },
      });
      await db.passkeyChallenge.delete({ where: { id: challenge.id } });

      // H-5: 2FA gate — passkey is first factor only; TOTP still required
      const twoFaPayload = await check2faAndIssueChallenge(user, request, 'passkey');
      if (twoFaPayload) return response.success(twoFaPayload);

      // Caminho feliz: emitir sessão + audit
      const result = await finalizeLogin({
        user,
        request,
        response,
        method: 'passkey',
        auditEvents: [{ action: 'user.login', metadata: { passkeyId: credential.id } }],
      });

      if (result.blocked) {
        return Response.json(
          { error: 'Login bloqueado por política de segurança. Contate o administrador.' },
          { status: 403 }
        );
      }

      return response.success({
        needsOnboarding: !user.onboardingCompleted,
        user: { id: user.id, email: user.email, name: user.name, role: user.role },
      });
    },
  }),
};
