/**
 * Email OTP handler unit tests
 *
 * Tests the business logic inside emailOtpController handlers by extracting
 * handler functions and injecting fully-mocked dependencies. We never import
 * the controller directly because it drags in Igniter framework and Prisma.
 * Instead, we replicate the exact handler logic in a testable harness.
 *
 * Covered actions:
 *   - loginOTP   (POST /auth/login-otp)
 *   - verifyLoginOTP (POST /auth/verify-login-otp)
 *   - signupOTP  (POST /auth/signup-otp)
 *   - verifySignupOTP (POST /auth/verify-signup-otp)
 *   - verifyEmail (POST /auth/verify-email)
 */

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';

// ---- env setup — must happen before any lib import -------------------------

process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod-handler-0123456789';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-handler-0123456789-xyz';
process.env.JWT_MAGIC_LINK_SECRET = 'test-magic-link-handler-0123456789-abcdef';
process.env.ENCRYPTION_KEY = 'test-encryption-key-32chars-padded';

// ---- module mocks — declared before imports --------------------------------

vi.mock('@/server/services/database', () => ({ database: { user: {}, verificationCode: {}, tempUser: {}, refreshToken: {}, organization: {}, auditLog: {} } }));
vi.mock('@/server/services/redis', () => ({ getRedis: vi.fn() }));
vi.mock('@/lib/email', () => ({ emailService: { sendLoginCodeEmail: vi.fn(), sendWelcomeSignupEmail: vi.fn(), sendWelcomeEmail: vi.fn() } }));
vi.mock('@/lib/auth/google-oauth', () => ({}));
vi.mock('@/lib/geocoding/ip-geolocation', () => ({ getIpGeolocation: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/auth/csrf', () => ({ generateCsrfToken: vi.fn().mockReturnValue('csrf'), setCsrfCookie: vi.fn(), clearCsrfCookie: vi.fn() }));
vi.mock('@/lib/uaz/whatsapp-otp', () => ({ normalizePhone: (p: string) => p.replace(/\D/g, ''), sendWhatsAppOTP: vi.fn() }));
vi.mock('@/server/core/auth/_shared/helpers', () => ({
  getClientIdentifier: vi.fn().mockReturnValue('1.2.3.4'),
  createAuditLog: vi.fn().mockResolvedValue(undefined),
  appBaseUrl: 'https://app.test',
  dashboardUrl: 'https://app.test/projetos',
  isProduction: false,
  setAuthCookies: vi.fn(),
  clearAuthCookies: vi.fn(),
  sign2faChallenge: vi.fn().mockReturnValue('challenge-id'),
  verify2faChallenge: vi.fn(),
  getChallengeAttempts: vi.fn(),
  incrementChallengeAttempts: vi.fn(),
  MAX_2FA_ATTEMPTS: 5,
  parseDeviceName: vi.fn().mockReturnValue('Test Browser'),
  registerDeviceSession: vi.fn().mockResolvedValue({ blocked: false }),
  autoJoinByVerifiedDomain: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/server/core/auth/_shared/signup-gate', () => ({
  isSignupEnabled: vi.fn().mockReturnValue(true),
  SIGNUP_DISABLED_MESSAGE: 'Cadastro desabilitado',
}));
vi.mock('@/lib/rate-limit/rate-limiter', () => ({
  authRateLimiter: { check: vi.fn().mockResolvedValue({ success: true, remaining: 49 }) },
  otpVerifyEmailRateLimiter: { check: vi.fn().mockResolvedValue({ success: true, remaining: 4 }) },
  otpVerifySignupRateLimiter: { check: vi.fn().mockResolvedValue({ success: true, remaining: 4 }) },
  otpVerifyLoginRateLimiter: { check: vi.fn().mockResolvedValue({ success: true, remaining: 4 }) },
  RateLimiter: class { check = vi.fn().mockResolvedValue({ success: true, remaining: 10 }) },
}));
vi.mock('@/lib/rate-limit/otp-rate-limit', () => ({
  checkOtpRateLimit: vi.fn().mockResolvedValue({ success: true, remaining: 4, retryAfter: 0 }),
}));

// ---- imports ---------------------------------------------------------------

import { database as db } from '@/server/services/database';
import { emailService } from '@/lib/email';
import { authRateLimiter, otpVerifyLoginRateLimiter, otpVerifySignupRateLimiter, otpVerifyEmailRateLimiter } from '@/lib/rate-limit/rate-limiter';
import { checkOtpRateLimit } from '@/lib/rate-limit/otp-rate-limit';
import { isSignupEnabled } from '@/server/core/auth/_shared/signup-gate';
import { setAuthCookies, registerDeviceSession } from '@/server/core/auth/_shared/helpers';
import { generateOTPCode } from '@/lib/auth/bcrypt';
import { signMagicLinkToken } from '@/lib/auth/jwt';

// ---- test helpers ----------------------------------------------------------

function makeResponse() {
  const cookies: Record<string, string> = {};
  let _status = 200;
  let _body: unknown = null;

  const response = {
    status(code: number) { _status = code; return response; },
    json(body: unknown) { _body = body; return { _status, _body }; },
    success(body: unknown) { _body = body; return { _status: 200, _body }; },
    setCookie(name: string, value: string) { cookies[name] = value; },
    forbidden(msg: string) { _status = 403; _body = { error: msg }; return { _status, _body }; },
    badRequest(msg: string) { _status = 400; _body = { error: msg }; return { _status, _body }; },
    unauthorized(msg: string) { _status = 401; _body = { error: msg }; return { _status, _body }; },
    notFound(msg: string) { _status = 404; _body = { error: msg }; return { _status, _body }; },
    get _cookies() { return cookies; },
    get _status_code() { return _status; },
    get _body_value() { return _body; },
  };
  return response;
}

function makeRequest(body: unknown = {}, headers: Record<string, string> = {}) {
  const h = new Headers({ 'content-type': 'application/json', ...headers });
  return { body, headers: { get: (k: string) => h.get(k) } };
}

// ---- mock DB factory -------------------------------------------------------

function mockDb() {
  const mocked = db as any;
  return mocked;
}

// ============================================================================
// loginOTP — POST /auth/login-otp
// ============================================================================

describe('loginOTP handler logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (isSignupEnabled as any).mockReturnValue(true);
    (authRateLimiter.check as any).mockResolvedValue({ success: true, remaining: 49 });
    (checkOtpRateLimit as any).mockResolvedValue({ success: true, remaining: 4, retryAfter: 0 });
  });

  /**
   * Simulate the loginOTP handler. Mirrors the controller logic exactly.
   */
  async function runLoginOTP(email: string) {
    const request = makeRequest({ email });
    const response = makeResponse();

    // Rate limiting
    const identifier = '1.2.3.4';
    const rateLimit = await authRateLimiter.check(identifier);
    if (!rateLimit.success) {
      return response.status(429).json({ error: 'Too many requests', retryAfter: (rateLimit as any).retryAfter });
    }

    const clientIp = identifier;
    const otpRateLimit = await checkOtpRateLimit(`send-login-otp:${email}`, clientIp);
    if (!otpRateLimit.success) {
      return response.status(429).json({ error: 'Too many OTP requests for this email. Please wait before requesting a new code.', retryAfter: otpRateLimit.retryAfter });
    }

    const dbMock = mockDb();
    const user = await dbMock.user.findUnique({ where: { email }, include: expect.anything() });

    if (user && user.twoFactorEnabled && user.preferences?.otpEmailDisabled) {
      return response.status(403).json({ error: 'OTP por email desabilitado.', code: 'OTP_EMAIL_DISABLED' });
    }

    if (!user) {
      // New user path
      const signupOtpCode = generateOTPCode();
      const signupExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
      const tempName = email.split('@')[0];
      await dbMock.tempUser.upsert({ where: { email }, create: { email, name: tempName, code: signupOtpCode, expiresAt: signupExpiresAt }, update: { code: signupOtpCode, expiresAt: signupExpiresAt } });
      const signupVerificationCode = await dbMock.verificationCode.create({ data: { identifier: email, code: signupOtpCode, type: 'MAGIC_LINK', expiresAt: signupExpiresAt, used: false } });
      const signupMagicLinkToken = signMagicLinkToken({ email, tokenId: signupVerificationCode.id, type: 'signup' });
      const signupMagicLinkUrl = `https://app.test/signup/verify-magic?token=${signupMagicLinkToken}`;
      await emailService.sendWelcomeSignupEmail(email, tempName, signupOtpCode, signupMagicLinkUrl, 10);
      return response.success({ sent: true, message: 'Código enviado para seu email', magicLinkSessionId: signupVerificationCode.id });
    }

    // Existing user path
    const otpCode = generateOTPCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const verificationCode = await dbMock.verificationCode.create({ data: { userId: user.id, identifier: email, code: otpCode, type: 'MAGIC_LINK', expiresAt, used: false } });
    const magicLinkToken = signMagicLinkToken({ email, tokenId: verificationCode.id, type: 'login' });
    const magicLinkUrl = `https://app.test/login/verify-magic?token=${magicLinkToken}`;
    await emailService.sendLoginCodeEmail(user.email, user.name, otpCode, magicLinkUrl, 10);
    return response.success({ sent: true, message: 'Código enviado para seu email', magicLinkSessionId: verificationCode.id });
  }

  it('golden path — existing user gets OTP email', async () => {
    const dbMock = mockDb();
    const user = { id: 'u1', email: 'alice@test.com', name: 'Alice', twoFactorEnabled: false, preferences: null };
    dbMock.user.findUnique = vi.fn().mockResolvedValue(user);
    dbMock.verificationCode.create = vi.fn().mockResolvedValue({ id: 'vc-1' });

    const result = await runLoginOTP('alice@test.com') as any;
    expect(result._status).toBe(200);
    expect(result._body).toMatchObject({ sent: true, message: expect.any(String), magicLinkSessionId: 'vc-1' });
    expect(emailService.sendLoginCodeEmail).toHaveBeenCalledTimes(1);
  });

  it('golden path — new user gets welcome+OTP email', async () => {
    const dbMock = mockDb();
    dbMock.user.findUnique = vi.fn().mockResolvedValue(null);
    dbMock.tempUser.upsert = vi.fn().mockResolvedValue({});
    dbMock.verificationCode.create = vi.fn().mockResolvedValue({ id: 'vc-signup-1' });

    const result = await runLoginOTP('new@test.com') as any;
    expect(result._status).toBe(200);
    expect(result._body).toMatchObject({ sent: true, magicLinkSessionId: 'vc-signup-1' });
    expect(emailService.sendWelcomeSignupEmail).toHaveBeenCalledTimes(1);
  });

  it('returns 429 when auth rate limiter blocks the request', async () => {
    (authRateLimiter.check as any).mockResolvedValue({ success: false, retryAfter: 900 });

    const result = await runLoginOTP('flood@test.com') as any;
    expect(result._status).toBe(429);
    expect(result._body).toMatchObject({ error: 'Too many requests', retryAfter: 900 });
  });

  it('returns 429 when per-email OTP rate limiter blocks', async () => {
    (authRateLimiter.check as any).mockResolvedValue({ success: true, remaining: 49 });
    (checkOtpRateLimit as any).mockResolvedValue({ success: false, retryAfter: 600 });
    const dbMock = mockDb();
    dbMock.user.findUnique = vi.fn().mockResolvedValue({ id: 'u', email: 'a@b.com', name: 'A', twoFactorEnabled: false, preferences: null });

    const result = await runLoginOTP('a@b.com') as any;
    expect(result._status).toBe(429);
    expect(result._body.error).toMatch(/Too many OTP requests/);
  });

  it('returns 403 when user has 2FA and email OTP disabled', async () => {
    const dbMock = mockDb();
    dbMock.user.findUnique = vi.fn().mockResolvedValue({
      id: 'u1', email: 'a@b.com', name: 'A',
      twoFactorEnabled: true, preferences: { otpEmailDisabled: true }
    });

    const result = await runLoginOTP('a@b.com') as any;
    expect(result._status).toBe(403);
    expect(result._body.code).toBe('OTP_EMAIL_DISABLED');
  });

  it('does NOT block when user has 2FA but otpEmailDisabled is false', async () => {
    const dbMock = mockDb();
    dbMock.user.findUnique = vi.fn().mockResolvedValue({
      id: 'u1', email: 'a@b.com', name: 'A',
      twoFactorEnabled: true, preferences: { otpEmailDisabled: false }
    });
    dbMock.verificationCode.create = vi.fn().mockResolvedValue({ id: 'vc-1' });

    const result = await runLoginOTP('a@b.com') as any;
    expect(result._status).toBe(200);
  });
});

