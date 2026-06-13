/**
 * builder-mission-first feature flag (Jornada Builder v3 — passo MISSAO).
 *
 * Controla o rollout staged do passo MISSAO (mission-first, FR-37/FR-48) DENTRO
 * da Jornada v2. A decisao e tomada no BACKEND no momento da criacao do projeto
 * (gravada em `builderState.missionFirst`), por isso a env var NAO e
 * `NEXT_PUBLIC_*` — nunca precisa vazar para o client. O marcador so e semeado
 * quando o projeto ja nasce em `journeyVersion === 2`: mission-first e um
 * incremento ADITIVO sobre a v2 (NFR-12), nunca sobre a v1.
 *
 * Espelha o idiom de `builder-v2.ts` / `auth-v3.ts`: env `off | on | percentage:N`
 * + cookie override `builder-mission-first-override` + hash SHA-256 estavel. A
 * coorte do `percentage` e por ORGANIZACAO (seed = organizationId): uma agencia
 * nao mistura jornadas entre projetos da mesma org.
 */
import { createHash } from 'node:crypto';

export const BUILDER_MISSION_FIRST_OVERRIDE_COOKIE = 'builder-mission-first-override';

type FlagValue = 'off' | `percentage:${number}` | 'on';

function parseFlag(): FlagValue {
  const raw = (process.env.BUILDER_MISSION_FIRST ?? 'off').trim();
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
 * Returns true if the mission-first step (Jornada v3) should be used for this
 * organization.
 *
 * Priority:
 * 1. Cookie `builder-mission-first-override=on` (QA bypass) -> true
 * 2. Cookie `builder-mission-first-override=off` (QA bypass) -> false
 * 3. BUILDER_MISSION_FIRST env var:
 *    - 'on' -> always true
 *    - 'off' -> always false
 *    - 'percentage:N' -> hash(seedId) % 100 < N
 *
 * NOTE: o caller (seed do projeto) ja gateia por `journeyVersion === 2` antes de
 * consultar este flag — mission-first nunca e semeado em projetos v1.
 *
 * @param seedId organizationId (coorte estavel por org). Required for percentage mode.
 * @param overrideCookie value of builder-mission-first-override cookie, if any
 */
export function isBuilderMissionFirstEnabled(
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
