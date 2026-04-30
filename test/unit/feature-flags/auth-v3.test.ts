import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { isAuthV3Enabled, parseFlag, stableHashPercent } from '@/lib/feature-flags/auth-v3';

function randomSeed(i: number): string {
  return `seed-${i}-${Math.random().toString(36).slice(2)}`;
}

describe('isAuthV3Enabled', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_AUTH_V3', 'off');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns false when env is 'off' regardless of seedId", () => {
    vi.stubEnv('NEXT_PUBLIC_AUTH_V3', 'off');
    expect(isAuthV3Enabled('user-1')).toBe(false);
    expect(isAuthV3Enabled(null)).toBe(false);
    expect(isAuthV3Enabled(undefined)).toBe(false);
  });

  it("returns true when env is 'on' regardless of seedId", () => {
    vi.stubEnv('NEXT_PUBLIC_AUTH_V3', 'on');
    expect(isAuthV3Enabled('user-1')).toBe(true);
    expect(isAuthV3Enabled(null)).toBe(true);
    expect(isAuthV3Enabled(undefined)).toBe(true);
  });

  it("returns false for 'percentage:0'", () => {
    vi.stubEnv('NEXT_PUBLIC_AUTH_V3', 'percentage:0');
    for (let i = 0; i < 100; i++) {
      expect(isAuthV3Enabled(`user-${i}`)).toBe(false);
    }
  });

  it("returns true for 'percentage:100'", () => {
    vi.stubEnv('NEXT_PUBLIC_AUTH_V3', 'percentage:100');
    for (let i = 0; i < 100; i++) {
      expect(isAuthV3Enabled(`user-${i}`)).toBe(true);
    }
  });

  it("'percentage:50' has roughly half true across 10000 random seeds", () => {
    vi.stubEnv('NEXT_PUBLIC_AUTH_V3', 'percentage:50');
    let count = 0;
    for (let i = 0; i < 10000; i++) {
      if (isAuthV3Enabled(randomSeed(i))) count++;
    }
    expect(count).toBeGreaterThanOrEqual(4500);
    expect(count).toBeLessThanOrEqual(5500);
  });

  it("'percentage:10' has roughly 10% true across 10000 random seeds", () => {
    vi.stubEnv('NEXT_PUBLIC_AUTH_V3', 'percentage:10');
    let count = 0;
    for (let i = 0; i < 10000; i++) {
      if (isAuthV3Enabled(randomSeed(i))) count++;
    }
    expect(count).toBeGreaterThanOrEqual(800);
    expect(count).toBeLessThanOrEqual(1200);
  });

  it("override cookie 'on' beats env 'off'", () => {
    vi.stubEnv('NEXT_PUBLIC_AUTH_V3', 'off');
    expect(isAuthV3Enabled('user-1', 'on')).toBe(true);
  });

  it("override cookie 'off' beats env 'on'", () => {
    vi.stubEnv('NEXT_PUBLIC_AUTH_V3', 'on');
    expect(isAuthV3Enabled('user-1', 'off')).toBe(false);
  });

  it('returns the same result for the same seedId across calls (determinism)', () => {
    vi.stubEnv('NEXT_PUBLIC_AUTH_V3', 'percentage:50');
    const seed = 'deterministic-seed-xyz';
    const first = isAuthV3Enabled(seed);
    for (let i = 0; i < 50; i++) {
      expect(isAuthV3Enabled(seed)).toBe(first);
    }
  });

  it("falls back to 'off' on malformed env value", () => {
    vi.stubEnv('NEXT_PUBLIC_AUTH_V3', 'percentage:abc');
    expect(isAuthV3Enabled('user-1')).toBe(false);
    vi.stubEnv('NEXT_PUBLIC_AUTH_V3', 'garbage');
    expect(isAuthV3Enabled('user-1')).toBe(false);
  });
});

describe('stableHashPercent', () => {
  it('returns a value in [0, 100)', () => {
    for (let i = 0; i < 1000; i++) {
      const v = stableHashPercent(`seed-${i}`);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(100);
    }
  });

  it('is deterministic for the same seed', () => {
    expect(stableHashPercent('hello')).toBe(stableHashPercent('hello'));
  });
});

describe('parseFlag', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_AUTH_V3', 'off');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns 'off' when env unset or invalid", () => {
    vi.stubEnv('NEXT_PUBLIC_AUTH_V3', '');
    expect(parseFlag()).toBe('off');
    vi.stubEnv('NEXT_PUBLIC_AUTH_V3', 'nonsense');
    expect(parseFlag()).toBe('off');
  });

  it("passes through 'on', 'off', and 'percentage:N'", () => {
    vi.stubEnv('NEXT_PUBLIC_AUTH_V3', 'on');
    expect(parseFlag()).toBe('on');
    vi.stubEnv('NEXT_PUBLIC_AUTH_V3', 'off');
    expect(parseFlag()).toBe('off');
    vi.stubEnv('NEXT_PUBLIC_AUTH_V3', 'percentage:25');
    expect(parseFlag()).toBe('percentage:25');
  });
});
