/**
 * US-104 — OTP unit tests
 *
 * Quayer is 100% passwordless. The only OTP helper that exists in the
 * codebase today is `generateOTPCode` in `src/lib/auth/bcrypt.ts` (the file
 * is mis-named — it also hosts OTP/recovery-code helpers). OTP verification
 * happens inline against the `VerificationCode` Prisma table inside the
 * auth controller; there is no `verifyOtp()` helper to import. These tests
 * exercise the generation primitive that does exist plus the
 * VerificationCode-style "compare + TTL" logic that mirrors what the
 * controller does (so the behaviour is documented somewhere).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateOTPCode, generateRecoveryCodes } from '@/lib/auth/bcrypt';

/**
 * Mirror of the controller-side validation. Kept inside the test file on
 * purpose: we are not adding new source helpers (constraint of the story)
 * but we still want to assert the contract behaves the way the controller
 * relies on it.
 */
interface StoredOtp {
  code: string;
  expiresAt: Date;
  used: boolean;
}

function verifyStoredOtp(stored: StoredOtp | null, submitted: string, now: Date = new Date()): boolean {
  if (!stored) return false;
  if (stored.used) return false;
  if (stored.expiresAt.getTime() <= now.getTime()) return false;
  return stored.code === submitted;
}

describe('generateOTPCode', () => {
  it('generates a 6-digit code by default', () => {
    const code = generateOTPCode();
    expect(code).toHaveLength(6);
    expect(/^\d{6}$/.test(code)).toBe(true);
  });

  it('respects a custom digit count', () => {
    const code = generateOTPCode(4);
    expect(code).toHaveLength(4);
    expect(/^\d{4}$/.test(code)).toBe(true);
  });

  it('produces numeric-only output (no letters or symbols)', () => {
    for (let i = 0; i < 50; i++) {
      const code = generateOTPCode();
      expect(/^[0-9]+$/.test(code)).toBe(true);
    }
  });

  it('does not produce trivially repeating sequences across calls', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) {
      seen.add(generateOTPCode());
    }
    // 100 random 6-digit codes should almost never collide entirely.
    // Allow a generous threshold to keep the test non-flaky.
    expect(seen.size).toBeGreaterThan(90);
  });

  it('always falls within the [10^(d-1), 10^d - 1] range', () => {
    for (let i = 0; i < 50; i++) {
      const code = generateOTPCode(6);
      const n = parseInt(code, 10);
      expect(n).toBeGreaterThanOrEqual(100000);
      expect(n).toBeLessThanOrEqual(999999);
    }
  });
});

describe('generateRecoveryCodes', () => {
  it('returns 8 codes by default', () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(8);
  });

  it('every recovery code is hex of length 8 (4 bytes)', () => {
    const codes = generateRecoveryCodes(5);
    expect(codes).toHaveLength(5);
    for (const c of codes) {
      expect(/^[0-9a-f]{8}$/.test(c)).toBe(true);
    }
  });
});

describe('verifyStoredOtp (mirrors controller behaviour)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns true when code matches and is not expired or used', () => {
    const stored: StoredOtp = {
      code: '123456',
      expiresAt: new Date('2026-01-01T00:15:00Z'),
      used: false,
    };
    expect(verifyStoredOtp(stored, '123456')).toBe(true);
  });

  it('returns false when code is wrong', () => {
    const stored: StoredOtp = {
      code: '123456',
      expiresAt: new Date('2026-01-01T00:15:00Z'),
      used: false,
    };
    expect(verifyStoredOtp(stored, '654321')).toBe(false);
  });

  it('returns false when there is no stored record', () => {
    expect(verifyStoredOtp(null, '123456')).toBe(false);
  });

  it('returns false when the OTP has already been used', () => {
    const stored: StoredOtp = {
      code: '123456',
      expiresAt: new Date('2026-01-01T00:15:00Z'),
      used: true,
    };
    expect(verifyStoredOtp(stored, '123456')).toBe(false);
  });

  it('returns false when the OTP has expired (TTL elapsed)', () => {
    const stored: StoredOtp = {
      code: '123456',
      expiresAt: new Date('2026-01-01T00:15:00Z'),
      used: false,
    };
    // Advance the clock 16 minutes — past the 15-minute TTL.
    vi.setSystemTime(new Date('2026-01-01T00:16:00Z'));
    expect(verifyStoredOtp(stored, '123456')).toBe(false);
  });
});
