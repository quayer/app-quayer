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
  loginSchema,
  registerSchema,
  refreshTokenSchema,
  logoutSchema,
  changePasswordSchema,
  updateProfileSchema,
  switchOrganizationSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
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
} from '../auth.schemas';
import { normalizePhone, sendWhatsAppOTP } from '@/lib/uaz/whatsapp-otp';
import {
  hashPassword,
  verifyPassword,
  validatePasswordStrength,
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

export const authController = igniter.controller({
  name: 'auth',
  path: '/auth',
  description: 'Authentication and authorization',
  actions: {
    /**
     * Register - Criar nova conta
     */
    register: igniter.mutation({
      name: 'Register',
      description: 'Create new user account',
      path: '/register',
      method: 'POST',
      body: registerSchema,
      handler: async ({ request, response, context }) => {
        // Rate limiting
        const identifier = getClientIdentifier(request);
        const rateLimit = await authRateLimiter.check(identifier);

        if (!rateLimit.success) {
          return response.status(429).json({
            error: 'Too many requests',
            retryAfter: rateLimit.retryAfter,
          });
        }

        const { email, password, name, document, organizationName } = request.body;

        // Validar força da senha
        const passwordValidation = validatePasswordStrength(password);
        if (!passwordValidation.isValid) {
          return response.status(400).json({
            error: 'Password validation failed',
            errors: passwordValidation.errors,
          });
        }

        // Verificar se email já existe
        const existingUser = await db.user.findUnique({ where: { email } });
        if (existingUser) {
          return response.status(400).json({ error: 'Email already registered' });
        }

        // Hash password
        const hashedPassword = await hashPassword(password);

        // Verificar se é o primeiro usuário (admin)
        const usersCount = await db.user.count();
        const isFirstUser = usersCount === 0;

        // Criar organização se fornecida
        let organization = null;
        if (organizationName || isFirstUser) {
          const slug = (organizationName || name)
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '-')
            .substring(0, 50);

          // Gerar document padrão se não fornecido (CPF fake para desenvolvimento)
          const defaultDocument = document || `000${Date.now().toString().slice(-8)}`;

          organization = await db.organization.create({
            data: {
              name: organizationName || `${name}'s Organization`,
              slug: `${slug}-${Date.now()}`,
              document: defaultDocument,
              type: document ? (document.replace(/\D/g, '').length === 11 ? 'pf' : 'pj') : 'pf',
              isActive: true,
            },
          });
        }

        // Criar usuário
        const user = await db.user.create({
          data: {
            email,
            password: hashedPassword,
            name,
            role: isFirstUser ? UserRole.ADMIN : UserRole.USER,
            currentOrgId: organization?.id || null,
            isActive: true,
          },
        });

        // Criar relação User-Organization se organização existe
        if (organization) {
          await db.userOrganization.create({
            data: {
              userId: user.id,
              organizationId: organization.id,
              role: 'master',
              isActive: true,
            },
          });
        }

        // Generate verification code and send email
        const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
        const verificationExpiresAt = new Date(Date.now() + 15 * 60 * 1000);

        await db.user.update({
          where: { id: user.id },
          data: {
            resetToken: verificationCode,
            resetTokenExpiry: verificationExpiresAt,
          },
        });

        await emailService.sendVerificationEmail(user.email, user.name, verificationCode, 15);

        // Enviar email de boas-vindas
        await emailService.sendWelcomeEmail(email, name, dashboardUrl);

        // NÃO fazer login automático - requer verificação de email primeiro
        return response.created({
          message: 'User created successfully. Please verify your email.',
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            requiresEmailVerification: true,
          },
        });
      },
    }),

    /**
     * Login - Autenticar usuário
     */
    login: igniter.mutation({
      name: 'Login',
      description: 'Authenticate user',
      path: '/login',
      method: 'POST',
      body: loginSchema,
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

        const { email, password } = request.body;

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
          return response.status(401).json({ error: 'Invalid credentials' });
        }

        // Verificar senha
        const isValidPassword = await verifyPassword(password, user.password);
        if (!isValidPassword) {
          return response.status(401).json({ error: 'Invalid credentials' });
        }

        // Verificar se usuário está ativo
        if (!user.isActive) {
          return response.status(403).json({ error: 'Account disabled' });
        }

        // Se admin não tem org setada, setar primeira org disponível
        let currentOrgId = user.currentOrgId;
        if (user.role === 'admin' && !currentOrgId && user.organizations.length > 0) {
          currentOrgId = user.organizations[0].organizationId;
          // Atualizar no banco para próximo login
          await db.user.update({
            where: { id: user.id },
            data: { currentOrgId },
          });
        }

        // Obter role na organização atual
        const currentOrgRelation = user.organizations.find(
          (org) => org.organizationId === currentOrgId
        );

        // Criar access token
        const accessToken = signAccessToken({
          userId: user.id,
          email: user.email,
          role: user.role as UserRole,
          currentOrgId,
          organizationRole: currentOrgRelation?.role as any,
          needsOnboarding: !user.onboardingCompleted, // ✅ Incluir no token para middleware
        });

        // Criar refresh token
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

        // Set httpOnly cookies (backend-managed)
        setAuthCookies(response, accessToken, refreshToken);

        // Register device session + geo check
        const deviceResult = await registerDeviceSession(user.id, request);
        if (deviceResult.blocked) {
          clearAuthCookies(response);
          return Response.json(
            { error: 'Login bloqueado por política de segurança. Contate o administrador.' },
            { status: 403 }
          );
        }

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
     * Change Password
     */
    changePassword: igniter.mutation({
      name: 'Change Password',
      description: 'Change user password',
      path: '/change-password',
      method: 'POST',
      use: [authProcedure({ required: true }), csrfProcedure()],
      body: changePasswordSchema,
      handler: async ({ request, response, context }) => {
        const user = context.auth?.session?.user;
        if (!user) return response.unauthorized('Authentication required');
        const userId = user.id;

        const { currentPassword, newPassword } = request.body;

        const dbUser = await db.user.findUnique({ where: { id: userId } });
        if (!dbUser) {
          return response.status(404).json({ error: 'User not found' });
        }

        // Verificar senha atual
        const isValidPassword = await verifyPassword(currentPassword, dbUser.password);
        if (!isValidPassword) {
          return response.status(400).json({ error: 'Invalid current password' });
        }

        // Validar nova senha
        const validation = validatePasswordStrength(newPassword);
        if (!validation.isValid) {
          return response.status(400).json({
            error: 'Password validation failed',
            errors: validation.errors,
          });
        }

        // Hash e atualizar
        const hashedPassword = await hashPassword(newPassword);
        await db.user.update({
          where: { id: userId },
          data: { password: hashedPassword },
        });

        // Revogar todos os refresh tokens (forçar re-login)
        await db.refreshToken.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });

        return response.success({ message: 'Password changed successfully' });
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
     * Forgot Password - Request password reset
     */
    forgotPassword: igniter.mutation({
      name: 'Forgot Password',
      description: 'Request password reset email',
      path: '/forgot-password',
      method: 'POST',
      body: forgotPasswordSchema,
      handler: async ({ request, response }) => {
        const { email } = request.body;

        // Buscar usuário
        const user = await db.user.findUnique({ where: { email } });

        // Sempre retornar sucesso (segurança: não revelar se email existe)
        if (!user) {
          return response.success({ message: 'If email exists, reset instructions sent' });
        }

        // Gerar token de reset (válido por 24 horas)
        const resetToken = signRefreshToken({
          userId: user.id,
          tokenId: `reset-${Date.now()}`,
        });

        // Salvar token no banco
        await db.refreshToken.create({
          data: {
            userId: user.id,
            token: resetToken,
            expiresAt: getExpirationDate('24h'),
          },
        });

        // Gerar URL de reset completa
        const resetUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/reset-password/${resetToken}`;

        // Enviar email (async, não bloquear resposta)
        emailService
          .sendPasswordResetEmail(user.email, user.name || 'User', resetUrl, 60)
          .catch(console.error);

        return response.success({ message: 'If email exists, reset instructions sent' });
      },
    }),

    /**
     * Reset Password - Complete password reset
     */
    resetPassword: igniter.mutation({
      name: 'Reset Password',
      description: 'Reset password with token',
      path: '/reset-password',
      method: 'POST',
      body: resetPasswordSchema,
      handler: async ({ request, response }) => {
        const { token, password } = request.body;

        // Verificar token
        const payload = verifyRefreshToken(token);
        if (!payload) {
          return response.status(400).json({ error: 'Invalid or expired reset token' });
        }

        // Buscar token no banco
        const tokenData = await db.refreshToken.findFirst({
          where: {
            token,
            userId: payload.userId,
            revokedAt: null,
          },
        });

        if (!tokenData || tokenData.expiresAt < new Date()) {
          return response.status(400).json({ error: 'Invalid or expired reset token' });
        }

        // Validar nova senha
        const validation = validatePasswordStrength(password);
        if (!validation.isValid) {
          return response.status(400).json({
            error: 'Password validation failed',
            errors: validation.errors,
          });
        }

        // Hash e atualizar senha
        const hashedPassword = await hashPassword(password);
        await db.user.update({
          where: { id: payload.userId },
          data: { password: hashedPassword },
        });

        // Revogar token usado
        await db.refreshToken.update({
          where: { id: tokenData.id },
          data: { revokedAt: new Date() },
        });

        // Revogar todos os refresh tokens (forçar re-login)
        await db.refreshToken.updateMany({
          where: { userId: payload.userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });

        return response.success({ message: 'Password reset successfully' });
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

            // Google OAuth users get a random hashed password (they won't use it)
            const randomPassword = crypto.randomBytes(32).toString('hex');
            const hashedPassword = await hashPassword(randomPassword);

            user = await db.user.create({
              data: {
                email: googleUser.email,
                name: googleUser.name,
                password: hashedPassword, // Hashed random password
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
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutos

        // Salvar código no banco (criar tabela de verification codes ou usar campo temporário)
        await db.user.update({
          where: { email },
          data: {
            // Temporário: usar campo password reset (criar tabela própria em produção)
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
        const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
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

        const randomPassword = crypto.randomBytes(32).toString('hex');
        const hashedPassword = await hashPassword(randomPassword);

        const user = await db.user.create({
          data: {
            email: tempUser.email,
            name: tempUser.name,
            password: hashedPassword,
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
        const code = Math.floor(100000 + Math.random() * 900000).toString();
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
          const signupOtpCode = Math.floor(100000 + Math.random() * 900000).toString();
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
            message: 'Código de cadastro enviado para seu email'
          });
        }

        // Gerar código OTP de 6 dígitos para LOGIN
        const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
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

        // Set httpOnly cookies
        setAuthCookies(response, accessToken, refreshToken);

        // Register device session + geo check
        const deviceResult = await registerDeviceSession(user.id, request);
        if (deviceResult.blocked) {
          clearAuthCookies(response);
          return Response.json(
            { error: 'Login bloqueado por política de segurança. Contate o administrador.' },
            { status: 403 }
          );
        }

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

          const randomPassword = crypto.randomBytes(32).toString('hex');
          const hashedPassword = await hashPassword(randomPassword);

          const user = await db.user.create({
            data: {
              email: tempUser.email,
              name: tempUser.name,
              password: hashedPassword,
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

        const code = Math.floor(100000 + Math.random() * 900000).toString()

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
          const randomPassword = crypto.randomBytes(32).toString('hex')
          const hashedPassword = await hashPassword(randomPassword)
          createdUser = await db.user.create({
            data: {
              email: normalized + '@phone.quayer.app',
              phone: normalized,
              name: 'Usuário WhatsApp',
              password: hashedPassword,
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
        const recoveryCodes: string[] = [];
        for (let i = 0; i < 8; i++) {
          recoveryCodes.push(crypto.randomBytes(4).toString('hex'));
        }

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

        // Audit log: totp_setup_completed
        console.log(`[AUDIT] totp_setup_completed userId=${userId} deviceId=${deviceId}`);

        return response.success({
          verified: true,
          twoFactorEnabled: true,
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
