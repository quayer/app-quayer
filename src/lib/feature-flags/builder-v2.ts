/**
 * builder-v2 feature flag (Jornada Builder v2).
 *
 * Controla o rollout staged da Jornada v2 do Builder. A decisao e tomada no
 * BACKEND no momento da criacao do projeto (gravada em `builderState.journeyVersion`),
 * por isso a env var NAO e `NEXT_PUBLIC_*` — nunca precisa vazar para o client.
 *
 * Espelha o idiom de `auth-v3.ts`: env `off | on | percentage:N` + cookie override
 * `builder-v2-override` + hash SHA-256 estavel. A coorte do `percentage` e por
 * ORGANIZACAO (seed = organizationId): uma agencia nao mistura jornadas entre
 * projetos da mesma org (plan secao 1).
 */
import { createHash } from 'node:crypto';

export const BUILDER_V2_OVERRIDE_COOKIE = 'builder-v2-override';

type FlagValue = 'off' | `percentage:${number}` | 'on';

function parseFlag(): FlagValue {
  const raw = (process.env.BUILDER_JOURNEY_V2 ?? 'off').trim();
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
 * Returns true if the Builder Journey v2 should be used for this organization.
 *
 * Priority:
 * 1. Cookie `builder-v2-override=on` (QA bypass) -> true
 * 2. Cookie `builder-v2-override=off` (QA bypass) -> false
 * 3. BUILDER_JOURNEY_V2 env var:
 *    - 'on' -> always true
 *    - 'off' -> always false
 *    - 'percentage:N' -> hash(seedId) % 100 < N
 *
 * @param seedId organizationId (coorte estavel por org). Required for percentage mode.
 * @param overrideCookie value of builder-v2-override cookie, if any
 */
export function isBuilderV2Enabled(seedId?: string | null, overrideCookie?: string | null): boolean {
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
