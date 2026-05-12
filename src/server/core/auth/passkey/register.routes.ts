/**
 * Passkey — Register Routes
 *
 * Cobre o ciclo completo de registro de passkey para usuários autenticados:
 *   POST /passkey/register/options  → passkeyRegisterOptions
 *   POST /passkey/register/verify   → passkeyRegisterVerify
 *   GET  /passkey/list              → passkeyList
 *   DELETE /passkey/:passkeyId      → passkeyDelete
 *
 * Requer sessão ativa (authProcedure) e CSRF em todas as actions.
 */

import { z } from 'zod';
import { igniter } from '@/igniter';
import { database as db } from '@/server/services/database';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import type { AuthenticatorTransportFuture } from '@simplewebauthn/server';
import { authProcedure } from '../procedures/auth.procedure';
import { csrfProcedure } from '../procedures/csrf.procedure';
import { createAuditLog } from '../_shared/helpers';
import { getWebAuthnConfig, webauthnRegistrationResponseSchema } from './passkey.shared';

export const registerRoutes = {
  /**
   * Passkey Register Options - Gerar opções de registro de passkey
   */
  passkeyRegisterOptions: igniter.mutation({
    name: 'Passkey Register Options',
    path: '/passkey/register/options',
    method: 'POST',
    use: [authProcedure({ required: true }), csrfProcedure()],
    handler: async ({ context, response }) => {
      const user = context.auth?.session?.user;
      if (!user) return response.unauthorized('Authentication required');

      const existingCredentials = await db.passkeyCredential.findMany({
        where: { userId: user.id },
      });

      const { rpId: rpID } = getWebAuthnConfig();
      const options = await generateRegistrationOptions({
        rpName: process.env.APP_NAME || 'Quayer',
        rpID,
        userName: user.email,
        userDisplayName: user.name || user.email,
        excludeCredentials: existingCredentials.map(cred => ({
          id: cred.credentialId,
          transports: cred.transports as AuthenticatorTransportFuture[],
        })),
        authenticatorSelection: {
          residentKey: 'preferred',
          userVerification: 'preferred',
        },
      });

      await db.passkeyChallenge.deleteMany({
        where: { userId: user.id, type: 'registration' },
      });
      await db.passkeyChallenge.create({
        data: {
          challenge: options.challenge,
          userId: user.id,
          type: 'registration',
          expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        },
      });

      return response.success(options);
    },
  }),

  /**
   * Passkey Register Verify - Verificar e salvar credencial de passkey
   */
  passkeyRegisterVerify: igniter.mutation({
    name: 'Passkey Register Verify',
    path: '/passkey/register/verify',
    method: 'POST',
    use: [authProcedure({ required: true }), csrfProcedure()],
    body: z.object({ response: webauthnRegistrationResponseSchema, name: z.string().optional().default('Minha Passkey') }),
    handler: async ({ request, context, response }) => {
      const user = context.auth?.session?.user;
      if (!user) return response.unauthorized('Authentication required');

      const challenge = await db.passkeyChallenge.findFirst({
        where: { userId: user.id, type: 'registration', expiresAt: { gt: new Date() } },
        orderBy: { createdAt: 'desc' },
      });
      if (!challenge) return response.badRequest('Challenge não encontrado ou expirado');

      const { rpId: rpID, origin } = getWebAuthnConfig();

      const { verified, registrationInfo } = await verifyRegistrationResponse({
        response: request.body.response as any,
        expectedChallenge: challenge.challenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
      });

      if (!verified || !registrationInfo) return response.badRequest('Verificação de passkey falhou');

      const { credential } = registrationInfo;
      const created = await db.passkeyCredential.create({
        data: {
          userId: user.id,
          credentialId: credential.id,
          publicKey: Buffer.from(credential.publicKey),
          counter: BigInt(credential.counter),
          credentialDeviceType: registrationInfo.credentialDeviceType,
          credentialBackedUp: registrationInfo.credentialBackedUp,
          transports: credential.transports || [],
          name: request.body.name,
          aaguid: registrationInfo.aaguid,
        },
      });

      await db.passkeyChallenge.delete({ where: { id: challenge.id } });

      await createAuditLog('passkey.registered', user.id, request, {
        passkeyId: created.id,
        credentialId: credential.id,
        name: request.body.name,
        deviceType: registrationInfo.credentialDeviceType,
      }, user.currentOrgId);

      return response.success({ verified: true, credentialId: credential.id });
    },
  }),

  /**
   * Passkey List - Listar passkeys do usuário
   */
  passkeyList: igniter.query({
    name: 'Passkey List',
    path: '/passkey/list',
    // GET reads do not need CSRF (CSRF protects against forged state-changing
    // requests). Frontend doesn't send X-CSRF-Token on GET, so requiring it
    // here forced a 403. CSRF stays on the POST/PATCH/DELETE passkey routes.
    use: [authProcedure({ required: true })],
    handler: async ({ context, response }) => {
      const user = context.auth?.session?.user;
      if (!user) return response.unauthorized('Authentication required');

      const credentials = await db.passkeyCredential.findMany({
        where: { userId: user.id },
        select: {
          id: true,
          credentialId: true,
          credentialDeviceType: true,
          credentialBackedUp: true,
          transports: true,
          name: true,
          aaguid: true,
          createdAt: true,
          lastUsedAt: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      return response.success(credentials);
    },
  }),

  /**
   * Passkey Delete - Remover passkey do usuário
   */
  passkeyDelete: igniter.mutation({
    name: 'Passkey Delete',
    path: '/passkey/:passkeyId',
    method: 'DELETE',
    use: [authProcedure({ required: true }), csrfProcedure()],
    handler: async ({ request, context, response }) => {
      const user = context.auth?.session?.user;
      if (!user) return response.unauthorized('Authentication required');

      const paramsParse = z.object({ passkeyId: z.string().min(1) }).safeParse((request as any).params);
      if (!paramsParse.success) return response.badRequest('ID da passkey é obrigatório');
      const { passkeyId } = paramsParse.data;

      const credential = await db.passkeyCredential.findFirst({
        where: { id: passkeyId, userId: user.id },
      });
      if (!credential) return response.notFound('Passkey não encontrada');

      await db.passkeyCredential.delete({ where: { id: passkeyId } });

      await createAuditLog('passkey.deleted', user.id, request, {
        passkeyId,
        credentialId: credential.credentialId,
        name: credential.name,
      }, user.currentOrgId);

      return response.success({ deleted: true });
    },
  }),
};
