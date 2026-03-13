/**
 * Auth Controller
 *
 * Controlador de autenticação e autorização
 */

import { igniter } from '@/igniter';
import { database as db } from '@/server/services/database';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import type { AuthenticatorTransportFuture } from '@simplewebauthn/server';
import { z } from 'zod';
import {
  refreshTokenSchema,
  logoutSchema,
  updateProfileSchema,
  switchOrganizationSchema,
  googleCallbackSchema,
  sendVerificationSchema,
  verifyEmailCodeSchema,
  passwordlessOTPSchema,
  verifyPasswordlessOTPSchema,
  verifyMagicLinkSchema,
  signupOTPSchema,
  verifySignupOTPSchema,
  phoneOTPSchema,
  verifyPhoneOTPSchema,
  totpSetupSchema,
  totpVerifySchema,
  totpChallengeSchema,
  totpRecoverySchema,
  totpDisableRequestSchema,
  totpDisableSchema,
  totpRegenerateCodesSchema,
  checkMagicLinkStatusSchema,
} from '../auth.schemas';
import { normalizePhone, sendWhatsAppOTP } from '@/lib/uaz/whatsapp-otp';
import {
  hashPassword,
  verifyPassword,
  generateOTPCode,
  generateRecoveryCodes,
} from '@/lib/auth/bcrypt';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  getExpirationDate,
  signMagicLinkToken,
  verifyMagicLinkToken,
} from '@/lib/auth/jwt';
import { authProcedure } from '../procedures/auth.procedure';
import { csrfProcedure } from '../procedures/csrf.procedure';
import { turnstileProcedure } from '../procedures/turnstile.procedure';
import { UserRole } from '@/lib/auth/roles';
import { emailService } from '@/lib/email';
import { authRateLimiter } from '@/lib/rate-limit/rate-limiter';
import { checkOtpRateLimit } from '@/lib/rate-limit/otp-rate-limit';
import { generateCsrfToken, setCsrfCookie, clearCsrfCookie } from '@/lib/auth/csrf';
import { getIpGeolocation } from '@/lib/geocoding/ip-geolocation';
import { encrypt, decrypt } from '@/lib/crypto';
import * as OTPAuth from 'otpauth';
import QRCode from 'qrcode';

function getClientIdentifier(request: { headers: { get?: (key: string) => string | null; [key: string]: any } }): string {
  const headers = request?.headers;
  if (!headers) return 'unknown';
  const get = (key: string): string | undefined => {
    if (typeof headers.get === 'function') return headers.get(key) ?? undefined;
    return headers[key];
  };
  const forwarded = get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  const realIp = get('x-real-ip');
  if (realIp) return realIp;
  return 'unknown';
}

async function createAuditLog(
  action: string,
  userId: string,
  request: { headers: { get?: (key: string) => string | null; [key: string]: any } },
  metadata?: Record<string, any>,
  organizationId?: string | null,
) {
  try {
    await db.auditLog.create({
      data: {
        action,
        resource: 'auth',
        userId,
        organizationId: organizationId ?? undefined,
        ipAddress: getClientIdentifier(request),
        metadata: metadata ?? undefined,
      },
    });
  } catch (err) {
    console.error(`[AuditLog] Failed to write ${action}:`, err);
  }
}

const appBaseUrl = (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'https://quayer.com').replace(/\/$/, '');
const dashboardUrl = `${appBaseUrl}/integracoes`;

const isProduction = process.env.NODE_ENV === 'production';

/**
 * Helper: Set auth cookies (httpOnly) on the Igniter response object.
 * accessToken  -> Path=/ , Max-Age=900 (15 min)
 * refreshToken -> Path=/api/v1/auth/refresh , Max-Age=604800 (7 days)
 */
function setAuthCookies(
  response: any,
  accessToken: string,
  refreshToken?: string,
) {
  response.setCookie('accessToken', accessToken, {
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 900, // 15 minutes
    secure: isProduction,
  });

  if (refreshToken) {
    response.setCookie('refreshToken', refreshToken, {
      httpOnly: true,
      sameSite: 'lax' as const,
      path: '/api/v1/auth/refresh',
      maxAge: 604800, // 7 days
      secure: isProduction,
    });
  }

  // Rotacionar CSRF token a cada login/refresh
  const csrfToken = generateCsrfToken();
  setCsrfCookie(response, csrfToken);
}

/**
 * Helper: Clear auth cookies by setting Max-Age=0.
 */
function clearAuthCookies(response: any) {
  response.setCookie('accessToken', '', {
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 0,
    secure: isProduction,
  });
  response.setCookie('refreshToken', '', {
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/api/v1/auth/refresh',
    maxAge: 0,
    secure: isProduction,
  });
  clearCsrfCookie(response);
}

/**
 * 2FA Challenge: sign a short-lived JWT (5 min) that proves first-factor passed.
 */
function sign2faChallenge(userId: string): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is required');
  return jwt.sign({ userId, type: '2fa-challenge' }, secret, { expiresIn: '5m', issuer: 'quayer' });
}

/**
 * 2FA Challenge: verify the challenge JWT and return userId, or null if invalid/expired.
 */
function verify2faChallenge(token: string): { userId: string } | null {
  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('JWT_SECRET is required');
    const payload = jwt.verify(token, secret, { issuer: 'quayer' }) as any;
    if (payload.type !== '2fa-challenge' || !payload.userId) return null;
    return { userId: payload.userId };
  } catch {
    return null;
  }
}

/**
 * Track failed 2FA attempts per challengeId via Redis.
 * TTL = 10 minutes. Works across multiple server instances.
 */
import { getRedis } from '@/server/services/redis';

const CHALLENGE_ATTEMPTS_PREFIX = 'auth:2fa:attempts:';
const CHALLENGE_ATTEMPTS_TTL = 600; // 10 minutes

async function getChallengeAttempts(challengeId: string): Promise<number> {
  try {
    const val = await getRedis().get(`${CHALLENGE_ATTEMPTS_PREFIX}${challengeId}`);
    return val ? parseInt(val, 10) : 0;
  } catch {
    return 0;
  }
}

async function incrementChallengeAttempts(challengeId: string): Promise<number> {
  try {
    const redis = getRedis();
    const key = `${CHALLENGE_ATTEMPTS_PREFIX}${challengeId}`;
    const next = await redis.incr(key);
    if (next === 1) {
      await redis.expire(key, CHALLENGE_ATTEMPTS_TTL);
    }
    return next;
  } catch {
    return 1;
  }
}

const MAX_2FA_ATTEMPTS = 5;

/**
 * Helper: Parse a human-readable device name from a User-Agent string.
 */
function parseDeviceName(userAgent: string): string {
  // Detect browser
  let browser = 'Unknown Browser';
  if (userAgent.includes('Edg/') || userAgent.includes('Edge/')) {
    browser = 'Edge';
  } else if (userAgent.includes('OPR/') || userAgent.includes('Opera')) {
    browser = 'Opera';
  } else if (userAgent.includes('Chrome/') && !userAgent.includes('Edg/')) {
    browser = 'Chrome';
  } else if (userAgent.includes('Firefox/')) {
    browser = 'Firefox';
  } else if (userAgent.includes('Safari/') && !userAgent.includes('Chrome/')) {
    browser = 'Safari';
  }

  // Detect OS
  let os = 'Unknown OS';
  if (userAgent.includes('iPhone') || userAgent.includes('iPad')) {
    os = 'iOS';
  } else if (userAgent.includes('Android')) {
    os = 'Android';
  } else if (userAgent.includes('Windows')) {
    os = 'Windows';
  } else if (userAgent.includes('Mac OS') || userAgent.includes('Macintosh')) {
    os = 'macOS';
  } else if (userAgent.includes('Linux')) {
    os = 'Linux';
  }

  if (browser === 'Unknown Browser' && os === 'Unknown OS') {
    return 'Unknown Browser';
  }

  return `${browser} on ${os}`;
}

/**
 * Helper: Register (or update) a DeviceSession after successful login.
 * Wrapped in try/catch so it never blocks the login flow.
 */
async function registerDeviceSession(userId: string, request: any): Promise<{ blocked: boolean }> {
  try {
    const headers = request?.headers;
    const get = (key: string): string | undefined => {
      if (!headers) return undefined;
      if (typeof headers.get === 'function') return headers.get(key) ?? undefined;
      return headers[key];
    };

    const userAgent = get('user-agent') || 'Unknown';
    const ip =
      get('x-forwarded-for')?.split(',')[0]?.trim() ||
      get('x-real-ip') ||
      'Unknown';

    const deviceName = parseDeviceName(userAgent);

    // IP Geolocation lookup (non-blocking, fail-open)
    const geo = await getIpGeolocation(ip);
    const countryCode = geo.countryCode !== 'XX' ? geo.countryCode : null;

    // Check geo alert mode for user's organization
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { currentOrgId: true, email: true, name: true },
    });

    if (user?.currentOrgId && countryCode && countryCode !== 'LO') {
      const org = await db.organization.findUnique({
        where: { id: user.currentOrgId },
        select: { geoAlertMode: true, id: true },
      });

      const geoMode = org?.geoAlertMode || 'off';

      if (geoMode !== 'off') {
        // Check if this country is new for this user
        const knownCountries = await db.deviceSession.findMany({
          where: { userId, countryCode: { not: null }, isRevoked: false },
          select: { countryCode: true },
          distinct: ['countryCode'],
          take: 10,
        });

        const isNewCountry = !knownCountries.some(s => s.countryCode === countryCode);

        if (isNewCountry) {
          console.warn(`[GeoAlert] New country detected for ${user.email}: ${geo.country} (${countryCode}) from IP ${ip}`);

          if (geoMode === 'block') {
            console.warn(`[GeoAlert] BLOCKED login for ${user.email} from ${geo.country} — org geoAlertMode=block`);
            return { blocked: true };
          }

          // Create notification for org admins (notify + email modes)
          try {
            await db.notification.create({
              data: {
                type: 'SECURITY',
                title: `Login de novo país: ${geo.country}`,
                description: `Usuário ${user.name || user.email} fez login de ${geo.city ? geo.city + ', ' : ''}${geo.country} (IP: ${ip})`,
                organizationId: user.currentOrgId,
                source: 'auth',
                metadata: {
                  action: 'LOGIN_GEO_ALERT',
                  ip,
                  country: geo.country,
                  countryCode,
                  city: geo.city,
                  region: geo.region,
                  userEmail: user.email,
                },
              },
            });
          } catch (notifErr) {
            console.error('[GeoAlert] Failed to create notification:', notifErr);
          }

          // Create audit log entry
          try {
            await db.auditLog.create({
              data: {
                action: 'LOGIN_GEO_ALERT',
                resource: 'auth',
                userId,
                organizationId: user.currentOrgId,
                ipAddress: ip,
                metadata: {
                  country: geo.country,
                  countryCode,
                  city: geo.city,
                  region: geo.region,
                  geoMode,
                },
              },
            });
          } catch (auditErr) {
            console.error('[GeoAlert] Failed to create audit log:', auditErr);
          }
        }
      }
    }

    // Upsert: if same userId + userAgent exists (non-revoked), update lastActiveAt
    const existing = await db.deviceSession.findFirst({
      where: { userId, userAgent, isRevoked: false },
    });

    if (existing) {
      await db.deviceSession.update({
        where: { id: existing.id },
        data: { lastActiveAt: new Date(), ipAddress: ip, countryCode },
      });
    } else {
      await db.deviceSession.create({
        data: { userId, deviceName, ipAddress: ip, userAgent, lastActiveAt: new Date(), countryCode },
      });
    }

    return { blocked: false };
  } catch (err) {
    console.error('[Auth] Failed to register device session:', err);
    return { blocked: false }; // fail-open
  }
}


