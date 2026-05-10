/**
 * Signup gate unit tests — src/server/core/auth/_shared/signup-gate.ts
 *
 * isSignupEnabled() is the single source of truth for "can new users be created?".
 * We test all env var combinations — including missing, 'false', 'true', and
 * truthy non-'false' values.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';

async function importSignupGate(signupEnabledEnv: string | undefined) {
  // Set env BEFORE resetting modules (isSignupEnabled reads env at call time, not import time,
  // but we still reset to get a fresh module instance without stale closure state)
  if (signupEnabledEnv === undefined) {
    delete process.env.SIGNUP_ENABLED;
  } else {
    process.env.SIGNUP_ENABLED = signupEnabledEnv;
  }
  vi.resetModules();
  return await import('@/server/core/auth/_shared/signup-gate');
}

afterEach(() => {
  vi.resetModules();
});

describe('isSignupEnabled', () => {
  it('returns true when SIGNUP_ENABLED is not set (default open)', async () => {
    const { isSignupEnabled } = await importSignupGate(undefined);
    expect(isSignupEnabled()).toBe(true);
  });

  it('returns true when SIGNUP_ENABLED=true', async () => {
    const { isSignupEnabled } = await importSignupGate('true');
    expect(isSignupEnabled()).toBe(true);
  });

  it('returns true when SIGNUP_ENABLED=1', async () => {
    const { isSignupEnabled } = await importSignupGate('1');
    expect(isSignupEnabled()).toBe(true);
  });

  it('returns true when SIGNUP_ENABLED=yes', async () => {
    const { isSignupEnabled } = await importSignupGate('yes');
    expect(isSignupEnabled()).toBe(true);
  });

  it('returns false when SIGNUP_ENABLED=false', async () => {
    const { isSignupEnabled } = await importSignupGate('false');
    expect(isSignupEnabled()).toBe(false);
  });

  it('returns true when SIGNUP_ENABLED=FALSE (case-sensitive check — only exact lowercase "false" disables)', async () => {
    // The implementation checks `!== 'false'` so uppercase does NOT disable
    const { isSignupEnabled } = await importSignupGate('FALSE');
    expect(isSignupEnabled()).toBe(true);
  });
});

describe('SIGNUP_DISABLED_MESSAGE', () => {
  it('is a non-empty string', async () => {
    const { SIGNUP_DISABLED_MESSAGE } = await importSignupGate(undefined);
    expect(typeof SIGNUP_DISABLED_MESSAGE).toBe('string');
    expect(SIGNUP_DISABLED_MESSAGE.length).toBeGreaterThan(10);
  });
});
