/**
 * Google Calendar — shared types.
 *
 * Tipos para o fluxo OAuth dedicado do Google Calendar (BYOK por org/projeto).
 * Client/escopo SEPARADOS do OAuth de login (src/server/core/auth/oauth-google).
 */

/** Tokens retornados pela troca de authorization code. */
export interface CalendarTokens {
  /** Bearer token de curta duração (~1h). */
  accessToken: string;
  /**
   * Refresh token de longa duração. Só vem na PRIMEIRA autorização com
   * access_type=offline + prompt=consent. Em re-autorizações pode ser undefined.
   */
  refreshToken?: string;
  /** Epoch ms em que o accessToken expira. */
  expiresAt: number;
}

/** Resultado de resolveCalendarAccess: acesso pronto-para-uso à API. */
export interface ResolvedCalendarAccess {
  /** Access token fresh (renovado se necessário). */
  accessToken: string;
  /** ID do calendário alvo (default 'primary'). */
  calendarId: string;
}

/**
 * Shape das credenciais persistidas em OrganizationProvider.credentials (Json).
 * `refreshToken` é AES-encrypted via @/lib/crypto antes de gravar.
 */
export interface StoredCalendarCredentials {
  /** Refresh token AES-encrypted (formato "iv:data" de crypto.encrypt). */
  refreshToken: string;
  /** Email da conta Google conectada (não-sensível, p/ exibição). */
  calendarEmail?: string;
}

/**
 * Shape de OrganizationProvider.settings (Json) para google-calendar.
 */
export interface CalendarProviderSettings {
  /** Calendário alvo. Default 'primary' quando ausente. */
  calendarId?: string;
}

/** Slug do provider em OrganizationProvider.provider. */
export const GOOGLE_CALENDAR_PROVIDER = 'google-calendar' as const;