/**
 * Auto-join by verified domain.
 * After email verification in signup flows, extract domain from email and look up
 * VerifiedDomain records where domain matches, verifiedAt is not null, autoJoin is true.
 * If found, create UserOrganization with defaultRoleId (or fallback 'user').
 * Fail-open: don't block signup if auto-join fails.
 * Returns the list of orgIds the user was added to (may be empty).
 */
async function autoJoinByVerifiedDomain(
  userId: string,
  email: string,
  request: { headers: { get?: (key: string) => string | null; [key: string]: any } },
): Promise<{ joinedOrgIds: string[] }> {
  try {
    const domain = email.split('@')[1]?.toLowerCase();
    if (!domain) return { joinedOrgIds: [] };

    // Look up verified domains with autoJoin enabled
    const verifiedDomains = await db.verifiedDomain.findMany({
      where: {
        domain,
        verifiedAt: { not: null },
        autoJoin: true,
      },
      include: {
        organization: { select: { id: true, name: true, isActive: true } },
        defaultRole: { select: { id: true, slug: true } },
      },
    });

    if (verifiedDomains.length === 0) return { joinedOrgIds: [] };

    // Check existing memberships to avoid duplicates
    const existingMemberships = await db.userOrganization.findMany({
      where: {
        userId,
        organizationId: { in: verifiedDomains.map(vd => vd.organizationId) },
      },
      select: { organizationId: true },
    });
    const existingOrgIds = new Set(existingMemberships.map(m => m.organizationId));

    const joinedOrgIds: string[] = [];

    for (const vd of verifiedDomains) {
      // Skip if user already member or org inactive
      if (existingOrgIds.has(vd.organizationId)) continue;
      if (!vd.organization.isActive) continue;

      try {
        // Determine role: use defaultRoleId from VerifiedDomain, or fallback to 'user'
        const roleSlug = vd.defaultRole?.slug || 'user';

        await db.userOrganization.create({
          data: {
            userId,
            organizationId: vd.organizationId,
            role: roleSlug,
            isActive: true,
            customRoleId: vd.defaultRoleId || undefined,
          },
        });

        joinedOrgIds.push(vd.organizationId);

        // Audit log
        await createAuditLog('domain_auto_join', userId, request, {
          orgId: vd.organizationId,
          orgName: vd.organization.name,
          domain,
          roleSlug,
        }, vd.organizationId);

        console.log(`[AUDIT] domain_auto_join userId=${userId} orgId=${vd.organizationId} domain=${domain}`);
      } catch (joinErr) {
        // Fail-open per org: if one fails, continue with others
        console.error(`[AutoJoin] Failed to join org ${vd.organizationId} for user ${userId}:`, joinErr);
      }
    }

    // Set currentOrgId to the first joined org if user has no current org
    if (joinedOrgIds.length > 0) {
      const user = await db.user.findUnique({ where: { id: userId }, select: { currentOrgId: true } });
      if (!user?.currentOrgId) {
        await db.user.update({
          where: { id: userId },
          data: { currentOrgId: joinedOrgIds[0] },
        });
      }
    }

    return { joinedOrgIds };
  } catch (err) {
    // Fail-open: don't block signup if auto-join fails
    console.error(`[AutoJoin] Failed for user ${userId}:`, err);
    return { joinedOrgIds: [] };
  }
}

