/**
 * Auth WebAuthn passkey flows
 *
 * Extraido do monolito auth.controller.ts. Contratos preservados.
 */

import { igniter } from "@/igniter";
import { database as db } from "@/server/services/database";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import type { AuthenticatorTransportFuture } from "@simplewebauthn/server";
import { z } from "zod";
import { normalizePhone, sendWhatsAppOTP } from "@/lib/uaz/whatsapp-otp";
import { hashPassword, verifyPassword, generateOTPCode, generateRecoveryCodes } from "@/lib/auth/bcrypt";
import { signAccessToken, signRefreshToken, verifyRefreshToken, getExpirationDate, signMagicLinkToken, verifyMagicLinkToken } from "@/lib/auth/jwt";
import { authProcedure } from "../procedures/auth.procedure";
import { csrfProcedure } from "../procedures/csrf.procedure";
import { turnstileProcedure } from "../procedures/turnstile.procedure";
import { UserRole, OrganizationRole } from "@/lib/auth/roles";
import { emailService } from "@/lib/email";
import { authRateLimiter, RateLimiter } from "@/lib/rate-limit/rate-limiter";
import { checkOtpRateLimit } from "@/lib/rate-limit/otp-rate-limit";

// Rate limiters para fluxos publicos de passkey login (10 req / 10 min por IP)
const passkeyLoginOptionsLimiter = new RateLimiter({ limit: 10, window: 600, prefix: 'passkey-login-options' });
const passkeyLoginVerifyLimiter = new RateLimiter({ limit: 10, window: 600, prefix: 'passkey-login-verify' });
const passkeyLoginChallengeLimiter = new RateLimiter({ limit: 10, window: 600, prefix: 'passkey-login-challenge' });
const passkeyLoginVerifyCondLimiter = new RateLimiter({ limit: 10, window: 600, prefix: 'passkey-login-verify-cond' });

// Schema WebAuthn — estrutura minima validada (payload completo repassado a @simplewebauthn/server)
const webauthnRegistrationResponseSchema = z.object({
  id: z.string(),
  rawId: z.string(),
  response: z.object({
    clientDataJSON: z.string(),
    attestationObject: z.string(),
    transports: z.array(z.string()).optional(),
  }).passthrough(),
  type: z.literal('public-key'),
  clientExtensionResults: z.record(z.any()).optional(),
  authenticatorAttachment: z.string().optional(),
}).passthrough();

const webauthnAuthenticationResponseSchema = z.object({
  id: z.string(),
  rawId: z.string(),
  response: z.object({
    clientDataJSON: z.string(),
    authenticatorData: z.string(),
    signature: z.string(),
    userHandle: z.string().optional(),
  }).passthrough(),
  type: z.literal('public-key'),
  clientExtensionResults: z.record(z.any()).optional(),
  authenticatorAttachment: z.string().optional(),
}).passthrough();
import { generateCsrfToken, setCsrfCookie, clearCsrfCookie } from "@/lib/auth/csrf";
import { getIpGeolocation } from "@/lib/geocoding/ip-geolocation";
import { encrypt, decrypt } from "@/lib/crypto";
import * as OTPAuth from "otpauth";
import QRCode from "qrcode";
import {
  getClientIdentifier, createAuditLog, appBaseUrl, dashboardUrl, isProduction,
  setAuthCookies, clearAuthCookies, sign2faChallenge, verify2faChallenge,
  getChallengeAttempts, incrementChallengeAttempts, MAX_2FA_ATTEMPTS,
  parseDeviceName, registerDeviceSession, autoJoinByVerifiedDomain,
} from "../_shared/helpers";

