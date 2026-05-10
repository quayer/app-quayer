/**
 * Passkey — Conditional UI Routes
 *
 * Fluxo de autenticação "passkey conditional" (sem email explícito):
 *   POST /passkey/login/challenge          → passkeyConditionalChallenge
 *   POST /passkey/login/verify-conditional → passkeyConditionalVerify
 *
 * passkeyConditionalVerify usa `check2faAndIssueChallenge` + `finalizeLogin`
 * eliminando a duplicação com `passkeyLoginVerify`.
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

// Rate limiters IP-only (challenge não tem email no body)
const passkeyLoginChallengeLimiter = new RateLimiter({
  limit: 10, window: 600, prefix: 'passkey-login-challenge', failClosedInProduction: true,
});
const passkeyLoginVerifyCondLimiter = new RateLimiter({
  limit: 10, window: 600, prefix: 'passkey-login-verify-cond', failClosedInProduction: true,
});

export const conditionalRoutes = {
  passkeyConditionalChallenge: igniter.mutation({
    name: 'Passkey Conditional Challenge',
    path: '/passkey/login/challenge',
    method: 'POST',
    handler: async ({ request, response }) => {
      const clientIp = getClientIdentifier(request);
      const rl = await passkeyLoginChallengeLimiter.check(clientIp);
      if (!rl.success) {
        return response.status(429).json({ error: 'Too many requests', retryAfter: rl.retryAfter });
      }

      const options = await generateAuthenticationOptions({
        rpID: getWebAuthnConfig().rpId,
        allowCredentials: [],
        userVerification: 'preferred',
      });

      const challenge = await db.passkeyChallenge.create({
        data: {
          challenge: options.challenge,
          userId: null,
          email: null,
          type: 'conditional',
          expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        },
      });

      return response.success({ ...options, challengeId: challenge.id });
    },
  }),

  passkeyConditionalVerify: igniter.mutation({
    name: 'Passkey Conditional Verify',
    path: '/passkey/login/verify-conditional',
    method: 'POST',
    use: [csrfProcedure()],
    body: z.object({ response: webauthnAuthenticationResponseSchema, challengeId: z.string() }),
    handler: async ({ request, response }) => {
      const clientIp = getClientIdentifier(request);
      const rl = await passkeyLoginVerifyCondLimiter.check(clientIp);
      if (!rl.success) {
        return response.status(429).json({ error: 'Too many requests', retryAfter: rl.retryAfter });
      }

      const { body } = request;

      // 1. Find challenge
      const challenge = await db.passkeyChallenge.findFirst({
        where: { id: body.challengeId, type: 'conditional', expiresAt: { gt: new Date() } },
      });
      if (!challenge) return response.badRequest('Challenge inválido ou expirado');

      // 2. Find credential
      const credential = await db.passkeyCredential.findFirst({
        where: { credentialId: body.response.id },
        include: {
          user: {
            include: {
              organizations: {
                where: { isActive: true },
                include: { organization: true },
              },
            },
          },
        },
      });
      if (!credential) return response.badRequest('Passkey não reconhecida');

      const user = credential.user;

      // 3. Verify authentication response
      const { rpId: conditionalRpId, origin: conditionalOrigin } = getWebAuthnConfig();
      const { verified, authenticationInfo } = await verifyAuthenticationResponse({
        response: body.response as any,
        expectedChallenge: challenge.challenge,
        expectedOrigin: conditionalOrigin,
        expectedRPID: conditionalRpId,
        credential: {
          id: credential.credentialId,
          publicKey: new Uint8Array(credential.publicKey as Buffer),
          counter: Number(credential.counter),
          transports: credential.transports as AuthenticatorTransportFuture[],
        },
      });

      if (!verified) return response.badRequest('Autenticação com passkey falhou');

      // 4. Delete challenge and update credential (single-use guarantee)
      await db.passkeyChallenge.delete({ where: { id: challenge.id } });
      await db.passkeyCredential.update({
        where: { id: credential.id },
        data: { counter: BigInt(authenticationInfo.newCounter), lastUsedAt: new Date() },
      });

      // H-5: 2FA gate — passkey is first factor only; TOTP still required
      const twoFaPayload = await check2faAndIssueChallenge(user, request, 'passkey-conditional');
      if (twoFaPayload) return response.success(twoFaPayload);

      // Caminho feliz: emitir sessão + audit
      const result = await finalizeLogin({
        user,
        request,
        response,
        method: 'passkey-conditional',
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
