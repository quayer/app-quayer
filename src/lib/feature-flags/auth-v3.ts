import { createHash } from 'node:crypto';

type FlagValue = 'off' | `percentage:${number}` | 'on';

function parseFlag(): FlagValue {
  const raw = (process.env.NEXT_PUBLIC_AUTH_V3 ?? 'off').trim();
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
 * Returns true if auth v3 UI should render for this user/session.
 *
 * Priority:
 * 1. Cookie `auth-v3-override=on` (QA bypass) -> true
 * 2. Cookie `auth-v3-override=off` (QA bypass) -> false
 * 3. NEXT_PUBLIC_AUTH_V3 env var:
 *    - 'on' -> always true
 *    - 'off' -> always false
 *    - 'percentage:N' -> hash(seedId) % 100 < N
 *
 * @param seedId userId (if authenticated) or anonymous cookieId. Required for percentage mode.
 * @param overrideCookie value of auth-v3-override cookie, if any
 */
export function isAuthV3Enabled(seedId?: string | null, overrideCookie?: string | null): boolean {
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