export const passkeyController = igniter.controller({
  name: "auth-passkey",
  path: "/auth",
  description: "Auth WebAuthn passkey flows",
  actions: {
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

        const rpID = process.env.RP_ID || 'localhost';
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

        const origin = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
        const rpID = process.env.RP_ID || 'localhost';

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
      use: [authProcedure({ required: true }), csrfProcedure()],
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
          return response.badRequest('Nenhuma passkey registrada para este email');
        }

        const rpID = process.env.RP_ID || 'localhost';
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

        if (!user) return response.badRequest('Usuário não encontrado');

        const challenge = await db.passkeyChallenge.findFirst({
          where: { userId: user.id, type: 'authentication', expiresAt: { gt: new Date() } },
          orderBy: { createdAt: 'desc' },
        });
        if (!challenge) return response.badRequest('Challenge não encontrado ou expirado');

        const credential = user.passkeyCredentials.find(
          c => c.credentialId === request.body.response.id
        );
        if (!credential) return response.badRequest('Passkey não encontrada');

        const origin = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
        const rpID = process.env.RP_ID || 'localhost';

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

        const currentOrgId = user.currentOrgId || user.organizations[0]?.organizationId;
        const currentOrgRelation = user.organizations.find(o => o.organizationId === currentOrgId);

        const accessToken = signAccessToken({
          userId: user.id,
          email: user.email,
          role: user.role as UserRole,
          currentOrgId,
          organizationRole: currentOrgRelation?.role as any,
          needsOnboarding: !user.onboardingCompleted,
        });

        const refreshTokenData = await db.refreshToken.create({
          data: {
            userId: user.id,
            token: crypto.randomBytes(32).toString('hex'),
            expiresAt: getExpirationDate('7d'),
          },
        });

        const refreshToken = signRefreshToken({ userId: user.id, tokenId: refreshTokenData.id });

        // Register device session + geo check antes de set cookies
        const deviceResult = await registerDeviceSession(user.id, request);
        if (deviceResult.blocked) {
          return Response.json(
            { error: 'Login bloqueado por política de segurança. Contate o administrador.' },
            { status: 403 }
          );
        }

        setAuthCookies(response, accessToken, refreshToken);

        await createAuditLog('user.login', user.id, request, {
          method: 'passkey',
          passkeyId: credential.id,
        }, currentOrgId);

        return response.success({
          needsOnboarding: !user.onboardingCompleted,
          user: { id: user.id, email: user.email, name: user.name, role: user.role },
        });
      },
    }),

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
          rpID: process.env.RP_ID || 'localhost',
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
        const { verified, authenticationInfo } = await verifyAuthenticationResponse({
          response: body.response as any,
          expectedChallenge: challenge.challenge,
          expectedOrigin: process.env.EXPECTED_ORIGIN || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
          expectedRPID: process.env.RP_ID || 'localhost',
          credential: {
            id: credential.credentialId,
            publicKey: new Uint8Array(credential.publicKey as Buffer),
            counter: Number(credential.counter),
            transports: credential.transports as AuthenticatorTransportFuture[],
          },
        });

        if (!verified) return response.badRequest('Autenticação com passkey falhou');

        // 4. Delete challenge and update credential
        await db.passkeyChallenge.delete({ where: { id: challenge.id } });
        await db.passkeyCredential.update({
          where: { id: credential.id },
          data: { counter: BigInt(authenticationInfo.newCounter), lastUsedAt: new Date() },
        });

        // Generate tokens and set cookies
        const currentOrgId = user.currentOrgId || user.organizations[0]?.organizationId;
        const currentOrgRelation = user.organizations.find(o => o.organizationId === currentOrgId);

        const accessToken = signAccessToken({
          userId: user.id,
          email: user.email,
          role: user.role as UserRole,
          currentOrgId,
          organizationRole: currentOrgRelation?.role as any,
          needsOnboarding: !user.onboardingCompleted,
        });

        const refreshTokenData = await db.refreshToken.create({
          data: {
            userId: user.id,
            token: crypto.randomBytes(32).toString('hex'),
            expiresAt: getExpirationDate('7d'),
          },
        });

        const refreshToken = signRefreshToken({ userId: user.id, tokenId: refreshTokenData.id });

        // Register device session + geo check antes de set cookies
        const deviceResult = await registerDeviceSession(user.id, request);
        if (deviceResult.blocked) {
          return Response.json(
            { error: 'Login bloqueado por política de segurança. Contate o administrador.' },
            { status: 403 }
          );
        }

        setAuthCookies(response, accessToken, refreshToken);

        await createAuditLog('user.login', user.id, request, {
          method: 'passkey-conditional',
          passkeyId: credential.id,
        }, currentOrgId);

        return response.success({
          needsOnboarding: !user.onboardingCompleted,
          user: { id: user.id, email: user.email, name: user.name, role: user.role },
        });
      },
    }),
  },
});
