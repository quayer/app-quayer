/**
 * Auth session lifecycle
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
import { logoutSchema, switchOrganizationSchema } from "../auth.schemas";
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
 * Rate limiter para refresh de access token.
 * 60 refreshes / 10 minutos por IP — frequente o bastante para UX normal
 * (refresh default acontece a cada ~15 min), mas bloqueia abuso.
 */
const sessionRefreshRateLimiter = new RateLimiter({
  limit: 60,
  window: 600,
  prefix: 'ratelimit:session-refresh',
});

const logoutRateLimiter = new RateLimiter({
  limit: 10,
  window: 60,
  prefix: 'ratelimit:logout',
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

export const sessionController = igniter.controller({
  name: "auth-session",
  path: "/auth",
  description: "Auth session lifecycle",
  actions: {
    /**
     * Refresh Token - Renovar access token
     */
    refresh: igniter.mutation({
      name: 'Refresh Token',
      description: 'Refresh access token',
      path: '/refresh',
      method: 'POST',
      handler: async ({ request, response }) => {
        // Rate limit leve por IP — protege contra abuso sem quebrar UX normal
        const clientIp = getClientIdentifier(request);
        const rateLimit = await sessionRefreshRateLimiter.check(clientIp);
        if (!rateLimit.success) {
          return response.status(429).json({
            error: 'Too many refresh attempts',
            retryAfter: rateLimit.retryAfter,
          });
        }

        // Read refreshToken from httpOnly cookie (primary) or body (fallback)
        const cookieHeader = request.headers.get('cookie') || '';
        const cookieRefreshToken = cookieHeader
          .split(';')
          .map((c: string) => c.trim())
          .find((c: string) => c.startsWith('refreshToken='))
          ?.split('=')
          .slice(1)
          .join('=');

        const bodyRefreshToken = (request.body as any)?.refreshToken;
        const refreshToken = cookieRefreshToken || bodyRefreshToken;

        if (!refreshToken) {
          return response.status(401).json({ error: 'No refresh token provided' });
        }

        // Verificar refresh token
        const payload = verifyRefreshToken(refreshToken as string);
        if (!payload) {
          return response.status(401).json({ error: 'Invalid refresh token' });
        }

        // Buscar refresh token no banco
        const tokenData = await db.refreshToken.findUnique({
          where: { id: payload.tokenId },
          include: {
            user: {
              include: {
                organizations: {
                  where: { isActive: true },
                },
              },
            },
          },
        });

        if (!tokenData || tokenData.revokedAt || tokenData.expiresAt < new Date()) {
          return response.status(401).json({ error: 'Invalid or expired refresh token' });
        }

        // Obter role na organização atual
        const currentOrgRelation = tokenData.user.organizations.find(
          (org) => org.organizationId === tokenData.user.currentOrgId
        );

        // Criar novo access token
        const accessToken = signAccessToken({
          userId: tokenData.user.id,
          email: tokenData.user.email,
          role: tokenData.user.role as UserRole,
          currentOrgId: tokenData.user.currentOrgId,
          organizationRole: currentOrgRelation?.role as any,
          needsOnboarding: !tokenData.user.onboardingCompleted,
        });

        // Set new accessToken cookie
        setAuthCookies(response, accessToken);

        return response.success({ message: 'Token refreshed' });
      },
    }),

    /**
     * Logout - Revogar refresh token
     */
    logout: igniter.mutation({
      name: 'Logout',
      description: 'Logout user',
      path: '/logout',
      method: 'POST',
      body: logoutSchema,
      use: [csrfProcedure()],
      handler: async ({ request, response }) => {
        const clientIp = getClientIdentifier(request);
        const rateLimit = await logoutRateLimiter.check(clientIp);
        if (!rateLimit.success) {
          return response.status(429).json({
            error: 'Too many logout attempts',
            retryAfter: rateLimit.retryAfter,
          });
        }

        const { everywhere } = request.body;

        // Read refreshToken from httpOnly cookie (primary) or body (fallback)
        const cookieHeader = request.headers.get('cookie') || '';
        const cookieRefreshToken = cookieHeader
          .split(';')
          .map((c: string) => c.trim())
          .find((c: string) => c.startsWith('refreshToken='))
          ?.split('=')
          .slice(1)
          .join('=');

        const bodyRefreshToken = request.body?.refreshToken;
        const refreshToken = cookieRefreshToken || bodyRefreshToken;

        let logoutUserId: string | null = null;
        if (refreshToken) {
          const payload = verifyRefreshToken(refreshToken);
          if (payload) {
            logoutUserId = payload.userId;
            if (everywhere) {
              await db.refreshToken.updateMany({
                where: { userId: payload.userId, revokedAt: null },
                data: { revokedAt: new Date() },
              });
            } else {
              await db.refreshToken.update({
                where: { id: payload.tokenId },
                data: { revokedAt: new Date() },
              });
            }
          }
        }

        // Clear httpOnly cookies
        clearAuthCookies(response);

        // Audit log — registrar logout
        if (logoutUserId) {
          await createAuditLog('auth.logout', logoutUserId, request, { everywhere: !!everywhere });
        }

        return response.success({ message: 'Logged out successfully' });
      },
    }),

    /**
     * Switch Organization
     */
    switchOrganization: igniter.mutation({
      name: 'Switch Organization',
      description: 'Switch current organization',
      path: '/switch-organization',
      method: 'POST',
      body: switchOrganizationSchema,
      use: [authProcedure({ required: true }), csrfProcedure()],
      handler: async ({ request, response, context }) => {
        const user = context.auth?.session?.user;
        if (!user) {
          return response.status(401).json({ error: 'Not authenticated' });
        }

        const { organizationId } = request.body;

        // Buscar organizações ativas do usuário (authProcedure já incluiu)
        const userWithOrgs = await db.user.findUnique({
          where: { id: user.id },
          include: {
            organizations: {
              where: { isActive: true },
              include: { organization: true },
            },
          },
        });

        if (!userWithOrgs) {
          return response.status(404).json({ error: 'User not found' });
        }

        // Verificar se usuário pertence à organização (ou é admin)
        const userOrg = userWithOrgs.organizations.find(
          (org) => org.organizationId === organizationId
        );

        if (!userOrg && user.role !== 'admin') {
          return response.status(403).json({ error: 'Access denied to this organization' });
        }

        // Admin pode trocar para qualquer org, mas precisa verificar se existe
        if (user.role === 'admin' && !userOrg) {
          const orgExists = await db.organization.findUnique({
            where: { id: organizationId },
          });
          if (!orgExists) {
            return response.status(404).json({ error: 'Organization not found' });
          }
        }

        // Atualizar organização atual
        await db.user.update({
          where: { id: user.id },
          data: { currentOrgId: organizationId },
        });

        // Gerar novo access token com organizationId atualizado
        const accessToken = signAccessToken({
          userId: user.id,
          email: user.email,
          role: user.role as UserRole,
          currentOrgId: organizationId,
          organizationRole: userOrg?.role as any,
          needsOnboarding: !user.onboardingCompleted, // ✅ Incluir no token para middleware
        });

        // Rotate refresh token: revoke current, issue a new one
        const cookieHeader = request.headers.get('cookie') || '';
        const currentRawRefreshToken = cookieHeader
          .split(';')
          .map((c: string) => c.trim())
          .find((c: string) => c.startsWith('refreshToken='))
          ?.split('=')
          .slice(1)
          .join('=');

        let newRefreshToken: string | undefined;

        if (currentRawRefreshToken) {
          const currentPayload = verifyRefreshToken(currentRawRefreshToken);
          if (currentPayload) {
            await db.refreshToken.update({
              where: { id: currentPayload.tokenId },
              data: { revokedAt: new Date() },
            });
          }
        }

        const refreshTokenData = await db.refreshToken.create({
          data: {
            userId: user.id,
            token: signRefreshToken({ userId: user.id, tokenId: '' }),
            expiresAt: getExpirationDate('7d'),
          },
        });

        newRefreshToken = signRefreshToken({
          userId: user.id,
          tokenId: refreshTokenData.id,
        });

        await db.refreshToken.update({
          where: { id: refreshTokenData.id },
          data: { token: newRefreshToken },
        });

        // Set new accessToken cookie with updated org and rotated refresh token
        setAuthCookies(response, accessToken, newRefreshToken);

        // Audit log — registrar troca de organização
        await createAuditLog(
          'auth.switch_organization',
          user.id,
          request,
          {
            fromOrgId: user.currentOrgId ?? null,
            toOrgId: organizationId,
            organizationRole: userOrg?.role ?? null,
          },
          organizationId,
        );

        return response.success({
          currentOrgId: organizationId,
          organizationRole: userOrg?.role || null,
        });
      },
    }),

    /**
     * CSRF Token - Gera e retorna um novo CSRF token via cookie
     */
    csrf: igniter.query({
      name: 'Get CSRF Token',
      description: 'Generate a new CSRF token and set it as a cookie',
      path: '/csrf',
      method: 'GET',
      handler: async ({ response }) => {
        const csrfToken = generateCsrfToken();
        setCsrfCookie(response, csrfToken);
        return response.success({ token: csrfToken });
      },
    }),
  },
});
