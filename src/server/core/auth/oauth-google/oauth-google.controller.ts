/**
 * Auth Google OAuth flow
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
import { googleCallbackSchema } from "../auth.schemas";
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

/**
 * Rate limiters dedicados ao fluxo Google OAuth.
 *  - googleCallback: 10 requisições / 10 minutos por IP
 *  - googleAuth (init): 20 requisições / 10 minutos por IP
 * Prefixos isolados para não colidir com `authRateLimiter`.
 */
const oauthGoogleCallbackRateLimiter = new RateLimiter({
  limit: 10,
  window: 600,
  prefix: 'ratelimit:oauth-google-callback',
});

const oauthGoogleInitRateLimiter = new RateLimiter({
  limit: 20,
  window: 600,
  prefix: 'ratelimit:oauth-google-init',
});
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
import { isSignupEnabled, SIGNUP_DISABLED_MESSAGE } from "../_shared/signup-gate";

export const oauthGoogleController = igniter.controller({
  name: "auth-oauth-google",
  path: "/auth",
  description: "Auth Google OAuth flow",
  actions: {
    /**
     * Google Auth - Iniciar fluxo OAuth
     */
    googleAuth: igniter.query({
      name: 'Google Auth',
      description: 'Initiate Google OAuth flow',
      path: '/google',
      method: 'GET',
      handler: async ({ request, response }) => {
        // Light rate limit to prevent abuse of the redirect URL generator
        const identifier = getClientIdentifier(request);
        const rateLimit = await oauthGoogleInitRateLimiter.check(identifier);
        if (!rateLimit.success) {
          return response.status(429).json({
            error: 'Too many requests',
            retryAfter: rateLimit.retryAfter,
          });
        }

        const { getGoogleAuthUrl } = await import('@/lib/auth/google-oauth');
        const authUrl = getGoogleAuthUrl();
        return response.success({ authUrl });
      },
    }),

    /**
     * Google Callback - Processar retorno do Google OAuth
     */
    googleCallback: igniter.mutation({
      name: 'Google Callback',
      description: 'Process Google OAuth callback',
      path: '/google/callback',
      method: 'POST',
      body: googleCallbackSchema,
      handler: async ({ request, response }) => {
        // Rate limit: 10 callbacks / 10 min por IP
        const identifier = getClientIdentifier(request);
        const rateLimit = await oauthGoogleCallbackRateLimiter.check(identifier);
        if (!rateLimit.success) {
          return response.status(429).json({
            error: 'Too many requests',
            retryAfter: rateLimit.retryAfter,
          });
        }

        const { code } = request.body;
        const { getGoogleTokens, getGoogleUserInfo } = await import('@/lib/auth/google-oauth');

        try {
          // Trocar código por tokens
          const tokens = await getGoogleTokens(code);

          if (!tokens.access_token) {
            console.error('[Google OAuth] access_token missing from token exchange response');
            return response.status(400).json({ error: 'Failed to get access token' });
          }

          // Obter informações do usuário
          const googleUser = await getGoogleUserInfo(tokens.access_token);

          if (!googleUser.verified_email) {
            console.error('[Google OAuth] Provider returned unverified email; rejecting');
            return response.status(400).json({ error: 'Google email not verified' });
          }

          // Buscar ou criar usuário
          let user = await db.user.findUnique({
            where: { email: googleUser.email },
          });

          let isNewGoogleUser = false;

          if (!user) {
            // Signup gate — bloqueia criação de novos usuários quando desabilitado
            if (!isSignupEnabled()) {
              return response.status(403).json({ error: SIGNUP_DISABLED_MESSAGE });
            }

            // Criar novo usuário
            const usersCount = await db.user.count();
            const isFirstUser = usersCount === 0;

            // Criar organização padrão para usuário Google OAuth
            const slug = googleUser.name
              .toLowerCase()
              .replace(/[^a-z0-9]/g, '-')
              .substring(0, 50);

            // Gerar documento único baseado em UUID para evitar colisões
            const uniqueDocument = crypto.randomUUID().replace(/-/g, '').substring(0, 14);

            const organization = await db.organization.create({
              data: {
                name: `${googleUser.name}'s Organization`,
                slug: `${slug}-${Date.now()}`,
                document: uniqueDocument, // Documento único gerado automaticamente
                type: 'pf',
                isActive: true,
              },
            });

            // Google OAuth users are passwordless
            user = await db.user.create({
              data: {
                email: googleUser.email,
                name: googleUser.name,
                password: null, // Passwordless — OAuth user
                role: isFirstUser ? UserRole.ADMIN : UserRole.USER,
                emailVerified: new Date(), // Google já verificou - must be DateTime
                currentOrgId: organization.id,
                organizations: {
                  create: {
                    organizationId: organization.id,
                    role: 'master',
                  },
                },
              },
            });
            isNewGoogleUser = true;
          }

          // 2FA check: if existing user has TOTP enabled, return challenge
          if (!isNewGoogleUser && user.twoFactorEnabled) {
            const challengeId = sign2faChallenge(user.id);
            createAuditLog('2FA_CHALLENGE_ISSUED', user.id, request, { method: 'google' }, user.currentOrgId);
            return response.success({ requiresTwoFactor: true, challengeId });
          }

          // Gerar tokens JWT
          const accessToken = signAccessToken({
            userId: user.id,
            email: user.email,
            role: user.role as UserRole,
            currentOrgId: user.currentOrgId,
            needsOnboarding: !user.onboardingCompleted, // ✅ Incluir no token para middleware
          });

          const refreshTokenValue = signRefreshToken({
            userId: user.id,
            tokenId: '', // Temporário, será atualizado
          });

          // Salvar refresh token
          const savedRefreshToken = await db.refreshToken.create({
            data: {
              userId: user.id,
              token: refreshTokenValue,
              expiresAt: getExpirationDate('30d'), // 30 dias
            },
          });

          // Gerar refresh token final com tokenId correto
          const refreshToken = signRefreshToken({
            userId: user.id,
            tokenId: savedRefreshToken.id,
          });

          // Atualizar refresh token no banco
          await db.refreshToken.update({
            where: { id: savedRefreshToken.id },
            data: { token: refreshToken },
          });

          if (isNewGoogleUser) {
            await emailService.sendWelcomeEmail(user.email, user.name, dashboardUrl);
            await createAuditLog('user.signup', user.id, request, { method: 'google' }, user.currentOrgId);
            await createAuditLog('auth.signup', user.id, request, { method: 'google' }, user.currentOrgId);
          } else {
            await createAuditLog('user.login', user.id, request, { method: 'google' }, user.currentOrgId);
            await createAuditLog('auth.login', user.id, request, { method: 'google' }, user.currentOrgId);
          }

          // Set httpOnly cookies
          setAuthCookies(response, accessToken, refreshToken);

          // Register device session (non-blocking)
          await registerDeviceSession(user.id, request);

          return response.success({
            needsOnboarding: !user.onboardingCompleted,
            user: {
              id: user.id,
              email: user.email,
              name: user.name,
              role: user.role,
              currentOrgId: user.currentOrgId,
            },
          });
        } catch (error: any) {
          // Do not log error.message in production — may contain PII from provider responses
          if (process.env.NODE_ENV === 'development') {
            console.error('[Google OAuth] Authentication failed:', error.message);
          } else {
            console.error('[Google OAuth] Authentication failed');
          }
          return response.status(400).json({
            error: 'Google authentication failed',
            message: error.message || 'Erro ao processar autenticação com Google',
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
          });
        }
      },
    }),
  },
});
