/**
 * JWT lazy-init tests — src/lib/auth/jwt.ts
 *
 * The module uses module-level caches (_JWT_SECRET, _JWT_REFRESH_SECRET,
 * _JWT_MAGIC_LINK_SECRET) that are populated on first use.
 *
 * KEY INSIGHT: vi.resetModules() works within one file but Vitest reuses the
 * same process, meaning module-level caches DO persist if a previously cached
 * module re-uses the same binding. We therefore must set env vars BEFORE
 * resetting modules AND must accept that once a secret is cached in one
 * describe block, later blocks in the same file see the cached value.
 *
 * Strategy:
 *   - Use isolated describe blocks that each establish the full required env
 *     via process.env BEFORE vi.resetModules() + import.
 *   - For "throws when absent/invalid" tests, we run them FIRST in a fresh
 *     describe block so the module cache hasn't been populated yet.
 *   - We document the cache behavior as a test rather than fighting it.
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';

const VALID_SECRET  = 'test-secret-do-not-use-in-prod-0123456789';
const VALID_REFRESH = 'test-refresh-secret-0123456789-xyzxyz';
const VALID_MAGIC   = 'test-magic-link-secret-0123456789-abc';
const SHORT_SECRET  = 'tooshort';
const PLACEHOLDER   = 'your_random_secret_key_here_change_in_production';

// ---------------------------------------------------------------------------
// Helper: set env and get a fresh module (resets all lazy caches)
// ---------------------------------------------------------------------------
async function freshJwtWith(overrides: Record<string, string | undefined>) {
  // Apply env first — the module reads it on first function call
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  vi.resetModules();
  return await import('@/lib/auth/jwt');
}

// ---------------------------------------------------------------------------
// JWT_SECRET validation (access token path)
// ---------------------------------------------------------------------------

describe('jwtSecret lazy validation — access token', () => {
  afterEach(() => { vi.resetModules(); });

  it('throws "required" when JWT_SECRET is absent', async () => {
    const mod = await freshJwtWith({
      JWT_SECRET: undefined,
      JWT_REFRESH_SECRET: VALID_REFRESH,
      JWT_MAGIC_LINK_SECRET: VALID_MAGIC,
    });
    expect(() => mod.signAccessToken({ userId: 'u', email: 'a@b.com', role: 'user' }))
      .toThrow('JWT_SECRET environment variable is required');
  });

  it('throws "must be at least 32 characters" when JWT_SECRET is 31 chars', async () => {
    const mod = await freshJwtWith({
      JWT_SECRET: 'a'.repeat(31),
      JWT_REFRESH_SECRET: VALID_REFRESH,
      JWT_MAGIC_LINK_SECRET: VALID_MAGIC,
    });
    expect(() => mod.signAccessToken({ userId: 'u', email: 'a@b.com', role: 'user' }))
      .toThrow('must be at least 32 characters');
  });

  it('throws "cannot be a placeholder" for known placeholder values', async () => {
    const mod = await freshJwtWith({
      JWT_SECRET: PLACEHOLDER,
      JWT_REFRESH_SECRET: VALID_REFRESH,
      JWT_MAGIC_LINK_SECRET: VALID_MAGIC,
    });
    expect(() => mod.signAccessToken({ userId: 'u', email: 'a@b.com', role: 'user' }))
      .toThrow('cannot be a placeholder value');
  });

  it('accepts JWT_SECRET of exactly 32 characters (boundary)', async () => {
    const mod = await freshJwtWith({
      JWT_SECRET: 'a'.repeat(32),
      JWT_REFRESH_SECRET: VALID_REFRESH,
      JWT_MAGIC_LINK_SECRET: VALID_MAGIC,
    });
    const token = mod.signAccessToken({ userId: 'u', email: 'a@b.com', role: 'user' });
    expect(typeof token).toBe('string');
    expect(token.split('.').length).toBe(3); // valid JWT has 3 parts
  });

  it('caches the validated secret — env removal after first call does not break signing', async () => {
    const mod = await freshJwtWith({
      JWT_SECRET: VALID_SECRET,
      JWT_REFRESH_SECRET: VALID_REFRESH,
      JWT_MAGIC_LINK_SECRET: VALID_MAGIC,
    });
    // First call — populates cache
    mod.signAccessToken({ userId: 'u', email: 'a@b.com', role: 'user' });
    // Remove env — cache should keep it alive
    delete process.env.JWT_SECRET;
    const token = mod.signAccessToken({ userId: 'u', email: 'a@b.com', role: 'user' });
    expect(typeof token).toBe('string');
    // Restore for other tests
    process.env.JWT_SECRET = VALID_SECRET;
  });
});

// ---------------------------------------------------------------------------
// JWT_REFRESH_SECRET validation
// ---------------------------------------------------------------------------

describe('jwtRefreshSecret lazy validation', () => {
  afterEach(() => { vi.resetModules(); });

  it('throws when JWT_REFRESH_SECRET is absent', async () => {
    const mod = await freshJwtWith({
      JWT_SECRET: VALID_SECRET,
      JWT_REFRESH_SECRET: undefined,
      JWT_MAGIC_LINK_SECRET: VALID_MAGIC,
    });
    expect(() => mod.signRefreshToken({ userId: 'u', tokenId: 't' }))
      .toThrow('JWT_REFRESH_SECRET environment variable is required');
  });

  it('throws when JWT_REFRESH_SECRET is shorter than 32 characters', async () => {
    const mod = await freshJwtWith({
      JWT_SECRET: VALID_SECRET,
      JWT_REFRESH_SECRET: SHORT_SECRET,
      JWT_MAGIC_LINK_SECRET: VALID_MAGIC,
    });
    expect(() => mod.signRefreshToken({ userId: 'u', tokenId: 't' }))
      .toThrow('must be at least 32 characters');
  });

  it('accepts a valid JWT_REFRESH_SECRET (>= 32 chars)', async () => {
    const mod = await freshJwtWith({
      JWT_SECRET: VALID_SECRET,
      JWT_REFRESH_SECRET: VALID_REFRESH,
      JWT_MAGIC_LINK_SECRET: VALID_MAGIC,
    });
    const token = mod.signRefreshToken({ userId: 'u', tokenId: 't' });
    expect(token.split('.').length).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// JWT_MAGIC_LINK_SECRET validation
// ---------------------------------------------------------------------------

describe('jwtMagicLinkSecret lazy validation', () => {
  afterEach(() => { vi.resetModules(); });

  it('throws when JWT_MAGIC_LINK_SECRET is absent', async () => {
    const mod = await freshJwtWith({
      JWT_SECRET: VALID_SECRET,
      JWT_REFRESH_SECRET: VALID_REFRESH,
      JWT_MAGIC_LINK_SECRET: undefined,
    });
    expect(() => mod.signMagicLinkToken({ email: 'a@b.com', tokenId: 't', type: 'login' }))
      .toThrow('[Security] JWT_MAGIC_LINK_SECRET is required');
  });

  it('throws when JWT_MAGIC_LINK_SECRET is shorter than 32 characters', async () => {
    const mod = await freshJwtWith({
      JWT_SECRET: VALID_SECRET,
      JWT_REFRESH_SECRET: VALID_REFRESH,
      JWT_MAGIC_LINK_SECRET: SHORT_SECRET,
    });
    expect(() => mod.signMagicLinkToken({ email: 'a@b.com', tokenId: 't', type: 'login' }))
      .toThrow('must be at least 32 characters');
  });

  it('accepts a valid JWT_MAGIC_LINK_SECRET', async () => {
    const mod = await freshJwtWith({
      JWT_SECRET: VALID_SECRET,
      JWT_REFRESH_SECRET: VALID_REFRESH,
      JWT_MAGIC_LINK_SECRET: VALID_MAGIC,
    });
    const token = mod.signMagicLinkToken({ email: 'a@b.com', tokenId: 't', type: 'login' });
    expect(token.split('.').length).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// signRefreshToken / verifyRefreshToken round-trips
// ---------------------------------------------------------------------------

describe('signRefreshToken / verifyRefreshToken round-trips', () => {
  let mod: Awaited<ReturnType<typeof freshJwtWith>>;

  beforeAll(async () => {
    mod = await freshJwtWith({
      JWT_SECRET: VALID_SECRET,
      JWT_REFRESH_SECRET: VALID_REFRESH,
      JWT_MAGIC_LINK_SECRET: VALID_MAGIC,
    });
  });

  it('round-trips a refresh payload correctly', () => {
    const token = mod.signRefreshToken({ userId: 'u1', tokenId: 't1' });
    const decoded = mod.verifyRefreshToken(token);
    expect(decoded).not.toBeNull();
    expect(decoded?.userId).toBe('u1');
    expect(decoded?.tokenId).toBe('t1');
    expect(decoded?.type).toBe('refresh');
  });

  it('rejects a refresh token when verified as access token', () => {
    const token = mod.signRefreshToken({ userId: 'u', tokenId: 't' });
    expect(mod.verifyAccessToken(token)).toBeNull();
  });

  it('rejects an access token when verified as refresh token', () => {
    const token = mod.signAccessToken({ userId: 'u', email: 'a@b.com', role: 'user' });
    expect(mod.verifyRefreshToken(token)).toBeNull();
  });

  it('returns null for malformed refresh token', () => {
    expect(mod.verifyRefreshToken('bad.token.garbage')).toBeNull();
    expect(mod.verifyRefreshToken('')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// signMagicLinkToken / verifyMagicLinkToken round-trips
// ---------------------------------------------------------------------------

describe('signMagicLinkToken / verifyMagicLinkToken round-trips', () => {
  let mod: Awaited<ReturnType<typeof freshJwtWith>>;

  beforeAll(async () => {
    mod = await freshJwtWith({
      JWT_SECRET: VALID_SECRET,
      JWT_REFRESH_SECRET: VALID_REFRESH,
      JWT_MAGIC_LINK_SECRET: VALID_MAGIC,
    });
  });

  it('round-trips a login magic link', () => {
    const token = mod.signMagicLinkToken({ email: 'a@b.com', tokenId: 'vc-1', type: 'login' });
    const decoded = mod.verifyMagicLinkToken(token);
    expect(decoded).not.toBeNull();
    expect(decoded?.email).toBe('a@b.com');
    expect(decoded?.tokenId).toBe('vc-1');
    expect(decoded?.type).toBe('magic-link-login');
  });

  it('round-trips a signup magic link with a name', () => {
    const token = mod.signMagicLinkToken({ email: 'b@c.com', tokenId: 'vc-2', type: 'signup', name: 'Bob' });
    const decoded = mod.verifyMagicLinkToken(token);
    expect(decoded?.type).toBe('magic-link-signup');
    expect(decoded?.name).toBe('Bob');
    expect(decoded?.email).toBe('b@c.com');
  });

  it('returns null for a malformed token', () => {
    expect(mod.verifyMagicLinkToken('garbage.token.value')).toBeNull();
  });

  it('rejects an access token presented as a magic link', () => {
    const accessToken = mod.signAccessToken({ userId: 'u', email: 'a@b.com', role: 'user' });
    expect(mod.verifyMagicLinkToken(accessToken)).toBeNull();
  });

  it('rejects a refresh token presented as a magic link', () => {
    const refreshToken = mod.signRefreshToken({ userId: 'u', tokenId: 't' });
    expect(mod.verifyMagicLinkToken(refreshToken)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// validateBearerToken
// ---------------------------------------------------------------------------

describe('validateBearerToken', () => {
  let mod: Awaited<ReturnType<typeof freshJwtWith>>;

  beforeAll(async () => {
    mod = await freshJwtWith({
      JWT_SECRET: VALID_SECRET,
      JWT_REFRESH_SECRET: VALID_REFRESH,
      JWT_MAGIC_LINK_SECRET: VALID_MAGIC,
    });
  });

  it('returns {userId, currentOrgId} for a valid access token', () => {
    const token = mod.signAccessToken({ userId: 'user-42', email: 'x@y.com', role: 'user', currentOrgId: 'org-1' });
    const result = mod.validateBearerToken(token);
    expect(result).not.toBeNull();
    expect(result?.userId).toBe('user-42');
    expect(result?.currentOrgId).toBe('org-1');
  });

  it('returns null for a refresh token (wrong audience)', () => {
    const token = mod.signRefreshToken({ userId: 'u', tokenId: 't' });
    expect(mod.validateBearerToken(token)).toBeNull();
  });

  it('returns null for a malformed token', () => {
    expect(mod.validateBearerToken('not.a.jwt')).toBeNull();
    expect(mod.validateBearerToken('')).toBeNull();
  });

  it('returns null for a magic-link token (wrong audience)', () => {
    const token = mod.signMagicLinkToken({ email: 'a@b.com', tokenId: 'vc-1', type: 'login' });
    expect(mod.validateBearerToken(token)).toBeNull();
  });

  it('currentOrgId is undefined when not set in payload', () => {
    const token = mod.signAccessToken({ userId: 'u', email: 'a@b.com', role: 'user' });
    const result = mod.validateBearerToken(token);
    expect(result).not.toBeNull();
    expect(result?.currentOrgId).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Token expiration with fake timers
// ---------------------------------------------------------------------------

describe('token expiration behavior', () => {
  let mod: Awaited<ReturnType<typeof freshJwtWith>>;

  beforeAll(async () => {
    mod = await freshJwtWith({
      JWT_SECRET: VALID_SECRET,
      JWT_REFRESH_SECRET: VALID_REFRESH,
      JWT_MAGIC_LINK_SECRET: VALID_MAGIC,
    });
  });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('access token is not expired immediately after signing', () => {
    const token = mod.signAccessToken({ userId: 'u', email: 'a@b.com', role: 'user' }, '15m');
    expect(mod.isTokenExpired(token)).toBe(false);
  });

  it('access token is expired after TTL elapses', () => {
    const token = mod.signAccessToken({ userId: 'u', email: 'a@b.com', role: 'user' }, '1s');
    vi.setSystemTime(new Date('2026-01-01T00:00:10Z'));
    expect(mod.isTokenExpired(token)).toBe(true);
    expect(mod.verifyAccessToken(token)).toBeNull();
  });

  it('verifyAccessToken returns payload before TTL and null after', () => {
    const token = mod.signAccessToken({ userId: 'u2', email: 'b@c.com', role: 'user' }, '5m');
    // Before expiry
    const payload = mod.verifyAccessToken(token);
    expect(payload?.userId).toBe('u2');
    // After expiry
    vi.setSystemTime(new Date('2026-01-01T00:06:00Z'));
    expect(mod.verifyAccessToken(token)).toBeNull();
  });
});
