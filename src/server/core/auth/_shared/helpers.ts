/**
 * Auth _shared/helpers.ts
 *
 * Helpers compartilhados pelos subdomínios de auth.
 * Extraído do monolito `controllers/auth.controller.ts` (linhas 72-493).
 * Nenhuma mudança de comportamento — apenas exports.
 */

import { database as db } from '@/server/services/database';
import jwt from 'jsonwebtoken';
import { getIpGeolocation } from '@/lib/geocoding/ip-geolocation';
import { generateCsrfToken, setCsrfCookie, clearCsrfCookie } from '@/lib/auth/csrf';
import { getRedis } from '@/server/services/redis';

export function getClientIdentifier(request: { headers: { get?: (key: string) => string | null; [key: string]: any } }): string {
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

export async function createAuditLog(
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

export const appBaseUrl = (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'https://quayer.com').replace(/\/$/, '');
export const dashboardUrl = `${appBaseUrl}/projetos`;

export const isProduction = process.env.NODE_ENV === 'production';

/**
 * Helper: Set auth cookies (httpOnly) on the Igniter response object.
 * accessToken  -> Path=/ , Max-Age=900 (15 min)
 * refreshToken -> Path=/api/v1/auth/refresh , Max-Age=604800 (7 days)
 */
export function setAuthCookies(
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
export function clearAuthCookies(response: any) {
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
export function sign2faChallenge(userId: string): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is required');
  return jwt.sign({ userId, type: '2fa-challenge' }, secret, { expiresIn: '5m', issuer: 'quayer' });
}

/**
 * 2FA Challenge: verify the challenge JWT and return userId, or null if invalid/expired.
 */
export function verify2faChallenge(token: string): { userId: string } | null {
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

export const CHALLENGE_ATTEMPTS_PREFIX = 'auth:2fa:attempts:';
const CHALLENGE_ATTEMPTS_TTL = 600; // 10 minutes

export async function getChallengeAttempts(challengeId: string): Promise<number> {
  try {
    const val = await getRedis().get(`${CHALLENGE_ATTEMPTS_PREFIX}${challengeId}`);
    return val ? parseInt(val, 10) : 0;
  } catch {
    return 0;
  }
}

export async function incrementChallengeAttempts(challengeId: string): Promise<number> {
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

export const MAX_2FA_ATTEMPTS = 5;

/**
 * Helper: Parse a human-readable device name from a User-Agent string.
 */
export function parseDeviceName(userAgent: string): string {
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
export async function registerDeviceSession(userId: string, request: any): Promise<{ blocked: boolean }> {
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
                type: 'SYSTEM',
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
export async function autoJoinByVerifiedDomain(
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

export { getRedis };

export async function clearChallengeAttempts(challengeId: string): Promise<void> {
  try { await getRedis().del(CHALLENGE_ATTEMPTS_PREFIX + challengeId); } catch {}
}