export const authController = igniter.controller({
  name: 'auth',
  path: '/auth',
  description: 'Authentication and authorization',
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
      handler: async ({ request, response }) => {
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

        if (refreshToken) {
          const payload = verifyRefreshToken(refreshToken);
          if (payload) {
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

        return response.success({ message: 'Logged out successfully' });
      },
    }),

    /**
     * Me - Obter dados do usuário autenticado
     */
    me: igniter.query({
      name: 'Get Current User',
      description: 'Get authenticated user data',
      path: '/me',
      method: 'GET',
      handler: async ({ request, response }) => {
        let userId = request.headers.get('x-user-id');

        // Fallback: read accessToken from httpOnly cookie and extract userId
        if (!userId) {
          const cookieHeader = request.headers.get('cookie') || '';
          const cookieToken = cookieHeader
            .split(';')
            .map((c: string) => c.trim())
            .find((c: string) => c.startsWith('accessToken='))
            ?.split('=')
            .slice(1)
            .join('=');

          const authHeader = request.headers.get('authorization') || request.headers.get('Authorization');
          const headerToken = authHeader && authHeader.startsWith('Bearer ')
            ? authHeader.slice(7)
            : null;

          const token = cookieToken || headerToken;
          if (token) {
            try {
              const { verifyAccessToken } = await import('@/lib/auth/jwt');
              const payload = await verifyAccessToken(token);
              if (payload) {
                userId = payload.userId;
              }
            } catch {
              // Token invalid, will return 401 below
            }
          }
        }

        if (!userId) {
          return response.status(401).json({ error: 'Not authenticated' });
        }

        const user = await db.user.findUnique({
          where: { id: userId },
          include: {
            organizations: {
              where: { isActive: true },
              include: { organization: true },
            },
          },
        });

        if (!user) {
          return response.status(404).json({ error: 'User not found' });
        }

        return response.success({
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          emailVerified: user.emailVerified,
          currentOrgId: user.currentOrgId,
          organizations: user.organizations.map((org) => ({
            id: org.organization.id,
            name: org.organization.name,
            slug: org.organization.slug,
            role: org.role,
          })),
        });
      },
    }),

    /**
     * Update Profile
     */
    updateProfile: igniter.mutation({
      name: 'Update Profile',
      description: 'Update user profile',
      path: '/profile',
      method: 'PATCH',
      body: updateProfileSchema,
      use: [authProcedure({ required: true }), csrfProcedure()],
      handler: async ({ request, response }) => {
        const userId = request.headers.get('x-user-id');
        if (!userId) {
          return response.status(401).json({ error: 'Not authenticated' });
        }

        const { name, email } = request.body;

        const updateData: any = {};
        if (name) updateData.name = name;
        if (email) {
          // Verificar se email já existe
          const existing = await db.user.findFirst({
            where: { email, id: { not: userId } },
          });
          if (existing) {
            return response.status(400).json({ error: 'Email already in use' });
          }
          updateData.email = email;
          updateData.emailVerified = null; // Require re-verification
        }

        const user = await db.user.update({
          where: { id: userId },
          data: updateData,
        });

        return response.success({
          id: user.id,
          email: user.email,
          name: user.name,
          emailVerified: user.emailVerified,
        });
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
      handler: async ({ request, response }) => {
        const userId = request.headers.get('x-user-id');
        if (!userId) {
          return response.status(401).json({ error: 'Not authenticated' });
        }

        const { organizationId } = request.body;

        // Buscar usuário com organizações
        const user = await db.user.findUnique({
          where: { id: userId },
          include: {
            organizations: {
              where: { isActive: true },
              include: { organization: true },
            },
          },
        });

        if (!user) {
          return response.status(404).json({ error: 'User not found' });
        }

        // Verificar se usuário pertence à organização (ou é admin)
        const userOrg = user.organizations.find(
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
          where: { id: userId },
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

        // Set new accessToken cookie with updated org
        setAuthCookies(response, accessToken);

        return response.success({
          currentOrgId: organizationId,
          organizationRole: userOrg?.role || null,
        });
      },
    }),

    /**
     * List Users (Admin only)
     */
    listUsers: igniter.query({
      name: 'List Users',
      description: 'List all users (admin only)',
      path: '/users',
      method: 'GET',
      use: [authProcedure({ required: true }), csrfProcedure()],
      handler: async ({ request, response, context }) => {
        const user = context.auth?.session?.user;

        if (!user) {
          return response.status(401).json({ error: 'Not authenticated' });
        }

        // Verificar se é admin
        if (user.role !== 'admin') {
          return response.status(403).json({ error: 'Admin access required' });
        }

        // Filtrar por organização do usuário (multi-tenant)
        const orgId = user.currentOrgId;
        if (!orgId) {
          return response.status(400).json({ error: 'No organization selected' });
        }

        const users = await context.db.user.findMany({
          where: {
            organizations: { some: { organizationId: orgId } },
          },
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            isActive: true,
            emailVerified: true,
            currentOrgId: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: { createdAt: 'desc' },
        });

        return response.success(users);
      },
    }),

    /**
     * Google Auth - Iniciar fluxo OAuth
     */
    googleAuth: igniter.query({
      name: 'Google Auth',
      description: 'Initiate Google OAuth flow',
      path: '/google',
      method: 'GET',
      handler: async ({ request, response }) => {
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
        const { code } = request.body;
        const { getGoogleTokens, getGoogleUserInfo } = await import('@/lib/auth/google-oauth');

        console.log('[Google OAuth] Processando callback com código...');

        try {
          // Trocar código por tokens
          console.log('[Google OAuth] Trocando código por tokens...');
          const tokens = await getGoogleTokens(code);
          console.log('[Google OAuth] Tokens recebidos:', {
            hasAccessToken: !!tokens.access_token,
            hasRefreshToken: !!tokens.refresh_token
          });

          if (!tokens.access_token) {
            console.error('[Google OAuth] Erro: access_token não encontrado');
            return response.status(400).json({ error: 'Failed to get access token' });
          }

          // Obter informações do usuário
          console.log('[Google OAuth] Obtendo informações do usuário...');
          const googleUser = await getGoogleUserInfo(tokens.access_token);
          console.log('[Google OAuth] Usuário Google:', {
            email: googleUser.email,
            name: googleUser.name,
            verified: googleUser.verified_email
          });

          if (!googleUser.verified_email) {
            console.error('[Google OAuth] Erro: Email não verificado');
            return response.status(400).json({ error: 'Google email not verified' });
          }

          // Buscar ou criar usuário
          let user = await db.user.findUnique({
            where: { email: googleUser.email },
          });

          let isNewGoogleUser = false;

          if (!user) {
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
            role: user.role,
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
          console.error('[Google OAuth] Authentication failed:', error.message);
          return response.status(400).json({
            error: 'Google authentication failed',
            message: error.message || 'Erro ao processar autenticação com Google',
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
          });
        }
      },
    }),

    /**
     * Send Verification Email - Enviar código de verificação
     */
    sendVerification: igniter.mutation({
      name: 'Send Verification',
      description: 'Send verification code to email',
      path: '/send-verification',
      method: 'POST',
      body: sendVerificationSchema,
      handler: async ({ request, response }) => {
        const { email } = request.body;

        const user = await db.user.findUnique({ where: { email } });
        if (!user) {
          // Não revelar se o email existe ou não (segurança)
          return response.success({ sent: true });
        }

        if (user.emailVerified) {
          return response.status(400).json({ error: 'Email already verified' });
        }

        // Gerar código de 6 dígitos
        const code = generateOTPCode();
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutos

        // Salvar código no banco (criar tabela de verification codes ou usar campo temporário)
        await db.user.update({
          where: { email },
          data: {
            // Usar campo resetToken para armazenar OTP temporário
            resetToken: code,
            resetTokenExpiry: expiresAt,
          },
        });

        // Enviar email com código usando template profissional
        await emailService.sendVerificationEmail(email, user.name, code, 15);

        return response.success({ sent: true });
      },
    }),

    /**
     * Verify Email - Verificar código de email
     */
    verifyEmail: igniter.mutation({
      name: 'Verify Email',
      description: 'Verify email with code',
      path: '/verify-email',
      method: 'POST',
      body: verifyEmailCodeSchema,
      handler: async ({ request, response }) => {
        const { email, code } = request.body;

        const user = await db.user.findUnique({ where: { email } });

        if (!user) {
          return response.status(400).json({ error: 'Invalid code' });
        }

        if (user.emailVerified) {
          return response.status(400).json({ error: 'Email already verified' });
        }

        // Verificar código
        if (user.resetToken !== code) {
          return response.status(400).json({ error: 'Invalid code' });
        }

        // Verificar expiração
        if (!user.resetTokenExpiry || user.resetTokenExpiry < new Date()) {
          return response.status(400).json({ error: 'Code expired' });
        }

        // Marcar email como verificado
        await db.user.update({
          where: { email },
          data: {
            emailVerified: true,
            resetToken: null,
            resetTokenExpiry: null,
          },
        });

        // Auto-join by verified domain (fail-open)
        await autoJoinByVerifiedDomain(user.id, user.email, request);

        // Gerar tokens JWT
        const accessToken = await signAccessToken({
          userId: user.id,
          email: user.email,
          role: user.role,
          needsOnboarding: !user.onboardingCompleted, // ✅ Incluir no token para middleware
        });

        const refreshToken = await signRefreshToken({
          userId: user.id,
          email: user.email,
          role: user.role,
        });

        // Salvar refresh token
        await db.refreshToken.create({
          data: {
            userId: user.id,
            token: refreshToken,
            expiresAt: getExpirationDate(30),
          },
        });

        // Set httpOnly cookies
        setAuthCookies(response, accessToken, refreshToken);

        return response.success({
          verified: true,
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
          },
        });
      },
    }),

    /**
     * Signup OTP - Request signup code (NEW USER)
     */
    signupOTP: igniter.mutation({
      name: 'Signup OTP',
      description: 'Request signup code via email',
      path: '/signup-otp',
      method: 'POST',
      body: signupOTPSchema,
      use: [turnstileProcedure()],
      handler: async ({ request, response }) => {
        const identifier = getClientIdentifier(request);
        const rateLimit = await authRateLimiter.check(identifier);

        if (!rateLimit.success) {
          return response.status(429).json({
            error: 'Too many requests',
            retryAfter: rateLimit.retryAfter,
          });
        }

        const { email, name } = request.body;

        // Check if user already exists
        const existingUser = await db.user.findUnique({ where: { email } });
        if (existingUser) {
          return response.status(400).json({ error: 'Email já cadastrado. Faça login.' });
        }

        // Generate OTP
        const otpCode = generateOTPCode();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

        // Save to TempUser (temporary storage before verification)
        await db.tempUser.upsert({
          where: { email },
          create: { email, name, code: otpCode, expiresAt },
          update: { name, code: otpCode, expiresAt },
        });

        // Create VerificationCode record for magic link
        const verificationCode = await db.verificationCode.create({
          data: {
            email,
            code: otpCode,
            type: 'MAGIC_LINK',
            expiresAt,
            used: false,
          },
        });

        // Generate magic link with secure JWT
        const magicLinkToken = signMagicLinkToken({
          email,
          tokenId: verificationCode.id,
          type: 'signup',
          name,
        });

        const magicLinkUrl = `${appBaseUrl}/signup/verify-magic?token=${magicLinkToken}`;

        // Send WELCOME email (first time user)
        await emailService.sendWelcomeSignupEmail(email, name, otpCode, magicLinkUrl, 10);

        return response.success({ sent: true, message: 'Código enviado para seu email' });
      },
    }),

    /**
     * Verify Signup OTP - Create user
     */
    verifySignupOTP: igniter.mutation({
      name: 'Verify Signup OTP',
      description: 'Verify signup OTP and create user',
      path: '/verify-signup-otp',
      method: 'POST',
      body: verifySignupOTPSchema,
      handler: async ({ request, response }) => {
        const { email, code } = request.body;

        const tempUser = await db.tempUser.findUnique({ where: { email } });

        if (!tempUser || tempUser.code !== code) {
          return response.status(400).json({ error: 'Código inválido' });
        }

        if (tempUser.expiresAt < new Date()) {
          return response.status(400).json({ error: 'Código expirado' });
        }

        const existingUser = await db.user.findUnique({ where: { email } });
        if (existingUser) {
          return response.status(400).json({ error: 'Usuário já existe' });
        }

        const usersCount = await db.user.count();
        const isFirstUser = usersCount === 0;

        const slug = tempUser.name.toLowerCase().replace(/[^a-z0-9]/g, '-').substring(0, 50);
        const uniqueDocument = crypto.randomUUID().replace(/-/g, '').substring(0, 14);

        const organization = await db.organization.create({
          data: {
            name: `${tempUser.name}'s Organization`,
            slug: `${slug}-${Date.now()}`,
            document: uniqueDocument,
            type: 'pf',
            isActive: true,
          },
        });

        const user = await db.user.create({
          data: {
            email: tempUser.email,
            name: tempUser.name,
            password: null, // Passwordless — magic link user
            role: isFirstUser ? UserRole.ADMIN : UserRole.USER,
            emailVerified: new Date(),
            currentOrgId: organization.id,
            organizations: {
              create: {
                organizationId: organization.id,
                role: 'master',
              },
            },
          },
        });

        await db.tempUser.delete({ where: { email } });

        // Auto-join by verified domain (fail-open, non-blocking)
        await autoJoinByVerifiedDomain(user.id, user.email, request);

        const accessToken = signAccessToken({
          userId: user.id,
          email: user.email,
          role: user.role as UserRole,
          currentOrgId: organization.id,
          organizationRole: 'master',
          needsOnboarding: !user.onboardingCompleted, // ✅ Incluir no token para middleware (será false para novo signup)
        }, '24h');

        const refreshTokenData = await db.refreshToken.create({
          data: {
            userId: user.id,
            token: signRefreshToken({ userId: user.id, tokenId: '' }),
            expiresAt: getExpirationDate('7d'),
          },
        });

        const refreshToken = signRefreshToken({
          userId: user.id,
          tokenId: refreshTokenData.id,
        });

        await db.refreshToken.update({
          where: { id: refreshTokenData.id },
          data: { token: refreshToken },
        });

        await emailService.sendWelcomeEmail(user.email, user.name, dashboardUrl);

        // Set httpOnly cookies
        setAuthCookies(response, accessToken, refreshToken);

        return response.success({
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            currentOrgId: organization.id,
            organizationRole: 'master',
          },
        });
      },
    }),

    /**
     * Resend Verification - Reenviar código de verificação
     */
    resendVerification: igniter.mutation({
      name: 'Resend Verification',
      description: 'Resend verification code',
      path: '/resend-verification',
      method: 'POST',
      body: sendVerificationSchema,
      handler: async ({ request, response }) => {
        const { email } = request.body;

        const user = await db.user.findUnique({ where: { email } });
        if (!user) {
          return response.success({ sent: true }); // Não revelar se email existe
        }

        if (user.emailVerified) {
          return response.status(400).json({ error: 'Email already verified' });
        }

        // Gerar novo código
        const code = generateOTPCode();
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

        await db.user.update({
          where: { email },
          data: {
            resetToken: code,
            resetTokenExpiry: expiresAt,
          },
        });

        // Enviar email
        await emailService.send({
          to: email,
          subject: 'Novo Código de Verificação - Quayer',
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #9333ea;">Novo código de verificação</h2>
              <p>Seu novo código é:</p>
              <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;">
                <h1 style="color: #9333ea; font-size: 32px; letter-spacing: 8px; margin: 0;">${code}</h1>
              </div>
              <p style="color: #6b7280;">Este código expira em 15 minutos.</p>
            </div>
          `,
        });

        return response.success({ sent: true });
      },
    }),

    /**
     * Login OTP - Request passwordless login code (OTP + Magic Link)
     */
    loginOTP: igniter.mutation({
      name: 'Login OTP',
      description: 'Request passwordless login code via email',
      path: '/login-otp',
      method: 'POST',
      body: passwordlessOTPSchema,
      handler: async ({ request, response }) => {
        // Rate limiting
        const identifier = getClientIdentifier(request);
        const rateLimit = await authRateLimiter.check(identifier);

        if (!rateLimit.success) {
          return response.status(429).json({
            error: 'Too many requests',
            retryAfter: rateLimit.retryAfter,
          });
        }

        const { email } = request.body;

        // Buscar usuário
        const user = await db.user.findUnique({ where: { email } });

        // 🚀 NOVO: Se usuário não existe, enviar OTP de SIGNUP automaticamente
        if (!user) {
          const signupOtpCode = generateOTPCode();
          const signupExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
          const tempName = email.split('@')[0]; // Extract name from email

          // Salvar em TempUser para signup
          await db.tempUser.upsert({
            where: { email },
            create: { email, name: tempName, code: signupOtpCode, expiresAt: signupExpiresAt },
            update: { code: signupOtpCode, expiresAt: signupExpiresAt },
          });

          // Criar VerificationCode para magic link de signup
          const signupVerificationCode = await db.verificationCode.create({
            data: {
              email,
              code: signupOtpCode,
              type: 'MAGIC_LINK',
              expiresAt: signupExpiresAt,
              used: false,
            },
          });

          // Gerar magic link para signup
          const signupMagicLinkToken = signMagicLinkToken({
            email,
            tokenId: signupVerificationCode.id,
            type: 'signup',
          });

          const signupMagicLinkUrl = `${appBaseUrl}/signup/verify-magic?token=${signupMagicLinkToken}`;

          // Enviar email de SIGNUP (boas-vindas)
          await emailService.sendWelcomeSignupEmail(
            email,
            email.split('@')[0], // Nome temporário a partir do email
            signupOtpCode,
            signupMagicLinkUrl,
            10
          );

          return response.success({
            sent: true,
            isNewUser: true,
            message: 'Código de cadastro enviado para seu email',
            magicLinkSessionId: signupVerificationCode.id,
          });
        }

        // Gerar código OTP de 6 dígitos para LOGIN
        const otpCode = generateOTPCode();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutos

        // Salvar OTP code no banco para todos os usuários (incluindo admin)
        await db.user.update({
          where: { email },
          data: {
            resetToken: otpCode,
            resetTokenExpiry: expiresAt,
          },
        });

        // Create VerificationCode record for magic link
        const verificationCode = await db.verificationCode.create({
          data: {
            userId: user.id,
            email,
            code: otpCode,
            type: 'MAGIC_LINK',
            expiresAt,
            used: false,
          },
        });

        // Gerar magic link JWT seguro (válido por 10 minutos)
        const magicLinkToken = signMagicLinkToken({
          email,
          tokenId: verificationCode.id,
          type: 'login',
        });

        // Gerar URL completa do magic link
        const magicLinkUrl = `${appBaseUrl}/login/verify-magic?token=${magicLinkToken}`;

        // Enviar email com AMBOS: código OTP e magic link (Vercel pattern)
        await emailService.sendLoginCodeEmail(
          user.email,
          user.name,
          otpCode,
          magicLinkUrl,
          10
        );

        return response.success({
          sent: true,
          message: 'Login code sent to your email',
          magicLinkSessionId: verificationCode.id,
        });
      },
    }),

    /**
     * Verify Login OTP - Validate OTP code and return tokens
     */
    verifyLoginOTP: igniter.mutation({
      name: 'Verify Login OTP',
      description: 'Verify passwordless OTP code',
      path: '/verify-login-otp',
      method: 'POST',
      body: verifyPasswordlessOTPSchema,
      handler: async ({ request, response }) => {
        const { email, code } = request.body;

        // Buscar usuário
        const user = await db.user.findUnique({
          where: { email },
          include: {
            organizations: {
              where: { isActive: true },
              include: { organization: true },
            },
          },
        });

        if (!user) {
          return response.status(400).json({ error: 'Invalid code' });
        }

        // Verificar se o código OTP é válido
        if (user.resetToken !== code) {
          return response.status(400).json({ error: 'Invalid or expired code' });
        }

        // Verificar expiração
        if (!user.resetTokenExpiry || user.resetTokenExpiry < new Date()) {
          return response.status(400).json({ error: 'Code expired' });
        }

        // Verificar se usuário está ativo
        if (!user.isActive) {
          return response.status(403).json({ error: 'Account disabled' });
        }

        // Limpar código usado
        await db.user.update({
          where: { email },
          data: {
            resetToken: null,
            resetTokenExpiry: null,
          },
        });

        // Se admin não tem org setada, setar primeira org disponível
        let currentOrgId = user.currentOrgId;
        if (user.role === 'admin' && !currentOrgId && user.organizations.length > 0) {
          currentOrgId = user.organizations[0].organizationId;
          await db.user.update({
            where: { id: user.id },
            data: { currentOrgId },
          });
        }

        // Obter role na organização atual
        const currentOrgRelation = user.organizations.find(
          (org) => org.organizationId === currentOrgId
        );

        // Criar access token (24h conforme especificação)
        const accessToken = signAccessToken({
          userId: user.id,
          email: user.email,
          role: user.role as UserRole,
          currentOrgId,
          organizationRole: currentOrgRelation?.role as any,
          needsOnboarding: !user.onboardingCompleted, // ✅ Incluir no token para middleware
        }, '24h');

        // Criar refresh token (7 dias)
        const refreshTokenData = await db.refreshToken.create({
          data: {
            userId: user.id,
            token: signRefreshToken({ userId: user.id, tokenId: '' }),
            expiresAt: getExpirationDate('7d'),
          },
        });

        const refreshToken = signRefreshToken({
          userId: user.id,
          tokenId: refreshTokenData.id,
        });

        await db.refreshToken.update({
          where: { id: refreshTokenData.id },
          data: { token: refreshToken },
        });

        // Register device session + geo check BEFORE setting cookies
        const deviceResult = await registerDeviceSession(user.id, request);
        if (deviceResult.blocked) {
          return Response.json(
            { error: 'Login bloqueado por política de segurança. Contate o administrador.' },
            { status: 403 }
          );
        }

        // Set httpOnly cookies — only after device check passes
        setAuthCookies(response, accessToken, refreshToken);

        return response.success({
          needsOnboarding: !user.onboardingCompleted,
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            currentOrgId,
            organizationRole: currentOrgRelation?.role,
          },
        });
      },
    }),

    /**
     * Verify Magic Link - Validate magic link token and return tokens
     */
    verifyMagicLink: igniter.mutation({
      name: 'Verify Magic Link',
      description: 'Verify magic link token (login or signup)',
      path: '/verify-magic-link',
      method: 'POST',
      body: verifyMagicLinkSchema,
      handler: async ({ request, response }) => {
        const { token } = request.body;

        // Verificar token JWT (magic link)
        const payload = verifyMagicLinkToken(token);
        if (!payload) {
          return response.status(400).json({ error: 'Invalid or expired magic link' });
        }

        // Buscar verification code no banco
        const verificationCode = await db.verificationCode.findUnique({
          where: { id: payload.tokenId },
        });

        if (!verificationCode || verificationCode.used) {
          return response.status(400).json({ error: 'Magic link already used or expired' });
        }

        if (verificationCode.expiresAt < new Date()) {
          return response.status(400).json({ error: 'Magic link expired' });
        }

        // Marcar como usado
        await db.verificationCode.update({
          where: { id: verificationCode.id },
          data: { used: true },
        });

        // SIGNUP: Criar novo usuário
        if (payload.type === 'magic-link-signup') {
          // Verificar se já existe
          const existingUser = await db.user.findUnique({ where: { email: payload.email } });
          if (existingUser) {
            return response.status(400).json({ error: 'Usuário já existe' });
          }

          // Buscar TempUser com o nome
          const tempUser = await db.tempUser.findUnique({ where: { email: payload.email } });
          if (!tempUser) {
            return response.status(400).json({ error: 'Signup data not found' });
          }

          const usersCount = await db.user.count();
          const isFirstUser = usersCount === 0;

          const slug = tempUser.name.toLowerCase().replace(/[^a-z0-9]/g, '-').substring(0, 50);
          const uniqueDocument = crypto.randomUUID().replace(/-/g, '').substring(0, 14);

          const organization = await db.organization.create({
            data: {
              name: `${tempUser.name}'s Organization`,
              slug: `${slug}-${Date.now()}`,
              document: uniqueDocument,
              type: 'pf',
              isActive: true,
            },
          });

          const user = await db.user.create({
            data: {
              email: tempUser.email,
              name: tempUser.name,
              password: null, // Passwordless — OTP signup user
              role: isFirstUser ? UserRole.ADMIN : UserRole.USER,
              emailVerified: new Date(),
              currentOrgId: organization.id,
              organizations: {
                create: {
                  organizationId: organization.id,
                  role: 'master',
                },
              },
            },
          });

          await db.tempUser.delete({ where: { email: payload.email } });

          // Auto-join by verified domain (fail-open, non-blocking)
          await autoJoinByVerifiedDomain(user.id, user.email, request);

          const accessToken = signAccessToken({
            userId: user.id,
            email: user.email,
            role: user.role as UserRole,
            currentOrgId: organization.id,
            organizationRole: 'master',
            needsOnboarding: !user.onboardingCompleted, // ✅ Incluir no token para middleware (será false para novo signup)
          }, '24h');

          const refreshTokenData = await db.refreshToken.create({
            data: {
              userId: user.id,
              token: signRefreshToken({ userId: user.id, tokenId: '' }),
              expiresAt: getExpirationDate('7d'),
            },
          });

          const refreshToken = signRefreshToken({
            userId: user.id,
            tokenId: refreshTokenData.id,
          });

          await db.refreshToken.update({
            where: { id: refreshTokenData.id },
            data: { token: refreshToken },
          });

          await emailService.sendWelcomeEmail(user.email, user.name, dashboardUrl);

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
              currentOrgId: organization.id,
              organizationRole: 'master',
            },
          });
        }

        // LOGIN: Autenticar usuário existente
        if (payload.type === 'magic-link-login') {
          const user = await db.user.findUnique({
            where: { email: payload.email },
            include: {
              organizations: {
                where: { isActive: true },
                include: { organization: true },
              },
            },
          });

          if (!user) {
            return response.status(404).json({ error: 'User not found' });
          }

          if (!user.isActive) {
            return response.status(403).json({ error: 'Account disabled' });
          }

          // 2FA check: if user has TOTP enabled, return challenge
          if (user.twoFactorEnabled) {
            const challengeId = sign2faChallenge(user.id);
            createAuditLog('2FA_CHALLENGE_ISSUED', user.id, request, { method: 'magic-link' }, user.currentOrgId);
            return response.success({ requiresTwoFactor: true, challengeId });
          }

          let currentOrgId = user.currentOrgId;
          if (user.role === 'admin' && !currentOrgId && user.organizations.length > 0) {
            currentOrgId = user.organizations[0].organizationId;
            await db.user.update({
              where: { id: user.id },
              data: { currentOrgId },
            });
          }

          const currentOrgRelation = user.organizations.find(
            (org) => org.organizationId === currentOrgId
          );

          const accessToken = signAccessToken({
            userId: user.id,
            email: user.email,
            role: user.role as UserRole,
            currentOrgId,
            organizationRole: currentOrgRelation?.role as any,
            needsOnboarding: !user.onboardingCompleted, // ✅ Incluir no token para middleware
          }, '24h');

          const refreshTokenData = await db.refreshToken.create({
            data: {
              userId: user.id,
              token: signRefreshToken({ userId: user.id, tokenId: '' }),
              expiresAt: getExpirationDate('7d'),
            },
          });

          const refreshToken = signRefreshToken({
            userId: user.id,
            tokenId: refreshTokenData.id,
          });

          await db.refreshToken.update({
            where: { id: refreshTokenData.id },
            data: { token: refreshToken },
          });

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
              currentOrgId,
              organizationRole: currentOrgRelation?.role,
            },
          });
        }

        return response.status(400).json({ error: 'Invalid magic link type' });
      },
    }),

    /**
     * Check Magic Link Status — polling from original tab
     *
     * The original tab (OTP form) polls this endpoint every 3s to detect
     * when the magic link has been verified in another tab.
     * When verified, this endpoint issues auth cookies for the polling tab
     * so it can redirect to the dashboard.
     */
    checkMagicLinkStatus: igniter.mutation({
      name: 'Check Magic Link Status',
      description: 'Poll to check if magic link was verified (for cross-tab login)',
      path: '/check-magic-link-status',
      method: 'POST',
      body: checkMagicLinkStatusSchema,
      handler: async ({ request, response }) => {
        const { sessionId } = request.body;

        // Rate limiting — reuse auth rate limiter with unique prefix for polling
        const identifier = getClientIdentifier(request);
        const rateLimit = await authRateLimiter.check(`mlpoll:${identifier}`);
        if (!rateLimit.success) {
          return response.status(429).json({ error: 'Too many requests', retryAfter: rateLimit.retryAfter });
        }

        // Find the VerificationCode by ID
        const verificationCode = await db.verificationCode.findUnique({
          where: { id: sessionId },
        });

        if (!verificationCode) {
          return response.status(404).json({ error: 'Session not found' });
        }

        // Check if expired (5 minute polling timeout)
        if (verificationCode.expiresAt < new Date()) {
          return response.success({ verified: false, expired: true });
        }

        // Not yet verified — magic link hasn't been clicked
        if (!verificationCode.used) {
          return response.success({ verified: false, expired: false });
        }

        // Magic link WAS verified in another tab!
        // Now authenticate this tab too by issuing cookies.
        const user = await db.user.findUnique({
          where: { email: verificationCode.email },
          include: {
            organizations: {
              where: { isActive: true },
              include: { organization: true },
            },
          },
        });

        if (!user) {
          return response.status(404).json({ error: 'User not found' });
        }

        if (!user.isActive) {
          return response.status(403).json({ error: 'Account disabled' });
        }

        // If 2FA is enabled, the new tab already handled 2FA.
        // The original tab cannot bypass 2FA, so signal requiresTwoFactor
        // and let the original tab show the 2FA challenge.
        if (user.twoFactorEnabled) {
          const challengeId = sign2faChallenge(user.id);
          return response.success({ verified: true, requiresTwoFactor: true, challengeId });
        }

        let currentOrgId = user.currentOrgId;
        if (user.role === 'admin' && !currentOrgId && user.organizations.length > 0) {
          currentOrgId = user.organizations[0].organizationId;
          await db.user.update({
            where: { id: user.id },
            data: { currentOrgId },
          });
        }

        const currentOrgRelation = user.organizations.find(
          (org) => org.organizationId === currentOrgId
        );

        // Issue tokens for this tab
        const accessToken = signAccessToken({
          userId: user.id,
          email: user.email,
          role: user.role as UserRole,
          currentOrgId,
          organizationRole: currentOrgRelation?.role as any,
          needsOnboarding: !user.onboardingCompleted,
        }, '24h');

        const refreshTokenData = await db.refreshToken.create({
          data: {
            userId: user.id,
            token: signRefreshToken({ userId: user.id, tokenId: '' }),
            expiresAt: getExpirationDate('7d'),
          },
        });

        const refreshToken = signRefreshToken({
          userId: user.id,
          tokenId: refreshTokenData.id,
        });

        await db.refreshToken.update({
          where: { id: refreshTokenData.id },
          data: { token: refreshToken },
        });

        // Set httpOnly cookies for this tab
        setAuthCookies(response, accessToken, refreshToken);

        // Register device session (non-blocking)
        await registerDeviceSession(user.id, request);

        // Determine redirect path
        let redirectPath = '/integracoes';
        if (!user.onboardingCompleted || !currentOrgId) {
          redirectPath = '/onboarding';
        } else if (user.role === 'admin') {
          redirectPath = '/admin';
        }

        return response.success({
          verified: true,
          redirectPath,
          needsOnboarding: !user.onboardingCompleted,
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            currentOrgId,
            organizationRole: currentOrgRelation?.role,
          },
        });
      },
    }),

    /**
     * Complete Onboarding - Marcar onboarding como completo
     */
    completeOnboarding: igniter.mutation({
      name: 'CompleteOnboarding',
      description: 'Mark user onboarding as completed',
      path: '/onboarding/complete',
      method: 'POST',
      use: [authProcedure({ required: true }), csrfProcedure()],
      handler: async ({ request, response, context }) => {
        const userId = context.auth?.session?.user?.id;

        if (!userId) {
          return response.unauthorized('Authentication required');
        }

        const user = await db.user.findUnique({
          where: { id: userId },
          include: {
            organizations: {
              include: {
                organization: true,
              },
            },
          },
        });

        if (!user) {
          return response.notFound('User not found');
        }

        // Verificar se usuário tem organização
        if (user.organizations.length === 0) {
          return response.badRequest(
            'Cannot complete onboarding without an organization'
          );
        }

        // Marcar onboarding como completo
        const currentOrgId = user.currentOrgId || user.organizations[0].organizationId;
        const updatedUser = await db.user.update({
          where: { id: userId },
          data: {
            onboardingCompleted: true,
            lastOrganizationId: currentOrgId,
            currentOrgId,
          },
        });

        // Emitir novo JWT com needsOnboarding: false para que o middleware deixe o usuário passar
        const currentOrgRelation = user.organizations.find(
          (org) => org.organizationId === currentOrgId
        );
        const newAccessToken = signAccessToken({
          userId: updatedUser.id,
          email: updatedUser.email,
          role: updatedUser.role as UserRole,
          currentOrgId,
          organizationRole: currentOrgRelation?.role as any,
          needsOnboarding: false,
        });
        setAuthCookies(response, newAccessToken);

        return response.success({
          message: 'Onboarding completed successfully',
          user: {
            id: updatedUser.id,
            email: updatedUser.email,
            name: updatedUser.name,
            onboardingCompleted: updatedUser.onboardingCompleted,
            currentOrgId,
          },
        });
      },
    }),

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
      body: z.object({ response: z.any(), name: z.string().optional().default('Minha Passkey') }),
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
          response: request.body.response,
          expectedChallenge: challenge.challenge,
          expectedOrigin: origin,
          expectedRPID: rpID,
        });

        if (!verified || !registrationInfo) return response.badRequest('Verificação de passkey falhou');

        const { credential } = registrationInfo;
        await db.passkeyCredential.create({
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

        const passkeyId = (request as any).params?.passkeyId;
        if (!passkeyId) return response.badRequest('ID da passkey é obrigatório');

        const credential = await db.passkeyCredential.findFirst({
          where: { id: passkeyId, userId: user.id },
        });
        if (!credential) return response.notFound('Passkey não encontrada');

        await db.passkeyCredential.delete({ where: { id: passkeyId } });
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
      body: z.object({ email: z.string().email(), response: z.any() }),
      handler: async ({ request, response }) => {
        const { email } = request.body;

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
          response: request.body.response,
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
        setAuthCookies(response, accessToken, refreshToken);

        return response.success({
          needsOnboarding: !user.onboardingCompleted,
          user: { id: user.id, email: user.email, name: user.name, role: user.role },
        });
      },
    }),

    loginOTPPhone: igniter.mutation({
      name: 'Login OTP Phone',
      path: '/login-otp-phone',
      method: 'POST',
      body: phoneOTPSchema,
      use: [turnstileProcedure()],
      handler: async ({ request, response }) => {
        const normalized = normalizePhone(request.body.phone)
        const clientIp = getClientIdentifier(request)

        // Rate-limit: 3 por telefone/15min, 5 por IP/hora
        const rateLimitResult = await checkOtpRateLimit(normalized, clientIp)
        if (!rateLimitResult.success) {
          const retryAfter = rateLimitResult.retryAfter || 60
          console.warn(`[loginOTPPhone] Rate limited — phone: ${normalized}, IP: ${clientIp}`)
          return Response.json(
            { error: `Muitas tentativas. Tente novamente em ${Math.ceil(retryAfter / 60)} minuto(s).` },
            { status: 429, headers: { 'Retry-After': String(retryAfter) } }
          )
        }

        const code = generateOTPCode()

        await db.verificationCode.deleteMany({ where: { email: normalized, type: 'WHATSAPP_OTP' } })
        await db.verificationCode.create({
          data: {
            email: normalized,
            code,
            type: 'WHATSAPP_OTP',
            expiresAt: new Date(Date.now() + 10 * 60 * 1000),
          },
        })

        try {
          await sendWhatsAppOTP(normalized, code)
        } catch (err) {
          console.error('[loginOTPPhone] sendWhatsAppOTP failed:', err)
          return response.badRequest('Serviço WhatsApp temporariamente indisponível. Tente fazer login com email.')
        }

        return response.success({ sent: true })
      },
    }),

    verifyLoginOTPPhone: igniter.mutation({
      name: 'Verify Login OTP Phone',
      path: '/verify-login-otp-phone',
      method: 'POST',
      body: verifyPhoneOTPSchema,
      handler: async ({ request, response }) => {
        const normalized = normalizePhone(request.body.phone)

        const vc = await db.verificationCode.findFirst({
          where: { email: normalized, type: 'WHATSAPP_OTP', expiresAt: { gt: new Date() } },
        })

        if (!vc || vc.code !== request.body.code) {
          return response.badRequest('Código inválido ou expirado')
        }

        const user = await db.user.findFirst({
          where: { phone: normalized },
          include: {
            organizations: {
              where: { isActive: true },
              include: { organization: true },
            },
          },
        })

        let createdUser = user
        if (!createdUser) {
          createdUser = await db.user.create({
            data: {
              email: normalized + '@phone.quayer.app',
              phone: normalized,
              name: 'Usuário WhatsApp',
              password: null, // Passwordless — phone OTP user
              role: 'user',
              emailVerified: null,
              phoneVerified: true,
              onboardingCompleted: false,
            },
            include: {
              organizations: {
                where: { isActive: true },
                include: { organization: true },
              },
            },
          })
        }

        await db.verificationCode.delete({ where: { id: vc.id } })

        // Auto-join by verified domain for newly created phone users (fail-open)
        if (!user) {
          await autoJoinByVerifiedDomain(createdUser.id, createdUser.email, request);
        }

        // 2FA check: if existing user has TOTP enabled, return challenge (skip for newly created)
        if (user && createdUser.twoFactorEnabled) {
          const challengeId = sign2faChallenge(createdUser.id);
          createAuditLog('2FA_CHALLENGE_ISSUED', createdUser.id, request, { method: 'phone-otp' });
          return response.success({ requiresTwoFactor: true, challengeId });
        }

        // Set org if admin without current org
        let currentOrgId = createdUser.currentOrgId;
        if (createdUser.role === 'admin' && !currentOrgId && createdUser.organizations.length > 0) {
          currentOrgId = createdUser.organizations[0].organizationId;
          await db.user.update({ where: { id: createdUser.id }, data: { currentOrgId } });
        }

        const currentOrgRelation = createdUser.organizations.find(o => o.organizationId === currentOrgId);

        const accessToken = signAccessToken({
          userId: createdUser.id,
          email: createdUser.email,
          role: createdUser.role as UserRole,
          currentOrgId,
          organizationRole: currentOrgRelation?.role as any,
          needsOnboarding: !createdUser.onboardingCompleted,
        }, '24h');

        const refreshTokenData = await db.refreshToken.create({
          data: {
            userId: createdUser.id,
            token: crypto.randomBytes(32).toString('hex'),
            expiresAt: getExpirationDate('7d'),
          },
        });

        const refreshToken = signRefreshToken({ userId: createdUser.id, tokenId: refreshTokenData.id });
        setAuthCookies(response, accessToken, refreshToken);

        return response.success({
          needsOnboarding: !createdUser.onboardingCompleted,
          user: {
            id: createdUser.id,
            email: createdUser.email,
            name: createdUser.name,
            role: createdUser.role,
            currentOrgId,
          },
        });
      },
    }),

    passkeyConditionalChallenge: igniter.mutation({
      name: 'Passkey Conditional Challenge',
      path: '/passkey/login/challenge',
      method: 'POST',
      handler: async ({ response }) => {
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
      body: z.object({ response: z.any(), challengeId: z.string() }),
      handler: async ({ request, response }) => {
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
          response: body.response,
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
        setAuthCookies(response, accessToken, refreshToken);

        return response.success({
          needsOnboarding: !user.onboardingCompleted,
          user: { id: user.id, email: user.email, name: user.name, role: user.role },
        });
      },
    }),

    /**
     * TOTP Setup - Iniciar configuração de 2FA
     *
     * Gera secret TOTP, QR code e recovery codes para o usuário.
     * Recovery codes são retornados em plaintext apenas nesta resposta.
     */
    totpSetup: igniter.mutation({
      name: 'TOTP Setup',
      description: 'Start 2FA setup: generate TOTP secret, QR code, and recovery codes',
      path: '/totp/setup',
      method: 'POST',
      use: [authProcedure({ required: true })],
      body: totpSetupSchema,
      handler: async ({ request, response, context }) => {
        // Rate limiting: 5 requests / 15 min
        const identifier = getClientIdentifier(request);
        const rateLimit = await authRateLimiter.check(`totp-setup:${identifier}`);
        if (!rateLimit.success) {
          return response.status(429).json({
            error: 'Too many requests',
            retryAfter: rateLimit.retryAfter,
          });
        }

        const user = context.auth?.session?.user;
        if (!user) return response.unauthorized('Authentication required');
        const userId = user.id;

        // Check if user already has a verified TOTP device
        const existingVerifiedDevice = await db.totpDevice.findFirst({
          where: { userId, verified: true },
        });

        if (existingVerifiedDevice) {
          return response.status(400).json({
            error: 'TOTP já configurado',
            code: 'TOTP_ALREADY_CONFIGURED',
          });
        }

        // Delete any unverified devices (previous incomplete setups)
        await db.totpDevice.deleteMany({
          where: { userId, verified: false },
        });

        // Delete any existing unused recovery codes from incomplete setups
        await db.recoveryCode.deleteMany({
          where: { userId, usedAt: null },
        });

        // Generate TOTP secret using otpauth
        const totp = new OTPAuth.TOTP({
          issuer: 'Quayer',
          label: user.email || userId,
          algorithm: 'SHA1',
          digits: 6,
          period: 30,
          secret: new OTPAuth.Secret(),
        });

        const otpauthUri = totp.toString();
        const secretBase32 = totp.secret.base32;

        // Generate QR code as base64 data URL
        const qrCodeDataUrl = await QRCode.toDataURL(otpauthUri);

        // Encrypt the secret before storing
        const encryptedSecret = encrypt(secretBase32);

        // Create TotpDevice with verified=false
        const device = await db.totpDevice.create({
          data: {
            userId,
            secret: encryptedSecret,
            name: 'Authenticator App',
            verified: false,
          },
        });

        // Generate 8 recovery codes
        const recoveryCodes = generateRecoveryCodes(8);

        // Hash and store recovery codes (bcrypt 12 rounds)
        const recoveryCodePromises = recoveryCodes.map(async (code) => {
          const hashedCode = await hashPassword(code);
          return db.recoveryCode.create({
            data: {
              userId,
              code: hashedCode,
            },
          });
        });
        await Promise.all(recoveryCodePromises);

        return response.success({
          deviceId: device.id,
          otpauthUri,
          qrCode: qrCodeDataUrl,
          secret: secretBase32,
          recoveryCodes,
        });
      },
    }),

    /**
     * TOTP Verify - Confirmar setup de 2FA
     *
     * Valida o código TOTP do authenticator para ativar 2FA na conta.
     */
    totpVerify: igniter.mutation({
      name: 'TOTP Verify',
      description: 'Confirm 2FA setup by verifying a TOTP code from the authenticator app',
      path: '/totp/verify',
      method: 'POST',
      use: [authProcedure({ required: true })],
      body: totpVerifySchema,
      handler: async ({ request, response, context }) => {
        // Rate limiting: 5 attempts / 15 min
        const identifier = getClientIdentifier(request);
        const rateLimit = await authRateLimiter.check(`totp-verify:${identifier}`);
        if (!rateLimit.success) {
          return response.status(429).json({
            error: 'Too many attempts',
            retryAfter: rateLimit.retryAfter,
          });
        }

        const user = context.auth?.session?.user;
        if (!user) return response.unauthorized('Authentication required');
        const userId = user.id;

        const { code, deviceId } = request.body;

        // Find the TotpDevice by deviceId, must belong to the user
        const device = await db.totpDevice.findFirst({
          where: { id: deviceId, userId },
        });

        if (!device) {
          return response.status(404).json({
            error: 'Device not found',
            code: 'DEVICE_NOT_FOUND',
          });
        }

        if (device.verified) {
          return response.status(400).json({
            error: 'Device already verified',
            code: 'DEVICE_ALREADY_VERIFIED',
          });
        }

        // Decrypt the stored secret
        const secretBase32 = decrypt(device.secret);

        // Validate TOTP code with window=1 (accepts ±1 period)
        const totp = new OTPAuth.TOTP({
          issuer: 'Quayer',
          label: user.email || userId,
          algorithm: 'SHA1',
          digits: 6,
          period: 30,
          secret: OTPAuth.Secret.fromBase32(secretBase32),
        });

        const delta = totp.validate({ token: code, window: 1 });

        if (delta === null) {
          return response.status(400).json({
            error: 'invalid_code',
            code: 'INVALID_TOTP_CODE',
          });
        }

        // Code is valid — mark device as verified and enable 2FA on user
        await db.$transaction([
          db.totpDevice.update({
            where: { id: deviceId },
            data: { verified: true },
          }),
          db.user.update({
            where: { id: userId },
            data: { twoFactorEnabled: true },
          }),
        ]);

        await createAuditLog('TOTP_ENABLED', userId, request, { deviceId }, user.currentOrgId);

        return response.success({
          verified: true,
          twoFactorEnabled: true,
        });
      },
    }),

    /**
     * TOTP Challenge — validate 2FA code during login flow
     * Called after login/googleCallback/verifyMagicLink/verifyLoginOTPPhone returns requiresTwoFactor=true
     */
    totpChallenge: igniter.mutation({
      name: 'TOTP Challenge',
      description: 'Validate TOTP code for 2FA login challenge',
      path: '/totp-challenge',
      method: 'POST',
      body: totpChallengeSchema,
      handler: async ({ request, response }) => {
        const { challengeId, code } = request.body;

        // Check attempt count before doing any work
        const attempts = await getChallengeAttempts(challengeId);
        if (attempts >= MAX_2FA_ATTEMPTS) {
          return response.status(403).json({
            error: 'Too many failed attempts. Please login again.',
            code: 'CHALLENGE_EXHAUSTED',
          });
        }

        // Verify challengeId JWT
        const challengePayload = verify2faChallenge(challengeId);
        if (!challengePayload) {
          return response.status(400).json({
            error: 'Invalid or expired challenge. Please login again.',
            code: 'INVALID_CHALLENGE',
          });
        }

        const { userId } = challengePayload;

        // Fetch user with verified TOTP device
        const user = await db.user.findUnique({
          where: { id: userId },
          include: {
            totpDevices: { where: { verified: true }, take: 1 },
            organizations: {
              where: { isActive: true },
              include: { organization: true },
            },
          },
        });

        if (!user || !user.twoFactorEnabled || user.totpDevices.length === 0) {
          return response.status(400).json({
            error: '2FA is not configured for this account.',
            code: 'NO_2FA',
          });
        }

        // Decrypt TOTP secret and validate code
        const device = user.totpDevices[0];
        const secretBase32 = decrypt(device.secret);

        const totp = new OTPAuth.TOTP({
          issuer: 'Quayer',
          label: user.email,
          algorithm: 'SHA1',
          digits: 6,
          period: 30,
          secret: OTPAuth.Secret.fromBase32(secretBase32),
        });

        const delta = totp.validate({ token: code, window: 1 });

        if (delta === null) {
          const newAttempts = await incrementChallengeAttempts(challengeId);
          const remaining = MAX_2FA_ATTEMPTS - newAttempts;
          createAuditLog('2FA_CHALLENGE_FAILED', userId, request, { attempts: newAttempts });
          return response.status(400).json({
            error: 'Invalid TOTP code.',
            code: 'INVALID_CODE',
            attemptsRemaining: remaining,
          });
        }

        // Code valid — issue tokens
        let currentOrgId = user.currentOrgId;
        if (user.role === 'admin' && !currentOrgId && user.organizations.length > 0) {
          currentOrgId = user.organizations[0].organizationId;
          await db.user.update({ where: { id: user.id }, data: { currentOrgId } });
        }

        const currentOrgRelation = user.organizations.find(
          (org) => org.organizationId === currentOrgId
        );

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
            token: signRefreshToken({ userId: user.id, tokenId: '' }),
            expiresAt: getExpirationDate('7d'),
          },
        });

        const refreshToken = signRefreshToken({
          userId: user.id,
          tokenId: refreshTokenData.id,
        });

        await db.refreshToken.update({
          where: { id: refreshTokenData.id },
          data: { token: refreshToken },
        });

        // Register device session + geo check BEFORE setting cookies
        const deviceResult = await registerDeviceSession(user.id, request);
        if (deviceResult.blocked) {
          return Response.json(
            { error: 'Login bloqueado por política de segurança. Contate o administrador.' },
            { status: 403 }
          );
        }

        // Set httpOnly cookies — only after device check passes
        setAuthCookies(response, accessToken, refreshToken);

        // Clean up challenge attempts
        getRedis().del(`${CHALLENGE_ATTEMPTS_PREFIX}${challengeId}`).catch(() => {});

        await createAuditLog('LOGIN_SUCCESS', userId, request, { method: '2fa_totp' }, user.currentOrgId);

        return response.success({
          needsOnboarding: !user.onboardingCompleted,
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            currentOrgId,
            organizationRole: currentOrgRelation?.role,
          },
        });
      },
    }),

    /**
     * TOTP Recovery — login with recovery code when authenticator is unavailable
     */
    totpRecovery: igniter.mutation({
      name: 'TOTP Recovery',
      description: 'Validate a recovery code for 2FA login bypass',
      path: '/totp-recovery',
      method: 'POST',
      body: totpRecoverySchema,
      handler: async ({ request, response }) => {
        const { challengeId, recoveryCode } = request.body;

        // Check attempt count before doing any work (shares limit with totpChallenge)
        const attempts = await getChallengeAttempts(challengeId);
        if (attempts >= MAX_2FA_ATTEMPTS) {
          return response.status(403).json({
            error: 'Too many failed attempts. Please login again.',
            code: 'CHALLENGE_EXHAUSTED',
          });
        }

        // Verify challengeId JWT (same as totpChallenge)
        const challengePayload = verify2faChallenge(challengeId);
        if (!challengePayload) {
          return response.status(400).json({
            error: 'Invalid or expired challenge. Please login again.',
            code: 'INVALID_CHALLENGE',
          });
        }

        const { userId } = challengePayload;

        // Fetch user with unused recovery codes
        const user = await db.user.findUnique({
          where: { id: userId },
          include: {
            recoveryCodes: { where: { usedAt: null } },
            organizations: {
              where: { isActive: true },
              include: { organization: true },
            },
          },
        });

        if (!user || !user.twoFactorEnabled) {
          return response.status(400).json({
            error: '2FA is not configured for this account.',
            code: 'NO_2FA',
          });
        }

        if (user.recoveryCodes.length === 0) {
          return response.status(400).json({
            error: 'No recovery codes available. Contact your administrator.',
            code: 'NO_RECOVERY_CODES',
          });
        }

        // Compare recoveryCode with each hash using bcrypt.compare (timing-safe by nature)
        let matchedCodeId: string | null = null;
        const normalizedInput = recoveryCode.trim().toLowerCase();

        for (const rc of user.recoveryCodes) {
          const isMatch = await verifyPassword(normalizedInput, rc.code);
          if (isMatch) {
            matchedCodeId = rc.id;
            break;
          }
        }

        if (!matchedCodeId) {
          const newAttempts = await incrementChallengeAttempts(challengeId);
          const remaining = MAX_2FA_ATTEMPTS - newAttempts;
          createAuditLog('2FA_RECOVERY_FAILED', userId, request, { attempts: newAttempts });
          return response.status(400).json({
            error: 'Invalid recovery code.',
            code: 'INVALID_CODE',
            attemptsRemaining: remaining,
          });
        }

        // Mark recovery code as used
        await db.recoveryCode.update({
          where: { id: matchedCodeId },
          data: { usedAt: new Date() },
        });

        // Count remaining unused codes
        const remainingCodes = user.recoveryCodes.length - 1; // one just used

        await createAuditLog('LOGIN_SUCCESS', userId, request, { method: '2fa_recovery', remainingCodes }, user.currentOrgId);

        // If all codes used: disable 2FA entirely and send email alert
        if (remainingCodes === 0) {
          await db.$transaction([
            db.user.update({
              where: { id: userId },
              data: { twoFactorEnabled: false },
            }),
            db.totpDevice.deleteMany({
              where: { userId },
            }),
          ]);

          await createAuditLog('TOTP_AUTO_DISABLED', userId, request, { reason: 'all_recovery_codes_used' }, user.currentOrgId);

          // Send email alert (non-blocking)
          try {
            await emailService.send({
              to: user.email,
              subject: 'Quayer — Autenticação em duas etapas desativada',
              html: `
                <h2>2FA Desativada Automaticamente</h2>
                <p>Olá ${user.name || 'usuário'},</p>
                <p>Todos os seus códigos de recuperação foram utilizados. Por segurança, a autenticação em duas etapas (2FA) foi <strong>desativada automaticamente</strong> na sua conta.</p>
                <p>Recomendamos que você reative o 2FA o mais rápido possível nas configurações de segurança da sua conta.</p>
                <p>Se você não reconhece esta atividade, entre em contato com o suporte imediatamente.</p>
                <br/>
                <p>— Equipe Quayer</p>
              `,
            });
          } catch (emailErr) {
            console.error('[Auth] Failed to send 2FA disabled email alert:', emailErr);
          }
        }

        // Issue tokens (same flow as totpChallenge)
        let currentOrgId = user.currentOrgId;
        if (user.role === 'admin' && !currentOrgId && user.organizations.length > 0) {
          currentOrgId = user.organizations[0].organizationId;
          await db.user.update({ where: { id: user.id }, data: { currentOrgId } });
        }

        const currentOrgRelation = user.organizations.find(
          (org) => org.organizationId === currentOrgId
        );

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
            token: signRefreshToken({ userId: user.id, tokenId: '' }),
            expiresAt: getExpirationDate('7d'),
          },
        });

        const refreshToken = signRefreshToken({
          userId: user.id,
          tokenId: refreshTokenData.id,
        });

        await db.refreshToken.update({
          where: { id: refreshTokenData.id },
          data: { token: refreshToken },
        });

        // Register device session + geo check BEFORE setting cookies
        const deviceResult = await registerDeviceSession(user.id, request);
        if (deviceResult.blocked) {
          return Response.json(
            { error: 'Login bloqueado por política de segurança. Contate o administrador.' },
            { status: 403 }
          );
        }

        // Set httpOnly cookies — only after device check passes
        setAuthCookies(response, accessToken, refreshToken);

        // Clean up challenge attempts
        getRedis().del(`${CHALLENGE_ATTEMPTS_PREFIX}${challengeId}`).catch(() => {});

        // Build response
        const responseData: any = {
          needsOnboarding: !user.onboardingCompleted,
          remainingCodes,
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            currentOrgId,
            organizationRole: currentOrgRelation?.role,
          },
        };

        // Warning if few codes remaining
        if (remainingCodes > 0 && remainingCodes <= 2) {
          responseData.warning = 'few_codes_remaining';
        }

        // If all codes used, notify that 2FA was disabled
        if (remainingCodes === 0) {
          responseData.warning = '2fa_disabled_no_codes';
        }

        return response.success(responseData);
      },
    }),

    /**
     * TOTP Disable Request — envia OTP por email para confirmar desabilitação de 2FA
     *
     * Gera código de 6 dígitos, salva em VerificationCode com type='TOTP_DISABLE',
     * e envia por email. Usado como alternativa à senha para usuários sem senha (social login).
     */
    totpDisableRequest: igniter.mutation({
      name: 'TOTP Disable Request',
      description: 'Send email OTP to confirm 2FA disable',
      path: '/totp/disable-request',
      method: 'POST',
      use: [authProcedure({ required: true })],
      body: totpDisableRequestSchema,
      handler: async ({ request, response, context }) => {
        const user = context.auth?.session?.user;
        if (!user) return response.unauthorized('Authentication required');
        const userId = user.id;

        if (!user.twoFactorEnabled) {
          return response.status(400).json({
            error: '2FA is not enabled on this account.',
            code: 'TWO_FACTOR_NOT_ENABLED',
          });
        }

        if (!user.email) {
          return response.status(400).json({
            error: 'No email associated with this account.',
            code: 'NO_EMAIL',
          });
        }

        // Rate limit
        const clientIp = getClientIdentifier(request);
        const rateLimitResult = await checkOtpRateLimit(user.email, clientIp);
        if (!rateLimitResult.success) {
          const retryAfter = rateLimitResult.retryAfter || 60;
          return Response.json(
            { error: `Muitas tentativas. Tente novamente em ${Math.ceil(retryAfter / 60)} minuto(s).` },
            { status: 429, headers: { 'Retry-After': String(retryAfter) } },
          );
        }

        const otpCode = generateOTPCode();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        // Delete previous codes for this user/type
        await db.verificationCode.deleteMany({
          where: { userId, type: 'TOTP_DISABLE' },
        });

        // Create new verification code
        await db.verificationCode.create({
          data: {
            userId,
            email: user.email,
            code: otpCode,
            type: 'TOTP_DISABLE',
            expiresAt,
          },
        });

        // Send email
        try {
          await emailService.send({
            to: user.email,
            subject: 'Quayer — Código para desabilitar 2FA',
            html: `
              <h2>Código de verificação</h2>
              <p>Olá ${user.name || 'usuário'},</p>
              <p>Você solicitou a desativação da autenticação em duas etapas (2FA) na sua conta.</p>
              <p>Use o código abaixo para confirmar:</p>
              <div style="text-align:center;margin:24px 0">
                <span style="font-size:32px;font-weight:bold;letter-spacing:8px;font-family:monospace">${otpCode}</span>
              </div>
              <p>Este código expira em <strong>10 minutos</strong>.</p>
              <p>Se você não solicitou isso, ignore este email.</p>
              <br/>
              <p>— Equipe Quayer</p>
            `,
          });
        } catch (emailErr) {
          console.error('[Auth] Failed to send TOTP disable email OTP:', emailErr);
          return response.status(500).json({
            error: 'Failed to send verification email.',
            code: 'EMAIL_SEND_FAILED',
          });
        }

        await createAuditLog('TOTP_DISABLE_REQUESTED', userId, request, undefined, user.currentOrgId);

        return response.success({ sent: true });
      },
    }),

    /**
     * TOTP Disable — desabilitar 2FA na conta do usuário
     *
     * Requer código TOTP válido (ou recovery code) + senha OU emailCode como segundo fator.
     * Se o usuário não tem senha e emailCode não foi fornecido, retorna erro 'email_code_required'.
     * Deleta todos os TotpDevices e RecoveryCodes, desabilita 2FA no user.
     */
    totpDisable: igniter.mutation({
      name: 'TOTP Disable',
      description: 'Disable 2FA on the authenticated user account',
      path: '/totp/disable',
      method: 'POST',
      use: [authProcedure({ required: true })],
      body: totpDisableSchema,
      handler: async ({ request, response, context }) => {
        const user = context.auth?.session?.user;
        if (!user) return response.unauthorized('Authentication required');
        const userId = user.id;

        // User must have 2FA enabled
        if (!user.twoFactorEnabled) {
          return response.status(400).json({
            error: '2FA is not enabled on this account.',
            code: 'TWO_FACTOR_NOT_ENABLED',
          });
        }

        const { emailCode, code } = request.body;

        // Verify email OTP
        const vc = await db.verificationCode.findFirst({
          where: {
            userId,
            type: 'TOTP_DISABLE',
            used: false,
            expiresAt: { gt: new Date() },
          },
          orderBy: { createdAt: 'desc' },
        });

        if (!vc || vc.code !== emailCode) {
          return response.status(400).json({
            error: 'Invalid or expired email verification code.',
            code: 'INVALID_EMAIL_CODE',
          });
        }

        // Mark code as used
        await db.verificationCode.update({
          where: { id: vc.id },
          data: { used: true },
        });

        // Verify TOTP code OR recovery code
        let codeValid = false;

        // First try as TOTP code (6 digits)
        if (/^\d{6}$/.test(code)) {
          const device = await db.totpDevice.findFirst({
            where: { userId, verified: true },
          });

          if (device) {
            const secretBase32 = decrypt(device.secret);
            const totp = new OTPAuth.TOTP({
              issuer: 'Quayer',
              label: user.email || userId,
              algorithm: 'SHA1',
              digits: 6,
              period: 30,
              secret: OTPAuth.Secret.fromBase32(secretBase32),
            });
            const delta = totp.validate({ token: code, window: 1 });
            if (delta !== null) {
              codeValid = true;
            }
          }
        }

        // If not valid as TOTP, try as recovery code
        if (!codeValid) {
          const recoveryCodes = await db.recoveryCode.findMany({
            where: { userId, usedAt: null },
          });

          const normalizedInput = code.trim().toLowerCase();
          for (const rc of recoveryCodes) {
            const isMatch = await verifyPassword(normalizedInput, rc.code);
            if (isMatch) {
              codeValid = true;
              break;
            }
          }
        }

        if (!codeValid) {
          return response.status(400).json({
            error: 'Invalid TOTP code or recovery code.',
            code: 'INVALID_CODE',
          });
        }

        // Delete all TOTP devices and recovery codes, disable 2FA
        await db.$transaction([
          db.totpDevice.deleteMany({ where: { userId } }),
          db.recoveryCode.deleteMany({ where: { userId } }),
          db.user.update({
            where: { id: userId },
            data: { twoFactorEnabled: false },
          }),
        ]);

        await createAuditLog('TOTP_DISABLED', userId, request, undefined, user.currentOrgId);

        return response.success({
          twoFactorEnabled: false,
          message: '2FA has been disabled successfully.',
        });
      },
    }),

    /**
     * TOTP Regenerate Codes — gerar novos recovery codes
     *
     * Requer código TOTP válido. Invalida todos os códigos existentes e gera 8 novos.
     */
    totpRegenerateCodes: igniter.mutation({
      name: 'TOTP Regenerate Codes',
      description: 'Invalidate existing recovery codes and generate new ones',
      path: '/totp/regenerate-codes',
      method: 'POST',
      use: [authProcedure({ required: true })],
      body: totpRegenerateCodesSchema,
      handler: async ({ request, response, context }) => {
        const user = context.auth?.session?.user;
        if (!user) return response.unauthorized('Authentication required');
        const userId = user.id;

        // User must have 2FA enabled
        if (!user.twoFactorEnabled) {
          return response.status(400).json({
            error: '2FA is not enabled on this account.',
            code: 'TWO_FACTOR_NOT_ENABLED',
          });
        }

        const { code } = request.body;

        // Verify TOTP code
        const device = await db.totpDevice.findFirst({
          where: { userId, verified: true },
        });

        if (!device) {
          return response.status(400).json({
            error: 'No verified TOTP device found.',
            code: 'NO_VERIFIED_DEVICE',
          });
        }

        const secretBase32 = decrypt(device.secret);
        const totp = new OTPAuth.TOTP({
          issuer: 'Quayer',
          label: user.email || userId,
          algorithm: 'SHA1',
          digits: 6,
          period: 30,
          secret: OTPAuth.Secret.fromBase32(secretBase32),
        });

        const delta = totp.validate({ token: code, window: 1 });
        if (delta === null) {
          return response.status(400).json({
            error: 'Invalid TOTP code.',
            code: 'INVALID_TOTP_CODE',
          });
        }

        // Invalidate all existing recovery codes (set usedAt = now)
        await db.recoveryCode.updateMany({
          where: { userId, usedAt: null },
          data: { usedAt: new Date() },
        });

        // Generate 8 new recovery codes
        const recoveryCodes = generateRecoveryCodes(8);

        // Hash and store new recovery codes
        const recoveryCodePromises = recoveryCodes.map(async (rc) => {
          const hashedCode = await hashPassword(rc);
          return db.recoveryCode.create({
            data: {
              userId,
              code: hashedCode,
            },
          });
        });
        await Promise.all(recoveryCodePromises);

        await createAuditLog('TOTP_CODES_REGENERATED', userId, request, undefined, user.currentOrgId);

        return response.success({
          recoveryCodes,
        });
      },
    }),

    /**
     * TOTP List Devices — listar dispositivos TOTP do usuário
     *
     * Retorna todos os TotpDevices do user autenticado (id, name, verified, createdAt).
     */
    totpListDevices: igniter.query({
      name: 'TOTP List Devices',
      description: 'List all TOTP devices for the authenticated user',
      path: '/totp/devices',
      method: 'GET',
      use: [authProcedure({ required: true })],
      handler: async ({ response, context }) => {
        const user = context.auth?.session?.user;
        if (!user) return response.unauthorized('Authentication required');
        const userId = user.id;

        const devices = await db.totpDevice.findMany({
          where: { userId },
          select: {
            id: true,
            name: true,
            verified: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        });

        return response.success({ devices });
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
