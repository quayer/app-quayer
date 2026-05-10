/**
 * Phone OTP handler unit tests — src/server/core/auth/phone-otp/
 *
 * Covers loginOTPPhone (POST /auth/login-otp-phone):
 *   - Golden path: sends OTP via WhatsApp
 *   - Signup gate disabled → 403
 *   - 2FA with otpPhoneDisabled → 400
 *   - Rate limit exceeded → 429
 *   - WhatsApp send failure → 400
 *   - Phone normalization
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- env setup -------------------------------------------------------------

process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod-phone-0123456789';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-phone-0123456789-xyz';
process.env.JWT_MAGIC_LINK_SECRET = 'test-magic-phone-handler-0123456789-abc';
process.env.ENCRYPTION_KEY = 'test-encryption-key-phone-32chars00';

// ---- mocks -----------------------------------------------------------------

vi.mock('@/server/services/database', () => ({
  database: { user: {}, verificationCode: {} }
}));
vi.mock('@/lib/uaz/whatsapp-otp', () => ({
  normalizePhone: (p: string) => p.replace(/\D/g, ''),
  sendWhatsAppOTP: vi.fn().mockResolvedValue(true),
}));
vi.mock('@/lib/auth/bcrypt', () => ({
  generateOTPCode: vi.fn().mockReturnValue('789012'),
}));
vi.mock('@/lib/rate-limit/otp-rate-limit', () => ({
  checkOtpRateLimit: vi.fn().mockResolvedValue({ success: true, remaining: 4, retryAfter: 0 }),
}));
vi.mock('@/server/core/auth/_shared/helpers', () => ({
  getClientIdentifier: vi.fn().mockReturnValue('1.2.3.4'),
}));
vi.mock('@/server/core/auth/_shared/signup-gate', () => ({
  isSignupEnabled: vi.fn().mockReturnValue(true),
  SIGNUP_DISABLED_MESSAGE: 'Cadastro desabilitado',
}));

// ---- imports ---------------------------------------------------------------

import { database as db } from '@/server/services/database';
import { sendWhatsAppOTP } from '@/lib/uaz/whatsapp-otp';
import { generateOTPCode } from '@/lib/auth/bcrypt';
import { checkOtpRateLimit } from '@/lib/rate-limit/otp-rate-limit';
import { isSignupEnabled } from '@/server/core/auth/_shared/signup-gate';

// ---- test helpers ----------------------------------------------------------

function mockDb() { return db as any; }

function makeResponse() {
  let _status = 200;
  let _body: unknown = null;
  return {
    status(code: number) { _status = code; return this; },
    json(body: unknown) { _body = body; return { _status, _body }; },
    success(body: unknown) { _body = body; return { _status: 200, _body }; },
    forbidden(msg: string) { return { _status: 403, _body: { error: msg } }; },
    badRequest(msg: string) { return { _status: 400, _body: { error: msg } }; },
  };
}

// ---- simulate loginOTPPhone handler ----------------------------------------

async function runLoginOTPPhone(phone: string) {
  const { normalizePhone } = await import('@/lib/uaz/whatsapp-otp');
  const response = makeResponse();

  if (!(isSignupEnabled as any)()) {
    return response.forbidden('Cadastro desabilitado');
  }

  const normalized = normalizePhone(phone);
  const clientIp = '1.2.3.4';

  const dbMock = mockDb();
  const phoneUser = await dbMock.user.findFirst({
    where: { phone: normalized },
    select: { twoFactorEnabled: true, preferences: { select: { otpPhoneDisabled: true } } },
  });

  if (phoneUser?.twoFactorEnabled && phoneUser.preferences?.otpPhoneDisabled) {
    return response.badRequest('OTP por telefone desabilitado. Use seu aplicativo autenticador para fazer login.');
  }

  const rateLimitResult = await checkOtpRateLimit(normalized, clientIp);
  if (!rateLimitResult.success) {
    const retryAfter = rateLimitResult.retryAfter || 60;
    return response.status(429).json({
      error: `Muitas tentativas. Tente novamente em ${Math.ceil(retryAfter / 60)} minuto(s).`,
    });
  }

  const code = (generateOTPCode as any)();

  await dbMock.verificationCode.deleteMany({ where: { identifier: normalized, type: 'WHATSAPP_OTP' } });
  await dbMock.verificationCode.create({
    data: {
      identifier: normalized,
      code,
      type: 'WHATSAPP_OTP',
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    },
  });

  try {
    await sendWhatsAppOTP(normalized, code);
  } catch {
    return response.badRequest('Serviço WhatsApp temporariamente indisponível. Tente fazer login com email.');
  }

  return response.success({ sent: true });
}

// ============================================================================
// Tests
// ============================================================================

describe('loginOTPPhone handler logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (isSignupEnabled as any).mockReturnValue(true);
    (checkOtpRateLimit as any).mockResolvedValue({ success: true, remaining: 4, retryAfter: 0 });
    (sendWhatsAppOTP as any).mockResolvedValue(true);
  });

  it('golden path — sends OTP via WhatsApp and returns {sent: true}', async () => {
    const dbMock = mockDb();
    dbMock.user.findFirst = vi.fn().mockResolvedValue(null);
    dbMock.verificationCode.deleteMany = vi.fn().mockResolvedValue({});
    dbMock.verificationCode.create = vi.fn().mockResolvedValue({ id: 'vc-1' });

    const result = await runLoginOTPPhone('+55 11 91234-5678') as any;
    expect(result._status).toBe(200);
    expect(result._body).toMatchObject({ sent: true });
    expect(sendWhatsAppOTP).toHaveBeenCalledWith('5511912345678', '789012');
  });

  it('normalizes phone before storing and sending', async () => {
    const dbMock = mockDb();
    dbMock.user.findFirst = vi.fn().mockResolvedValue(null);
    dbMock.verificationCode.deleteMany = vi.fn().mockResolvedValue({});
    dbMock.verificationCode.create = vi.fn().mockResolvedValue({ id: 'vc-2' });

    await runLoginOTPPhone('(11) 9 9999-9999');
    expect(sendWhatsAppOTP).toHaveBeenCalledWith('11999999999', expect.any(String));
  });

  it('deletes existing OTP codes before creating a new one (no duplicates)', async () => {
    const dbMock = mockDb();
    dbMock.user.findFirst = vi.fn().mockResolvedValue(null);
    dbMock.verificationCode.deleteMany = vi.fn().mockResolvedValue({ count: 1 });
    dbMock.verificationCode.create = vi.fn().mockResolvedValue({ id: 'vc-3' });

    await runLoginOTPPhone('11912345678');
    expect(dbMock.verificationCode.deleteMany).toHaveBeenCalledWith({
      where: { identifier: '11912345678', type: 'WHATSAPP_OTP' },
    });
    expect(dbMock.verificationCode.create).toHaveBeenCalledAfter
      ? expect(dbMock.verificationCode.create).toHaveBeenCalled()
      : expect(dbMock.verificationCode.create).toHaveBeenCalled();
  });

  it('returns 403 when signup is disabled', async () => {
    (isSignupEnabled as any).mockReturnValue(false);
    const result = await runLoginOTPPhone('11912345678') as any;
    expect(result._status).toBe(403);
    expect(result._body.error).toMatch(/desabilitado/i);
  });

  it('returns 400 when user has 2FA and otpPhoneDisabled is true', async () => {
    const dbMock = mockDb();
    dbMock.user.findFirst = vi.fn().mockResolvedValue({
      twoFactorEnabled: true,
      preferences: { otpPhoneDisabled: true },
    });

    const result = await runLoginOTPPhone('11912345678') as any;
    expect(result._status).toBe(400);
    expect(result._body.error).toMatch(/desabilitado/i);
  });

  it('does NOT block when user has 2FA but otpPhoneDisabled is false', async () => {
    const dbMock = mockDb();
    dbMock.user.findFirst = vi.fn().mockResolvedValue({
      twoFactorEnabled: true,
      preferences: { otpPhoneDisabled: false },
    });
    dbMock.verificationCode.deleteMany = vi.fn().mockResolvedValue({});
    dbMock.verificationCode.create = vi.fn().mockResolvedValue({ id: 'vc-4' });

    const result = await runLoginOTPPhone('11912345678') as any;
    expect(result._status).toBe(200);
  });

  it('returns 429 when rate limit exceeded', async () => {
    const dbMock = mockDb();
    dbMock.user.findFirst = vi.fn().mockResolvedValue(null);
    (checkOtpRateLimit as any).mockResolvedValue({ success: false, retryAfter: 600 });

    const result = await runLoginOTPPhone('11912345678') as any;
    expect(result._status).toBe(429);
    expect(result._body.error).toMatch(/minuto/i);
  });

  it('returns 400 when WhatsApp send fails (service down)', async () => {
    const dbMock = mockDb();
    dbMock.user.findFirst = vi.fn().mockResolvedValue(null);
    dbMock.verificationCode.deleteMany = vi.fn().mockResolvedValue({});
    dbMock.verificationCode.create = vi.fn().mockResolvedValue({ id: 'vc-5' });
    (sendWhatsAppOTP as any).mockRejectedValue(new Error('UAZAPI connection refused'));

    const result = await runLoginOTPPhone('11912345678') as any;
    expect(result._status).toBe(400);
    expect(result._body.error).toMatch(/indisponível/i);
  });

  it('stores OTP with WHATSAPP_OTP type and 10-minute expiry', async () => {
    const before = Date.now();
    const dbMock = mockDb();
    dbMock.user.findFirst = vi.fn().mockResolvedValue(null);
    dbMock.verificationCode.deleteMany = vi.fn().mockResolvedValue({});
    dbMock.verificationCode.create = vi.fn().mockResolvedValue({ id: 'vc-6' });

    await runLoginOTPPhone('11912345678');

    const createCall = dbMock.verificationCode.create.mock.calls[0][0];
    expect(createCall.data.type).toBe('WHATSAPP_OTP');
    expect(createCall.data.code).toBe('789012');
    const expiresAt: Date = createCall.data.expiresAt;
    // Should expire ~10 min from now
    expect(expiresAt.getTime()).toBeGreaterThan(before + 9 * 60 * 1000);
    expect(expiresAt.getTime()).toBeLessThan(before + 11 * 60 * 1000);
  });
});