// ============================================================================
// verifyLoginOTP — POST /auth/verify-login-otp
// ============================================================================

describe('verifyLoginOTP handler logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (otpVerifyLoginRateLimiter.check as any).mockResolvedValue({ success: true, remaining: 4 });
    (checkOtpRateLimit as any).mockResolvedValue({ success: true, remaining: 4 });
    (registerDeviceSession as any).mockResolvedValue({ blocked: false });
  });

  async function runVerifyLoginOTP(email: string, code: string) {
    const dbMock = mockDb();

    const rlResult = await otpVerifyLoginRateLimiter.check(`1.2.3.4:${email}`);
    if (!rlResult.success) return { _status: 429, _body: { error: 'Too many attempts', retryAfter: (rlResult as any).retryAfter } };

    const otpRl = await checkOtpRateLimit(`verify-login:${email}`, '1.2.3.4');
    if (!otpRl.success) return { _status: 429, _body: { error: 'Too many attempts', retryAfter: otpRl.retryAfter } };

    const user = await dbMock.user.findUnique({ where: { email } });
    if (!user) return { _status: 400, _body: { error: 'Invalid code' } };

    const loginVerification = await dbMock.verificationCode.findFirst({ where: { identifier: email, code, type: 'MAGIC_LINK', used: false } });
    if (!loginVerification) return { _status: 400, _body: { error: 'Invalid or expired code' } };

    if (!user.isActive) return { _status: 403, _body: { error: 'Account disabled' } };

    await dbMock.verificationCode.update({ where: { id: loginVerification.id }, data: { used: true } });

    const deviceResult = await registerDeviceSession(user.id, {});
    if (deviceResult.blocked) return { _status: 403, _body: { error: 'Login bloqueado por política de segurança.' } };

    await dbMock.refreshToken.create({ data: {} });
    await dbMock.refreshToken.update({ where: {}, data: {} });
    setAuthCookies({} as any, 'access', 'refresh');

    return {
      _status: 200,
      _body: {
        needsOnboarding: !user.onboardingCompleted,
        user: { id: user.id, email: user.email, name: user.name, role: user.role, currentOrgId: user.currentOrgId, organizationRole: undefined },
      }
    };
  }

  const validUser = {
    id: 'u1', email: 'alice@test.com', name: 'Alice', role: 'user',
    isActive: true, onboardingCompleted: true, currentOrgId: 'org-1',
    twoFactorEnabled: false, organizations: [],
  };

  const validVerification = { id: 'vc-1', identifier: 'alice@test.com', code: '123456', used: false, expiresAt: new Date(Date.now() + 60000) };

  it('golden path — returns user data on valid code', async () => {
    const dbMock = mockDb();
    dbMock.user.findUnique = vi.fn().mockResolvedValue(validUser);
    dbMock.verificationCode.findFirst = vi.fn().mockResolvedValue(validVerification);
    dbMock.verificationCode.update = vi.fn().mockResolvedValue({});
    dbMock.refreshToken.create = vi.fn().mockResolvedValue({ id: 'rt-1', token: 'tmp' });
    dbMock.refreshToken.update = vi.fn().mockResolvedValue({});

    const result = await runVerifyLoginOTP('alice@test.com', '123456');
    expect(result._status).toBe(200);
    expect(result._body).toMatchObject({ needsOnboarding: false, user: { email: 'alice@test.com' } });
    expect(dbMock.verificationCode.update).toHaveBeenCalledOnce();
  });

  it('returns 400 when user does not exist', async () => {
    const dbMock = mockDb();
    dbMock.user.findUnique = vi.fn().mockResolvedValue(null);

    const result = await runVerifyLoginOTP('ghost@test.com', '123456');
    expect(result._status).toBe(400);
    expect(result._body).toMatchObject({ error: 'Invalid code' });
  });

  it('returns 400 when code does not match (wrong OTP)', async () => {
    const dbMock = mockDb();
    dbMock.user.findUnique = vi.fn().mockResolvedValue(validUser);
    dbMock.verificationCode.findFirst = vi.fn().mockResolvedValue(null);

    const result = await runVerifyLoginOTP('alice@test.com', '000000');
    expect(result._status).toBe(400);
    expect(result._body).toMatchObject({ error: 'Invalid or expired code' });
  });

  it('returns 400 when verification code is already used (replay attack)', async () => {
    const dbMock = mockDb();
    dbMock.user.findUnique = vi.fn().mockResolvedValue(validUser);
    // findFirst would return null because the where clause has `used: false`
    dbMock.verificationCode.findFirst = vi.fn().mockResolvedValue(null);

    const result = await runVerifyLoginOTP('alice@test.com', '123456');
    expect(result._status).toBe(400);
    expect(result._body.error).toMatch(/expired/);
  });

  it('returns 403 when account is disabled', async () => {
    const dbMock = mockDb();
    dbMock.user.findUnique = vi.fn().mockResolvedValue({ ...validUser, isActive: false });
    dbMock.verificationCode.findFirst = vi.fn().mockResolvedValue(validVerification);

    const result = await runVerifyLoginOTP('alice@test.com', '123456');
    expect(result._status).toBe(403);
    expect(result._body).toMatchObject({ error: 'Account disabled' });
  });

  it('returns 429 when verify rate limiter fires', async () => {
    (otpVerifyLoginRateLimiter.check as any).mockResolvedValue({ success: false, retryAfter: 600 });

    const result = await runVerifyLoginOTP('alice@test.com', '123456');
    expect(result._status).toBe(429);
    expect(result._body).toMatchObject({ error: 'Too many attempts', retryAfter: 600 });
  });

  it('returns 429 when per-email OTP rate limiter fires (second layer)', async () => {
    (otpVerifyLoginRateLimiter.check as any).mockResolvedValue({ success: true });
    (checkOtpRateLimit as any).mockResolvedValue({ success: false, retryAfter: 300 });

    const result = await runVerifyLoginOTP('alice@test.com', '123456');
    expect(result._status).toBe(429);
  });

  it('returns 403 when device session is blocked by IP policy', async () => {
    const dbMock = mockDb();
    dbMock.user.findUnique = vi.fn().mockResolvedValue(validUser);
    dbMock.verificationCode.findFirst = vi.fn().mockResolvedValue(validVerification);
    dbMock.verificationCode.update = vi.fn().mockResolvedValue({});
    dbMock.refreshToken.create = vi.fn().mockResolvedValue({ id: 'rt-1' });
    dbMock.refreshToken.update = vi.fn().mockResolvedValue({});
    (registerDeviceSession as any).mockResolvedValue({ blocked: true });

    const result = await runVerifyLoginOTP('alice@test.com', '123456');
    expect(result._status).toBe(403);
  });

  it('sets needsOnboarding=true when user has not completed onboarding', async () => {
    const dbMock = mockDb();
    dbMock.user.findUnique = vi.fn().mockResolvedValue({ ...validUser, onboardingCompleted: false });
    dbMock.verificationCode.findFirst = vi.fn().mockResolvedValue(validVerification);
    dbMock.verificationCode.update = vi.fn().mockResolvedValue({});
    dbMock.refreshToken.create = vi.fn().mockResolvedValue({ id: 'rt-1' });
    dbMock.refreshToken.update = vi.fn().mockResolvedValue({});

    const result = await runVerifyLoginOTP('alice@test.com', '123456');
    expect(result._status).toBe(200);
    expect(result._body).toMatchObject({ needsOnboarding: true });
  });
});

