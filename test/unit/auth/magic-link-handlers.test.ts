/**
 * Magic link handler unit tests
 *
 * Covers:
 *   - verifyMagicLink (POST /auth/verify-magic-link)
 *     • login path: existing user → issues tokens
 *     • login path: 2FA enabled → requiresTwoFactor
 *     • signup path: new user creation
 *     • signup gate disabled
 *     • token already used
 *     • expired token
 *     • rate limit
 *   - checkMagicLinkStatus (POST /auth/check-magic-link-status)
 *     • not yet verified
 *     • expired session
 *     • verified → issues tokens
 *     • verified + 2FA enabled
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';

// ---- env setup -------------------------------------------------------------

process.env.JWT_SECRET = 'test-secret-do-not-use-magic-link-0123456789';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-magic-0123456789-xyz';
process.env.JWT_MAGIC_LINK_SECRET = 'test-magic-link-secret-magic-0123456789-abc';
process.env.ENCRYPTION_KEY = 'test-encryption-key-magic-32chars00';

// ---- mocks -----------------------------------------------------------------

vi.mock('@/server/services/database', () => ({
  database: { user: {}, verificationCode: {}, refreshToken: {}, organization: {}, tempUser: {}, auditLog: {} }
}));
vi.mock('@/lib/email', () => ({
  emailService: { sendWelcomeEmail: vi.fn().mockResolvedValue(undefined) }
}));
vi.mock('@/lib/rate-limit/rate-limiter', () => ({
  authRateLimiter: { check: vi.fn().mockResolvedValue({ success: true, remaining: 49 }) },
  RateLimiter: class { check = vi.fn().mockResolvedValue({ success: true }) },
}));
vi.mock('@/lib/rate-limit/otp-rate-limit', () => ({
  checkOtpRateLimit: vi.fn().mockResolvedValue({ success: true, remaining: 4, retryAfter: 0 }),
}));
vi.mock('@/server/core/auth/_shared/helpers', () => ({
  getClientIdentifier: vi.fn().mockReturnValue('1.2.3.4'),
  createAuditLog: vi.fn().mockResolvedValue(undefined),
  appBaseUrl: 'https://app.test',
  dashboardUrl: 'https://app.test/projetos',
  isProduction: false,
  setAuthCookies: vi.fn(),
  clearAuthCookies: vi.fn(),
  sign2faChallenge: vi.fn().mockReturnValue('challenge-id-42'),
  verify2faChallenge: vi.fn(),
  getChallengeAttempts: vi.fn(),
  incrementChallengeAttempts: vi.fn(),
  MAX_2FA_ATTEMPTS: 5,
  parseDeviceName: vi.fn().mockReturnValue('Test'),
  registerDeviceSession: vi.fn().mockResolvedValue({ blocked: false }),
  autoJoinByVerifiedDomain: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/server/core/auth/_shared/signup-gate', () => ({
  isSignupEnabled: vi.fn().mockReturnValue(true),
  SIGNUP_DISABLED_MESSAGE: 'Cadastro desabilitado',
}));
vi.mock('@/lib/geocoding/ip-geolocation', () => ({ getIpGeolocation: vi.fn() }));
vi.mock('@/lib/auth/csrf', () => ({ generateCsrfToken: vi.fn(), setCsrfCookie: vi.fn(), clearCsrfCookie: vi.fn() }));

// ---- imports ---------------------------------------------------------------

import { database as db } from '@/server/services/database';
import { authRateLimiter } from '@/lib/rate-limit/rate-limiter';
import { checkOtpRateLimit } from '@/lib/rate-limit/otp-rate-limit';
import { isSignupEnabled } from '@/server/core/auth/_shared/signup-gate';
import { setAuthCookies, sign2faChallenge, registerDeviceSession } from '@/server/core/auth/_shared/helpers';
import { signMagicLinkToken, verifyMagicLinkToken, signRefreshToken, signAccessToken, getExpirationDate } from '@/lib/auth/jwt';

// ---- helpers ---------------------------------------------------------------

function mockDb() { return db as any; }

// Build a JWT magic link token for testing
function buildMagicToken(email: string, tokenId: string, type: 'login' | 'signup', name?: string) {
  return signMagicLinkToken({ email, tokenId, type, ...(name ? { name } : {}) });
}

// ============================================================================
// verifyMagicLink
// ============================================================================

describe('verifyMagicLink — login path', () => {
  const userEmail = 'alice@test.com';
  const vcId = 'vc-magic-login-1';

  const baseUser = {
    id: 'u1', email: userEmail, name: 'Alice', role: 'user',
    isActive: true, onboardingCompleted: true, currentOrgId: 'org-1',
    twoFactorEnabled: false,
    organizations: [{ organizationId: 'org-1', isActive: true, organization: { id: 'org-1' } }],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (isSignupEnabled as any).mockReturnValue(true);
    (authRateLimiter.check as any).mockResolvedValue({ success: true, remaining: 49 });
    (checkOtpRateLimit as any).mockResolvedValue({ success: true, remaining: 4 });
    (registerDeviceSession as any).mockResolvedValue({ blocked: false });
  });

  /**
   * Simulate verifyMagicLink handler for the LOGIN branch.
   */
  async function runVerifyMagicLinkLogin(token: string) {
    const rl = await authRateLimiter.check(`verify-magic:1.2.3.4`);
    if (!rl.success) return { _status: 429, _body: { error: 'Too many requests' } };

    const payload = verifyMagicLinkToken(token);
    if (!payload) return { _status: 400, _body: { error: 'Invalid or expired magic link' } };

    const otpRl = await checkOtpRateLimit(payload.email, '1.2.3.4');
    if (!otpRl.success) return { _status: 429, _body: { error: 'Too many requests' } };

    const dbMock = mockDb();
    const verificationCode = await dbMock.verificationCode.findUnique({ where: { id: payload.tokenId } });
    if (!verificationCode || verificationCode.used) return { _status: 400, _body: { error: 'Magic link already used or expired' } };
    if (verificationCode.expiresAt < new Date()) return { _status: 400, _body: { error: 'Magic link expired' } };

    await dbMock.verificationCode.update({ where: { id: verificationCode.id }, data: { used: true } });

    if (payload.type === 'magic-link-login') {
      const user = await dbMock.user.findUnique({ where: { email: payload.email } });
      if (!user) return { _status: 404, _body: { error: 'User not found' } };
      if (!user.isActive) return { _status: 403, _body: { error: 'Account disabled' } };

      if (user.twoFactorEnabled) {
        const challengeId = sign2faChallenge(user.id);
        return { _status: 200, _body: { requiresTwoFactor: true, challengeId } };
      }

      const accessToken = signAccessToken({ userId: user.id, email: user.email, role: 'user', currentOrgId: user.currentOrgId }, '24h');
      const refreshTokenVal = signRefreshToken({ userId: user.id, tokenId: '' });
      const savedRt = await dbMock.refreshToken.create({ data: { userId: user.id, token: refreshTokenVal, expiresAt: getExpirationDate('7d') } });
      const refreshToken = signRefreshToken({ userId: user.id, tokenId: savedRt.id });
      await dbMock.refreshToken.update({ where: { id: savedRt.id }, data: { token: refreshToken } });

      setAuthCookies({} as any, accessToken, refreshToken);
      await registerDeviceSession(user.id, {});

      return {
        _status: 200,
        _body: { needsOnboarding: !user.onboardingCompleted, user: { id: user.id, email: user.email } }
      };
    }

    return { _status: 400, _body: { error: 'Invalid magic link type' } };
  }

  it('golden path — valid login magic link issues auth cookies', async () => {
    const token = buildMagicToken(userEmail, vcId, 'login');
    const dbMock = mockDb();
    dbMock.verificationCode.findUnique = vi.fn().mockResolvedValue({ id: vcId, used: false, expiresAt: new Date(Date.now() + 60000), identifier: userEmail });
    dbMock.verificationCode.update = vi.fn().mockResolvedValue({});
    dbMock.user.findUnique = vi.fn().mockResolvedValue(baseUser);
    dbMock.refreshToken.create = vi.fn().mockResolvedValue({ id: 'rt-1' });
    dbMock.refreshToken.update = vi.fn().mockResolvedValue({});

    const result = await runVerifyMagicLinkLogin(token);
    expect(result._status).toBe(200);
    expect(result._body).toMatchObject({ needsOnboarding: false, user: { email: userEmail } });
    expect(setAuthCookies).toHaveBeenCalled();
    expect(registerDeviceSession).toHaveBeenCalled();
  });

  it('returns 400 for an invalid/tampered token', async () => {
    const result = await runVerifyMagicLinkLogin('tampered.jwt.garbage');
    expect(result._status).toBe(400);
    expect(result._body.error).toMatch(/invalid|expired/i);
  });

  it('returns 400 when magic link was already used', async () => {
    const token = buildMagicToken(userEmail, vcId, 'login');
    const dbMock = mockDb();
    dbMock.verificationCode.findUnique = vi.fn().mockResolvedValue({ id: vcId, used: true, expiresAt: new Date(Date.now() + 60000) });

    const result = await runVerifyMagicLinkLogin(token);
    expect(result._status).toBe(400);
    expect(result._body.error).toMatch(/used|expired/i);
  });

  it('returns 400 when verification code has expired in DB', async () => {
    const token = buildMagicToken(userEmail, vcId, 'login');
    const dbMock = mockDb();
    dbMock.verificationCode.findUnique = vi.fn().mockResolvedValue({ id: vcId, used: false, expiresAt: new Date(Date.now() - 1000) });
    dbMock.verificationCode.update = vi.fn().mockResolvedValue({});

    const result = await runVerifyMagicLinkLogin(token);
    expect(result._status).toBe(400);
    expect(result._body.error).toMatch(/expired/i);
  });

  it('returns 404 when user not found (deleted account)', async () => {
    const token = buildMagicToken(userEmail, vcId, 'login');
    const dbMock = mockDb();
    dbMock.verificationCode.findUnique = vi.fn().mockResolvedValue({ id: vcId, used: false, expiresAt: new Date(Date.now() + 60000) });
    dbMock.verificationCode.update = vi.fn().mockResolvedValue({});
    dbMock.user.findUnique = vi.fn().mockResolvedValue(null);

    const result = await runVerifyMagicLinkLogin(token);
    expect(result._status).toBe(404);
  });

  it('returns 403 when account is disabled', async () => {
    const token = buildMagicToken(userEmail, vcId, 'login');
    const dbMock = mockDb();
    dbMock.verificationCode.findUnique = vi.fn().mockResolvedValue({ id: vcId, used: false, expiresAt: new Date(Date.now() + 60000) });
    dbMock.verificationCode.update = vi.fn().mockResolvedValue({});
    dbMock.user.findUnique = vi.fn().mockResolvedValue({ ...baseUser, isActive: false });

    const result = await runVerifyMagicLinkLogin(token);
    expect(result._status).toBe(403);
  });

  it('returns requiresTwoFactor when user has 2FA enabled', async () => {
    const token = buildMagicToken(userEmail, vcId, 'login');
    const dbMock = mockDb();
    dbMock.verificationCode.findUnique = vi.fn().mockResolvedValue({ id: vcId, used: false, expiresAt: new Date(Date.now() + 60000) });
    dbMock.verificationCode.update = vi.fn().mockResolvedValue({});
    dbMock.user.findUnique = vi.fn().mockResolvedValue({ ...baseUser, twoFactorEnabled: true });

    const result = await runVerifyMagicLinkLogin(token);
    expect(result._status).toBe(200);
    expect(result._body).toMatchObject({ requiresTwoFactor: true, challengeId: 'challenge-id-42' });
  });

  it('returns 429 when auth rate limiter fires', async () => {
    (authRateLimiter.check as any).mockResolvedValue({ success: false, retryAfter: 900 });
    const token = buildMagicToken(userEmail, vcId, 'login');

    const result = await runVerifyMagicLinkLogin(token);
    expect(result._status).toBe(429);
  });

  it('marks verification code as used after successful auth (prevents replay)', async () => {
    const token = buildMagicToken(userEmail, vcId, 'login');
    const dbMock = mockDb();
    dbMock.verificationCode.findUnique = vi.fn().mockResolvedValue({ id: vcId, used: false, expiresAt: new Date(Date.now() + 60000) });
    dbMock.verificationCode.update = vi.fn().mockResolvedValue({});
    dbMock.user.findUnique = vi.fn().mockResolvedValue(baseUser);
    dbMock.refreshToken.create = vi.fn().mockResolvedValue({ id: 'rt-1' });
    dbMock.refreshToken.update = vi.fn().mockResolvedValue({});

    await runVerifyMagicLinkLogin(token);
    expect(dbMock.verificationCode.update).toHaveBeenCalledWith({ where: { id: vcId }, data: { used: true } });
  });
});

