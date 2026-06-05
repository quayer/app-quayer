/**
 * Google Calendar Credential Resolver.
 *
 * Lê OrganizationProvider (category=AUXILIARY, provider='google-calendar'),
 * resolve por escopo (override de projeto > org), decripta o refreshToken
 * (crypto.decrypt) e o troca por um access_token fresh via refreshAccessToken.
 *
 * Cache em memória por chave de escopo, TTL ~50min (access_token dura ~60min,
 * margem de segurança de 10min). Padrão alinhado ao credential-resolver.service.
 */

import { database as db } from '@/server/services/database';
import { decryptToken } from '@/server/ai-module/ai-agents/infra/calendar-crypto.service';
import { ProviderCategory } from '@prisma/client';
import { refreshAccessToken } from './google-calendar-oauth';
import {
  GOOGLE_CALENDAR_PROVIDER,
  type ResolvedCalendarAccess,
  type StoredCalendarCredentials,
  type CalendarProviderSettings,
} from './types';

// ── In-memory access-token cache ────────────────────────────────────────────

interface CacheEntry {
  accessToken: string;
  calendarId: string;
  expiresAt: number;
}

/** 50 minutos: access_token Google dura ~60min, deixamos 10min de folga. */
const CACHE_TTL_MS = 50 * 60_000;

const cache = new Map<string, CacheEntry>();

function cacheKey(organizationId: string, builderProjectId?: string): string {
  return `${organizationId}:${builderProjectId ?? 'org'}`;
}

function getCached(key: string): CacheEntry | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() >= entry.expiresAt) {
    cache.delete(key);
    return undefined;
  }
  return entry;
}

// ── Parsing helpers ─────────────────────────────────────────────────────────

function parseCredentials(raw: unknown): StoredCalendarCredentials | null {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const c = raw as Partial<StoredCalendarCredentials>;
    if (typeof c.refreshToken === 'string' && c.refreshToken.length > 0) {
      return { refreshToken: c.refreshToken, calendarEmail: c.calendarEmail };
    }
  }
  return null;
}

function parseSettings(raw: unknown): CalendarProviderSettings {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as CalendarProviderSettings;
  }
  return {};
}

// ── Resolver ────────────────────────────────────────────────────────────────

/**
 * Resolve acesso pronto-para-uso ao Google Calendar de uma org.
 *
 * Escopo: se builderProjectId for informado, prioriza o override do projeto;
 * caso não exista override, cai para a credencial da organização (builderProjectId=null).
 *
 * @returns { accessToken, calendarId } fresh, ou null se não houver credencial.
 */
export async function resolveCalendarAccess(
  organizationId: string,
  builderProjectId?: string,
): Promise<ResolvedCalendarAccess | null> {
  const key = cacheKey(organizationId, builderProjectId);

  // 1. Cache hit (access_token ainda válido)
  const cached = getCached(key);
  if (cached) {
    return { accessToken: cached.accessToken, calendarId: cached.calendarId };
  }

  // 2. Buscar credencial: override de projeto primeiro, depois org-level.
  const rows = await db.organizationProvider.findMany({
    where: {
      organizationId,
      category: ProviderCategory.AUXILIARY,
      provider: GOOGLE_CALENDAR_PROVIDER,
      isActive: true,
      // Busca o override do projeto E o fallback org-level (builderProjectId null).
      // `in: [id, null]` não funciona (SQL IN ignora NULL) — usar OR explícito.
      ...(builderProjectId
        ? { OR: [{ builderProjectId }, { builderProjectId: null }] }
        : { builderProjectId: null }),
    },
    select: { builderProjectId: true, credentials: true, settings: true },
  });

  if (rows.length === 0) return null;

  // Prioriza o override do projeto (builderProjectId !== null) quando solicitado.
  const row =
    (builderProjectId && rows.find((r) => r.builderProjectId === builderProjectId)) ||
    rows.find((r) => r.builderProjectId === null) ||
    rows[0];

  const creds = parseCredentials(row.credentials);
  if (!creds) return null;

  // 3. Decriptar refreshToken e trocar por access_token fresh. (QH-12: AES-256-GCM)
  // decryptToken é backward-compat: legados sem prefixo "enc:v1:" passam-through.
  let refreshToken: string;
  try {
    refreshToken = decryptToken(creds.refreshToken);
  } catch {
    return null; // ciphertext corrompido / ENCRYPTION_KEY trocada
  }

  let refreshed: { accessToken: string; expiresAt: number };
  try {
    refreshed = await refreshAccessToken(refreshToken);
  } catch {
    // refresh_token revogado pelo usuário no Google, ou client mal configurado.
    return null;
  }

  const calendarId = parseSettings(row.settings).calendarId ?? 'primary';

  // 4. Cachear (TTL min entre janela fixa e expiração real do token).
  cache.set(key, {
    accessToken: refreshed.accessToken,
    calendarId,
    expiresAt: Math.min(Date.now() + CACHE_TTL_MS, refreshed.expiresAt - 60_000),
  });

  return { accessToken: refreshed.accessToken, calendarId };
}

/**
 * Invalida o cache de access_token para um escopo.
 * Chamar após (re)conectar ou desconectar uma conta de calendário.
 */
export function invalidateCalendarAccess(organizationId: string, builderProjectId?: string): void {
  cache.delete(cacheKey(organizationId, builderProjectId));
}