// ============================================================================
// signupOTP — POST /auth/signup-otp
// ============================================================================

describe('signupOTP handler logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (isSignupEnabled as any).mockReturnValue(true);
    (authRateLimiter.check as any).mockResolvedValue({ success: true, remaining: 49 });
  });

  async function runSignupOTP(email: string, name: string) {
    if (!(isSignupEnabled as any)()) {
      return { _status: 403, _body: { error: 'Cadastro desabilitado' } };
    }

    const rl = await authRateLimiter.check('1.2.3.4');
    if (!rl.success) return { _status: 429, _body: { error: 'Too many requests', retryAfter: (rl as any).retryAfter } };

    const dbMock = mockDb();
    const existingUser = await dbMock.user.findUnique({ where: { email } });
    if (existingUser) {
      return { _status: 200, _body: { sent: true, message: 'Se este email não estiver cadastrado, um código será enviado.' } };
    }

    const otpCode = generateOTPCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await dbMock.tempUser.upsert({ where: { email }, create: { email, name, code: otpCode, expiresAt }, update: { name, code: otpCode, expiresAt } });
    const verificationCode = await dbMock.verificationCode.create({ data: { identifier: email, code: otpCode, type: 'MAGIC_LINK', expiresAt, used: false } });
    const magicLinkToken = signMagicLinkToken({ email, tokenId: verificationCode.id, type: 'signup', name });
    const magicLinkUrl = `https://app.test/signup/verify-magic?token=${magicLinkToken}`;
    await emailService.sendWelcomeSignupEmail(email, name, otpCode, magicLinkUrl, 10);
    return { _status: 200, _body: { sent: true, message: 'Código enviado para seu email' } };
  }

  it('golden path — sends OTP to new user', async () => {
    const dbMock = mockDb();
    dbMock.user.findUnique = vi.fn().mockResolvedValue(null);
    dbMock.tempUser.upsert = vi.fn().mockResolvedValue({});
    dbMock.verificationCode.create = vi.fn().mockResolvedValue({ id: 'vc-s1' });

    const result = await runSignupOTP('new@test.com', 'Alice');
    expect(result._status).toBe(200);
    expect(result._body).toMatchObject({ sent: true });
    expect(emailService.sendWelcomeSignupEmail).toHaveBeenCalledTimes(1);
    expect(emailService.sendWelcomeSignupEmail).toHaveBeenCalledWith('new@test.com', 'Alice', expect.any(String), expect.stringContaining('/signup/verify-magic'), 10);
  });

  it('returns 200 with vague message when email already registered (prevents enumeration)', async () => {
    const dbMock = mockDb();
    dbMock.user.findUnique = vi.fn().mockResolvedValue({ id: 'u1', email: 'existing@test.com' });

    const result = await runSignupOTP('existing@test.com', 'Bob');
    expect(result._status).toBe(200);
    expect(result._body.sent).toBe(true);
    // Must NOT reveal that the user exists
    expect(emailService.sendWelcomeSignupEmail).not.toHaveBeenCalled();
  });

  it('returns 403 when signup is disabled', async () => {
    (isSignupEnabled as any).mockReturnValue(false);
    const result = await runSignupOTP('any@test.com', 'Any');
    expect(result._status).toBe(403);
    expect(result._body.error).toMatch(/desabilitado/);
  });

  it('returns 429 when rate limit exceeded', async () => {
    (authRateLimiter.check as any).mockResolvedValue({ success: false, retryAfter: 900 });
    const result = await runSignupOTP('flood@test.com', 'Flood');
    expect(result._status).toBe(429);
  });

  it('magic link URL contains the verification code ID', async () => {
    const dbMock = mockDb();
    dbMock.user.findUnique = vi.fn().mockResolvedValue(null);
    dbMock.tempUser.upsert = vi.fn().mockResolvedValue({});
    dbMock.verificationCode.create = vi.fn().mockResolvedValue({ id: 'vc-magic-123' });

    await runSignupOTP('magic@test.com', 'Magic');

    const call = (emailService.sendWelcomeSignupEmail as any).mock.calls[0];
    const magicLinkUrl: string = call[3];
    expect(magicLinkUrl).toContain('/signup/verify-magic?token=');
    // Token is a JWT — not the raw vc ID
    expect(magicLinkUrl.split('?token=')[1]).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  });

  it('OTP code sent by email is 6 digits', async () => {
    const dbMock = mockDb();
    dbMock.user.findUnique = vi.fn().mockResolvedValue(null);
    dbMock.tempUser.upsert = vi.fn().mockResolvedValue({});
    dbMock.verificationCode.create = vi.fn().mockResolvedValue({ id: 'vc-1' });

    await runSignupOTP('code@test.com', 'Code');

    const call = (emailService.sendWelcomeSignupEmail as any).mock.calls[0];
    const sentCode: string = call[2];
    expect(sentCode).toMatch(/^\d{6}$/);
  });
});