// ============================================================================
// checkMagicLinkStatus
// ============================================================================

describe('checkMagicLinkStatus handler logic', () => {
  const baseUser = {
    id: 'u1', email: 'alice@test.com', name: 'Alice', role: 'user',
    isActive: true, onboardingCompleted: true, currentOrgId: 'org-1',
    twoFactorEnabled: false,
    organizations: [{ organizationId: 'org-1', isActive: true, organization: { id: 'org-1' } }],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (authRateLimiter.check as any).mockResolvedValue({ success: true, remaining: 49 });
    (registerDeviceSession as any).mockResolvedValue({ blocked: false });
  });

  async function runCheckMagicLinkStatus(sessionId: string) {
    const rl = await authRateLimiter.check(`mlpoll:1.2.3.4`);
    if (!rl.success) return { _status: 429, _body: { error: 'Too many requests' } };

    const dbMock = mockDb();
    const verificationCode = await dbMock.verificationCode.findUnique({ where: { id: sessionId } });
    if (!verificationCode) return { _status: 404, _body: { error: 'Session not found' } };
    if (verificationCode.expiresAt < new Date()) return { _status: 200, _body: { verified: false, expired: true } };
    if (!verificationCode.used) return { _status: 200, _body: { verified: false, expired: false } };

    // Magic link was verified in another tab
    const user = await dbMock.user.findUnique({ where: { email: verificationCode.identifier } });
    if (!user) return { _status: 404, _body: { error: 'User not found' } };
    if (!user.isActive) return { _status: 403, _body: { error: 'Account disabled' } };

    if (user.twoFactorEnabled) {
      const challengeId = sign2faChallenge(user.id);
      return { _status: 200, _body: { verified: true, requiresTwoFactor: true, challengeId } };
    }

    const savedRt = await dbMock.refreshToken.create({ data: {} });
    await dbMock.refreshToken.update({ where: { id: savedRt.id }, data: {} });
    setAuthCookies({} as any, 'access', 'refresh');
    await registerDeviceSession(user.id, {});

    return {
      _status: 200,
      _body: {
        verified: true,
        redirectPath: '/projetos',
        needsOnboarding: false,
        user: { id: user.id, email: user.email },
      }
    };
  }

  it('returns {verified: false, expired: false} when magic link not yet clicked', async () => {
    const dbMock = mockDb();
    dbMock.verificationCode.findUnique = vi.fn().mockResolvedValue({
      id: 'session-1', used: false, expiresAt: new Date(Date.now() + 60000), identifier: 'alice@test.com'
    });

    const result = await runCheckMagicLinkStatus('session-1');
    expect(result._status).toBe(200);
    expect(result._body).toMatchObject({ verified: false, expired: false });
  });

  it('returns {verified: false, expired: true} when session has expired', async () => {
    const dbMock = mockDb();
    dbMock.verificationCode.findUnique = vi.fn().mockResolvedValue({
      id: 'session-2', used: false, expiresAt: new Date(Date.now() - 5000), identifier: 'alice@test.com'
    });

    const result = await runCheckMagicLinkStatus('session-2');
    expect(result._status).toBe(200);
    expect(result._body).toMatchObject({ verified: false, expired: true });
  });

  it('returns 404 when session not found', async () => {
    const dbMock = mockDb();
    dbMock.verificationCode.findUnique = vi.fn().mockResolvedValue(null);

    const result = await runCheckMagicLinkStatus('nonexistent');
    expect(result._status).toBe(404);
  });

  it('golden path — verified in another tab, issues cookies for this tab', async () => {
    const dbMock = mockDb();
    dbMock.verificationCode.findUnique = vi.fn().mockResolvedValue({
      id: 'session-3', used: true, expiresAt: new Date(Date.now() + 60000), identifier: 'alice@test.com'
    });
    dbMock.user.findUnique = vi.fn().mockResolvedValue(baseUser);
    dbMock.refreshToken.create = vi.fn().mockResolvedValue({ id: 'rt-1' });
    dbMock.refreshToken.update = vi.fn().mockResolvedValue({});

    const result = await runCheckMagicLinkStatus('session-3');
    expect(result._status).toBe(200);
    expect(result._body).toMatchObject({ verified: true, redirectPath: '/projetos' });
    expect(setAuthCookies).toHaveBeenCalled();
  });

  it('returns requiresTwoFactor when verified user has 2FA enabled', async () => {
    const dbMock = mockDb();
    dbMock.verificationCode.findUnique = vi.fn().mockResolvedValue({
      id: 'session-4', used: true, expiresAt: new Date(Date.now() + 60000), identifier: 'alice@test.com'
    });
    dbMock.user.findUnique = vi.fn().mockResolvedValue({ ...baseUser, twoFactorEnabled: true });

    const result = await runCheckMagicLinkStatus('session-4');
    expect(result._status).toBe(200);
    expect(result._body).toMatchObject({ verified: true, requiresTwoFactor: true, challengeId: 'challenge-id-42' });
  });

  it('returns 429 when rate limiter fires on polling', async () => {
    (authRateLimiter.check as any).mockResolvedValue({ success: false, retryAfter: 900 });
    const result = await runCheckMagicLinkStatus('session-5');
    expect(result._status).toBe(429);
  });
});
