import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { isBuilderV2Enabled, parseFlag, stableHashPercent } from '@/lib/feature-flags/builder-v2';

function randomSeed(i: number): string {
  return `org-${i}-${Math.random().toString(36).slice(2)}`;
}

describe('isBuilderV2Enabled', () => {
  beforeEach(() => {
    vi.stubEnv('BUILDER_JOURNEY_V2', 'off');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns false when env is 'off' regardless of organizationId", () => {
    vi.stubEnv('BUILDER_JOURNEY_V2', 'off');
    expect(isBuilderV2Enabled('org-1')).toBe(false);
    expect(isBuilderV2Enabled(null)).toBe(false);
    expect(isBuilderV2Enabled(undefined)).toBe(false);
  });

  it("returns true when env is 'on' regardless of organizationId", () => {
    vi.stubEnv('BUILDER_JOURNEY_V2', 'on');
    expect(isBuilderV2Enabled('org-1')).toBe(true);
    expect(isBuilderV2Enabled(null)).toBe(true);
    expect(isBuilderV2Enabled(undefined)).toBe(true);
  });

  it("returns false for 'percentage:0'", () => {
    vi.stubEnv('BUILDER_JOURNEY_V2', 'percentage:0');
    for (let i = 0; i < 100; i++) {
      expect(isBuilderV2Enabled(`org-${i}`)).toBe(false);
    }
  });

  it("returns true for 'percentage:100'", () => {
    vi.stubEnv('BUILDER_JOURNEY_V2', 'percentage:100');
    for (let i = 0; i < 100; i++) {
      expect(isBuilderV2Enabled(`org-${i}`)).toBe(true);
    }
  });

  it("'percentage:50' has roughly half true across 10000 random org seeds", () => {
    vi.stubEnv('BUILDER_JOURNEY_V2', 'percentage:50');
    let count = 0;
    for (let i = 0; i < 10000; i++) {
      if (isBuilderV2Enabled(randomSeed(i))) count++;
    }
    expect(count).toBeGreaterThanOrEqual(4500);
    expect(count).toBeLessThanOrEqual(5500);
  });

  it("'percentage:10' has roughly 10% true across 10000 random org seeds", () => {
    vi.stubEnv('BUILDER_JOURNEY_V2', 'percentage:10');
    let count = 0;
    for (let i = 0; i < 10000; i++) {
      if (isBuilderV2Enabled(randomSeed(i))) count++;
    }
    expect(count).toBeGreaterThanOrEqual(800);
    expect(count).toBeLessThanOrEqual(1200);
  });

  it("override cookie 'on' beats env 'off'", () => {
    vi.stubEnv('BUILDER_JOURNEY_V2', 'off');
    expect(isBuilderV2Enabled('org-1', 'on')).toBe(true);
  });

  it("override cookie 'off' beats env 'on'", () => {
    vi.stubEnv('BUILDER_JOURNEY_V2', 'on');
    expect(isBuilderV2Enabled('org-1', 'off')).toBe(false);
  });

  it('returns the same result for the same organizationId across calls (determinism)', () => {
    vi.stubEnv('BUILDER_JOURNEY_V2', 'percentage:50');
    const seed = 'deterministic-org-xyz';
    const first = isBuilderV2Enabled(seed);
    for (let i = 0; i < 50; i++) {
      expect(isBuilderV2Enabled(seed)).toBe(first);
    }
  });

  it("falls back to 'off' on malformed env value", () => {
    vi.stubEnv('BUILDER_JOURNEY_V2', 'percentage:abc');
    expect(isBuilderV2Enabled('org-1')).toBe(false);
    vi.stubEnv('BUILDER_JOURNEY_V2', 'garbage');
    expect(isBuilderV2Enabled('org-1')).toBe(false);
  });
});

describe('stableHashPercent', () => {
  it('returns a value in [0, 100)', () => {
    for (let i = 0; i < 1000; i++) {
      const v = stableHashPercent(`org-${i}`);
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
    vi.stubEnv('BUILDER_JOURNEY_V2', 'off');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns 'off' when env unset or invalid", () => {
    vi.stubEnv('BUILDER_JOURNEY_V2', '');
    expect(parseFlag()).toBe('off');
    vi.stubEnv('BUILDER_JOURNEY_V2', 'nonsense');
    expect(parseFlag()).toBe('off');
  });

  it("passes through 'on', 'off', and 'percentage:N'", () => {
    vi.stubEnv('BUILDER_JOURNEY_V2', 'on');
    expect(parseFlag()).toBe('on');
    vi.stubEnv('BUILDER_JOURNEY_V2', 'off');
    expect(parseFlag()).toBe('off');
    vi.stubEnv('BUILDER_JOURNEY_V2', 'percentage:25');
    expect(parseFlag()).toBe('percentage:25');
  });
});
