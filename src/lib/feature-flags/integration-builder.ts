/**
 * integration-builder feature flag.
 *
 * Controla o rollout do Integration Builder (Onda 1). Espelha auth-v3.ts em
 * estrutura: env var `NEXT_PUBLIC_INTEGRATION_BUILDER` ('off' | 'on' |
 * 'percentage:N'), cookie de override para QA, e hash estavel por seedId.
 *
 * Diferente de auth-v3, o seed do bucket percentual eh o `organizationId` (o
 * Builder eh por tenant), garantindo que toda a org caia no mesmo bucket.
 */
import { createHash } from 'node:crypto';

type FlagValue = 'off' | `percentage:${number}` | 'on';

function parseFlag(): FlagValue {
  const raw = (process.env.NEXT_PUBLIC_INTEGRATION_BUILDER ?? 'off').trim();
  if (raw === 'on' || raw === 'off') return raw;
  if (/^percentage:\d+$/.test(raw)) return raw as FlagValue;
  return 'off';
}

function stableHashPercent(seed: string): number {
  const h = createHash('sha256').update(seed).digest();
  // take first 4 bytes as uint32, mod 100
  const n = h.readUInt32BE(0);
  return n % 100;
}

/**
 * Cookie name for QA override of the Integration Builder flag.
 */
export const INTEGRATION_BUILDER_OVERRIDE_COOKIE = 'integration-builder-override';

/**
 * Returns true if the Integration Builder should be enabled for this org/session.
 *
 * Priority:
 * 1. Cookie `integration-builder-override=on` (QA bypass) -> true
 * 2. Cookie `integration-builder-override=off` (QA bypass) -> false
 * 3. NEXT_PUBLIC_INTEGRATION_BUILDER env var:
 *    - 'on' -> always true
 *    - 'off' -> always false
 *    - 'percentage:N' -> hash(seedId) % 100 < N
 *
 * @param seedId organizationId (the Builder is per-tenant). Required for percentage mode.
 * @param overrideCookie value of integration-builder-override cookie, if any
 */
export function isIntegrationBuilderEnabled(
  seedId?: string | null,
  overrideCookie?: string | null,
): boolean {
  if (overrideCookie === 'on') return true;
  if (overrideCookie === 'off') return false;

  const flag = parseFlag();
  if (flag === 'off') return false;
  if (flag === 'on') return true;

  // percentage:N
  const match = flag.match(/^percentage:(\d+)$/);
  if (!match) return false;
  const threshold = Math.min(100, Math.max(0, Number(match[1])));
  if (threshold === 0) return false;
  if (threshold === 100) return true;

  const seed = seedId ?? 'anonymous-no-seed';
  return stableHashPercent(seed) < threshold;
}

// Exported for tests
export { stableHashPercent, parseFlag };