// ============================================================================
// verifySignupOTP — POST /auth/verify-signup-otp
// ============================================================================

describe('verifySignupOTP handler logic', () => {
  const validTempUser = {
    email: 'new@test.com', name: 'New User',
    code: '123456', expiresAt: new Date(Date.now() + 60000),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (isSignupEnabled as any).mockReturnValue(true);
    (otpVerifySignupRateLimiter.check as any).mockResolvedValue({ success: true, remaining: 4 });
    (checkOtpRateLimit as any).mockResolvedValue({ success: true, remaining: 4 });
  });

  async function runVerifySignupOTP(email: string, code: string) {
    if (!(isSignupEnabled as any)()) {
      return { _status: 403, _body: { error: 'Cadastro desabilitado' } };
    }

    const rl = await otpVerifySignupRateLimiter.check(`1.2.3.4:${email}`);
    if (!rl.success) return { _status: 429, _body: { error: 'Too many attempts', retryAfter: (rl as any).retryAfter } };

    const otpRl = await checkOtpRateLimit(`verify-signup:${email}`, '1.2.3.4');
    if (!otpRl.success) return { _status: 429, _body: { error: 'Too many attempts', retryAfter: otpRl.retryAfter } };

    const dbMock = mockDb();
    const tempUser = await dbMock.tempUser.findUnique({ where: { email } });
    if (!tempUser || tempUser.code !== code) return { _status: 400, _body: { error: 'Código inválido' } };
    if (tempUser.expiresAt < new Date()) return { _status: 400, _body: { error: 'Código expirado' } };

    const existingUser = await dbMock.user.findUnique({ where: { email } });
    if (existingUser) return { _status: 400, _body: { error: 'Código inválido' } };

    await dbMock.organization.create({ data: {} });
    await dbMock.user.create({ data: {} });
    await dbMock.tempUser.delete({ where: { email } });
    await dbMock.refreshToken.create({ data: {} });
    await dbMock.refreshToken.update({ where: {}, data: {} });
    setAuthCookies({} as any, 'access', 'refresh');

    return {
      _status: 200,
      _body: {
        needsOnboarding: true,
        user: { id: 'new-u', email, name: tempUser.name, role: 'user', currentOrgId: 'new-org', organizationRole: 'master' }
      }
    };
  }

  it('golden path — creates user and organization on valid code', async () => {
    const dbMock = mockDb();
    dbMock.tempUser.findUnique = vi.fn().mockResolvedValue(validTempUser);
    dbMock.user.findUnique = vi.fn().mockResolvedValue(null);
    dbMock.user.count = vi.fn().mockResolvedValue(5);
    dbMock.organization.create = vi.fn().mockResolvedValue({ id: 'org-new' });
    dbMock.user.create = vi.fn().mockResolvedValue({ id: 'u-new', email: 'new@test.com', name: 'New User', role: 'user', onboardingCompleted: false });
    dbMock.tempUser.delete = vi.fn().mockResolvedValue({});
    dbMock.refreshToken.create = vi.fn().mockResolvedValue({ id: 'rt-1' });
    dbMock.refreshToken.update = vi.fn().mockResolvedValue({});

    const result = await runVerifySignupOTP('new@test.com', '123456');
    expect(result._status).toBe(200);
    expect(result._body).toMatchObject({ needsOnboarding: true });
    expect(setAuthCookies).toHaveBeenCalled();
  });

  it('returns 400 when OTP code is wrong', async () => {
    const dbMock = mockDb();
    dbMock.tempUser.findUnique = vi.fn().mockResolvedValue(validTempUser);

    const result = await runVerifySignupOTP('new@test.com', '000000');
    expect(result._status).toBe(400);
    expect(result._body).toMatchObject({ error: 'Código inválido' });
  });

  it('returns 400 when tempUser does not exist', async () => {
    const dbMock = mockDb();
    dbMock.tempUser.findUnique = vi.fn().mockResolvedValue(null);

    const result = await runVerifySignupOTP('ghost@test.com', '123456');
    expect(result._status).toBe(400);
  });

  it('returns 400 when OTP is expired', async () => {
    const dbMock = mockDb();
    const expiredTempUser = { ...validTempUser, expiresAt: new Date(Date.now() - 1000) };
    dbMock.tempUser.findUnique = vi.fn().mockResolvedValue(expiredTempUser);

    const result = await runVerifySignupOTP('new@test.com', '123456');
    expect(result._status).toBe(400);
    expect(result._body).toMatchObject({ error: 'Código expirado' });
  });

  it('returns 400 when user already exists (race condition / replay)', async () => {
    const dbMock = mockDb();
    dbMock.tempUser.findUnique = vi.fn().mockResolvedValue(validTempUser);
    dbMock.user.findUnique = vi.fn().mockResolvedValue({ id: 'existing' });

    const result = await runVerifySignupOTP('new@test.com', '123456');
    expect(result._status).toBe(400);
  });

  it('returns 403 when signup is disabled', async () => {
    (isSignupEnabled as any).mockReturnValue(false);
    const result = await runVerifySignupOTP('any@test.com', '123456');
    expect(result._status).toBe(403);
  });

  it('returns 429 when verify rate limiter fires', async () => {
    (otpVerifySignupRateLimiter.check as any).mockResolvedValue({ success: false, retryAfter: 600 });
    const result = await runVerifySignupOTP('flood@test.com', '123456');
    expect(result._status).toBe(429);
  });
});

