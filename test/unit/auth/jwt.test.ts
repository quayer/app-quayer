/**
 * US-104 — JWT unit tests
 *
 * Targets `src/lib/auth/jwt.ts`. The module captures `process.env.JWT_SECRET`
 * at import time, so we MUST set the env var BEFORE the dynamic import.
 * Each test uses a deterministic secret to keep results stable.
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import type {
  signAccessToken as SignAccessTokenFn,
  verifyAccessToken as VerifyAccessTokenFn,
  signRefreshToken as SignRefreshTokenFn,
  verifyRefreshToken as VerifyRefreshTokenFn,
  signMagicLinkToken as SignMagicLinkTokenFn,
  verifyMagicLinkToken as VerifyMagicLinkTokenFn,
  isTokenExpired as IsTokenExpiredFn,
  extractTokenFromHeader as ExtractTokenFromHeaderFn,
  getExpirationDate as GetExpirationDateFn,
} from '@/lib/auth/jwt';

type JwtModule = {
  signAccessToken: typeof SignAccessTokenFn;
  verifyAccessToken: typeof VerifyAccessTokenFn;
  signRefreshToken: typeof SignRefreshTokenFn;
  verifyRefreshToken: typeof VerifyRefreshTokenFn;
  signMagicLinkToken: typeof SignMagicLinkTokenFn;
  verifyMagicLinkToken: typeof VerifyMagicLinkTokenFn;
  isTokenExpired: typeof IsTokenExpiredFn;
  extractTokenFromHeader: typeof ExtractTokenFromHeaderFn;
  getExpirationDate: typeof GetExpirationDateFn;
};

let jwtMod: JwtModule;

beforeAll(async () => {
  process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod-0123456789';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-0123456789';
  jwtMod = (await import('@/lib/auth/jwt')) as unknown as JwtModule;
});

const basePayload = {
  userId: 'user-123',
  email: 'alice@example.com',
  role: 'user' as const,
  currentOrgId: 'org-1',
  organizationRole: 'owner' as const,
};

describe('signAccessToken / verifyAccessToken', () => {
  it('round-trips a payload', () => {
    const token = jwtMod.signAccessToken(basePayload);
    const decoded = jwtMod.verifyAccessToken(token);
    expect(decoded).not.toBeNull();
    expect(decoded?.userId).toBe(basePayload.userId);
    expect(decoded?.email).toBe(basePayload.email);
    expect(decoded?.type).toBe('access');
  });

  it('returns null for a malformed token', () => {
    expect(jwtMod.verifyAccessToken('not.a.jwt')).toBeNull();
    expect(jwtMod.verifyAccessToken('')).toBeNull();
    expect(jwtMod.verifyAccessToken('garbage')).toBeNull();
  });

  it('returns null when verifying a token signed with a different secret', async () => {
    // Re-import with a different secret in a sandboxed module instance
    const token = jwtMod.signAccessToken(basePayload);
    process.env.JWT_SECRET = 'a-completely-different-secret';
    vi.resetModules();
    const fresh = (await import('@/lib/auth/jwt')) as unknown as JwtModule;
    expect(fresh.verifyAccessToken(token)).toBeNull();
    // Restore for the rest of the suite
    process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod-0123456789';
    vi.resetModules();
    jwtMod = (await import('@/lib/auth/jwt')) as unknown as JwtModule;
  });
});

describe('signRefreshToken / verifyRefreshToken', () => {
  it('round-trips a refresh payload', () => {
    const token = jwtMod.signRefreshToken({ userId: 'u1', tokenId: 't1' });
    const decoded = jwtMod.verifyRefreshToken(token);
    expect(decoded?.userId).toBe('u1');
    expect(decoded?.tokenId).toBe('t1');
    expect(decoded?.type).toBe('refresh');
  });

  it('rejects an access token presented as refresh', () => {
    const accessToken = jwtMod.signAccessToken(basePayload);
    expect(jwtMod.verifyRefreshToken(accessToken)).toBeNull();
  });

  it('rejects a refresh token presented as access', () => {
    const refreshToken = jwtMod.signRefreshToken({ userId: 'u', tokenId: 't' });
    expect(jwtMod.verifyAccessToken(refreshToken)).toBeNull();
  });
});

describe('signMagicLinkToken / verifyMagicLinkToken', () => {
  it('round-trips a login magic link', () => {
    const token = jwtMod.signMagicLinkToken({
      email: 'a@b.com',
      tokenId: 'vc-1',
      type: 'login',
    });
    const decoded = jwtMod.verifyMagicLinkToken(token);
    expect(decoded?.email).toBe('a@b.com');
    expect(decoded?.tokenId).toBe('vc-1');
    expect(decoded?.type).toBe('magic-link-login');
  });

  it('round-trips a signup magic link with a name', () => {
    const token = jwtMod.signMagicLinkToken({
      email: 'b@c.com',
      tokenId: 'vc-2',
      type: 'signup',
      name: 'Bob',
    });
    const decoded = jwtMod.verifyMagicLinkToken(token);
    expect(decoded?.type).toBe('magic-link-signup');
    expect(decoded?.name).toBe('Bob');
  });

  it('returns null for malformed magic-link tokens', () => {
    expect(jwtMod.verifyMagicLinkToken('garbage.token.value')).toBeNull();
  });
});

describe('isTokenExpired (with fake timers)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns false immediately after signing', () => {
    const token = jwtMod.signAccessToken(basePayload, '15m');
    expect(jwtMod.isTokenExpired(token)).toBe(false);
  });

  it('returns true after the TTL elapses', () => {
    const token = jwtMod.signAccessToken(basePayload, '1s');
    // Advance 5 seconds — well past the 1s TTL.
    vi.setSystemTime(new Date('2026-01-01T00:00:05Z'));
    expect(jwtMod.isTokenExpired(token)).toBe(true);
  });

  it('verifyAccessToken returns null after expiration', () => {
    const token = jwtMod.signAccessToken(basePayload, '1s');
    vi.setSystemTime(new Date('2026-01-01T00:00:10Z'));
    expect(jwtMod.verifyAccessToken(token)).toBeNull();
  });
});

describe('extractTokenFromHeader', () => {
  it('extracts a Bearer token', () => {
    expect(jwtMod.extractTokenFromHeader('Bearer abc.def.ghi')).toBe('abc.def.ghi');
  });

  it('returns null when header is undefined', () => {
    expect(jwtMod.extractTokenFromHeader(undefined)).toBeNull();
  });

  it('returns null when scheme is not Bearer', () => {
    expect(jwtMod.extractTokenFromHeader('Basic abc')).toBeNull();
  });

  it('returns null when there are not exactly 2 parts', () => {
    expect(jwtMod.extractTokenFromHeader('Bearer')).toBeNull();
    expect(jwtMod.extractTokenFromHeader('Bearer a b')).toBeNull();
  });
});

describe('getExpirationDate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('parses minutes', () => {
    const d = jwtMod.getExpirationDate('15m');
    expect(d.toISOString()).toBe('2026-01-01T00:15:00.000Z');
  });

  it('parses days', () => {
    const d = jwtMod.getExpirationDate('7d');
    expect(d.toISOString()).toBe('2026-01-08T00:00:00.000Z');
  });

  it('throws on invalid format', () => {
    expect(() => jwtMod.getExpirationDate('foo')).toThrow();
  });
});
