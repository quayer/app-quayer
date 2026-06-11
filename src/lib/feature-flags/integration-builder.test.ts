import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  isIntegrationBuilderEnabled,
  INTEGRATION_BUILDER_OVERRIDE_COOKIE,
} from './integration-builder';

const ENV = 'NEXT_PUBLIC_INTEGRATION_BUILDER';

// parseFlag() reads process.env at call time, so vi.stubEnv is picked up
// without needing vi.resetModules() + dynamic import.
describe('isIntegrationBuilderEnabled', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is off by default when env is unset', () => {
    expect(isIntegrationBuilderEnabled('org-1')).toBe(false);
    expect(isIntegrationBuilderEnabled()).toBe(false);
  });

  it("env 'on' -> always true", () => {
    vi.stubEnv(ENV, 'on');
    expect(isIntegrationBuilderEnabled('org-1')).toBe(true);
    expect(isIntegrationBuilderEnabled('org-2')).toBe(true);
    expect(isIntegrationBuilderEnabled()).toBe(true);
  });

  it("env 'off' -> always false", () => {
    vi.stubEnv(ENV, 'off');
    expect(isIntegrationBuilderEnabled('org-1')).toBe(false);
    expect(isIntegrationBuilderEnabled('org-2')).toBe(false);
    expect(isIntegrationBuilderEnabled()).toBe(false);
  });

  it('invalid env value falls back to off', () => {
    vi.stubEnv(ENV, 'garbage');
    expect(isIntegrationBuilderEnabled('org-1')).toBe(false);
  });

  it("'percentage:0' -> false for any seed", () => {
    vi.stubEnv(ENV, 'percentage:0');
    expect(isIntegrationBuilderEnabled('org-1')).toBe(false);
    expect(isIntegrationBuilderEnabled('org-2')).toBe(false);
    expect(isIntegrationBuilderEnabled('whatever-seed')).toBe(false);
  });

  it("'percentage:100' -> true for any seed", () => {
    vi.stubEnv(ENV, 'percentage:100');
    expect(isIntegrationBuilderEnabled('org-1')).toBe(true);
    expect(isIntegrationBuilderEnabled('org-2')).toBe(true);
    expect(isIntegrationBuilderEnabled('whatever-seed')).toBe(true);
  });

  it('percentage is stable: same seed -> same result across calls', () => {
    vi.stubEnv(ENV, 'percentage:50');
    const first = isIntegrationBuilderEnabled('stable-seed-org');
    const second = isIntegrationBuilderEnabled('stable-seed-org');
    const third = isIntegrationBuilderEnabled('stable-seed-org');
    expect(second).toBe(first);
    expect(third).toBe(first);
  });

  it("cookie override 'on' beats env 'off'", () => {
    vi.stubEnv(ENV, 'off');
    expect(isIntegrationBuilderEnabled('org-1', 'on')).toBe(true);
  });

  it("cookie override 'off' beats env 'on'", () => {
    vi.stubEnv(ENV, 'on');
    expect(isIntegrationBuilderEnabled('org-1', 'off')).toBe(false);
  });

  it('exports the override cookie name constant', () => {
    expect(INTEGRATION_BUILDER_OVERRIDE_COOKIE).toBe('integration-builder-override');
  });
});