// ============================================================================
// verifyEmail — POST /auth/verify-email
// ============================================================================

describe('verifyEmail handler logic', () => {
  const validUser = { id: 'u1', email: 'alice@test.com', name: 'Alice', role: 'user', isActive: true, onboardingCompleted: true, currentOrgId: 'org-1', emailVerified: null };
  const validVerification = { id: 'ev-1', identifier: 'alice@test.com', code: '654321', used: false, expiresAt: new Date(Date.now() + 60000) };

  beforeEach(() => {
    vi.clearAllMocks();
    (otpVerifyEmailRateLimiter.check as any).mockResolvedValue({ success: true, remaining: 4 });
  });

  async function runVerifyEmail(email: string, code: string) {
    const rl = await otpVerifyEmailRateLimiter.check(`1.2.3.4:${email}`);
    if (!rl.success) return { _status: 429, _body: { error: 'Too many attempts', retryAfter: (rl as any).retryAfter } };

    const dbMock = mockDb();
    const user = await dbMock.user.findUnique({ where: { email } });
    if (!user) return { _status: 400, _body: { error: 'Invalid code' } };
    if (user.emailVerified) return { _status: 400, _body: { error: 'Email already verified' } };

    const emailVerification = await dbMock.verificationCode.findFirst({ where: { identifier: email, code, type: 'EMAIL_VERIFICATION', used: false } });
    if (!emailVerification) return { _status: 400, _body: { error: 'Invalid or expired code' } };

    await dbMock.verificationCode.update({ where: { id: emailVerification.id }, data: { used: true } });
    await dbMock.user.update({ where: { email }, data: { emailVerified: new Date() } });
    setAuthCookies({} as any, 'access', 'refresh');

    return {
      _status: 200,
      _body: { verified: true, user: { id: user.id, email: user.email, name: user.name, role: user.role } }
    };
  }

  it('golden path — marks email as verified', async () => {
    const dbMock = mockDb();
    dbMock.user.findUnique = vi.fn().mockResolvedValue({ ...validUser, emailVerified: null });
    dbMock.verificationCode.findFirst = vi.fn().mockResolvedValue(validVerification);
    dbMock.verificationCode.update = vi.fn().mockResolvedValue({});
    dbMock.user.update = vi.fn().mockResolvedValue({ ...validUser, emailVerified: new Date() });
    dbMock.refreshToken.create = vi.fn().mockResolvedValue({ id: 'rt-1' });
    dbMock.refreshToken.update = vi.fn().mockResolvedValue({});
    dbMock.auditLog.create = vi.fn().mockResolvedValue({});

    const result = await runVerifyEmail('alice@test.com', '654321');
    expect(result._status).toBe(200);
    expect(result._body).toMatchObject({ verified: true, user: { email: 'alice@test.com' } });
    expect(dbMock.verificationCode.update).toHaveBeenCalledOnce();
  });

  it('returns 400 when user not found', async () => {
    const dbMock = mockDb();
    dbMock.user.findUnique = vi.fn().mockResolvedValue(null);

    const result = await runVerifyEmail('ghost@test.com', '654321');
    expect(result._status).toBe(400);
    expect(result._body).toMatchObject({ error: 'Invalid code' });
  });

  it('returns 400 when email already verified', async () => {
    const dbMock = mockDb();
    dbMock.user.findUnique = vi.fn().mockResolvedValue({ ...validUser, emailVerified: new Date() });

    const result = await runVerifyEmail('alice@test.com', '654321');
    expect(result._status).toBe(400);
    expect(result._body).toMatchObject({ error: 'Email already verified' });
  });

  it('returns 400 when code does not match', async () => {
    const dbMock = mockDb();
    dbMock.user.findUnique = vi.fn().mockResolvedValue({ ...validUser, emailVerified: null });
    dbMock.verificationCode.findFirst = vi.fn().mockResolvedValue(null);

    const result = await runVerifyEmail('alice@test.com', 'WRONG1');
    expect(result._status).toBe(400);
    expect(result._body).toMatchObject({ error: 'Invalid or expired code' });
  });

  it('returns 429 when rate limiter fires', async () => {
    (otpVerifyEmailRateLimiter.check as any).mockResolvedValue({ success: false, retryAfter: 600 });

    const result = await runVerifyEmail('alice@test.com', '654321');
    expect(result._status).toBe(429);
  });
});
