/**
 * Google Calendar OAuth — client DEDICADO (não reusar o de login).
 *
 * Usa env próprias: GOOGLE_CALENDAR_CLIENT_ID / _SECRET / _REDIRECT_URI.
 * O OAuth de login (src/server/core/auth/oauth-google) tem outro client e
 * outro escopo (openid email profile) — manter SEPARADO.
 *
 * access_type=offline + prompt=consent são obrigatórios para receber
 * refresh_token (caso contrário só viria access_token de curta duração).
 */

import type { CalendarTokens } from './types';

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const USERINFO_ENDPOINT = 'https://www.googleapis.com/oauth2/v3/userinfo';

/** Escopo de calendário. Read+write em eventos do usuário. */
const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar';

/** Lê client_id dedicado, falha rápido se ausente em runtime. */
function getClientId(): string {
  const id = process.env.GOOGLE_CALENDAR_CLIENT_ID;
  if (!id) throw new Error('[CalendarOAuth] GOOGLE_CALENDAR_CLIENT_ID não configurado.');
  return id;
}

/** Lê client_secret dedicado, falha rápido se ausente em runtime. */
function getClientSecret(): string {
  const secret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
  if (!secret) throw new Error('[CalendarOAuth] GOOGLE_CALENDAR_CLIENT_SECRET não configurado.');
  return secret;
}

/** redirectUri default vindo da env; chamadas podem sobrescrever. */
function getDefaultRedirectUri(): string {
  const uri = process.env.GOOGLE_CALENDAR_REDIRECT_URI;
  if (!uri) throw new Error('[CalendarOAuth] GOOGLE_CALENDAR_REDIRECT_URI não configurado.');
  return uri;
}

/**
 * Monta a URL de autorização do Google Calendar.
 *
 * @param state CSRF token (gerado pelo caller, ex: crypto.randomBytes(32).toString('hex'))
 * @param redirectUri opcional; default = GOOGLE_CALENDAR_REDIRECT_URI
 */
export function buildAuthUrl({ state, redirectUri }: { state: string; redirectUri?: string }): string {
  const params = new URLSearchParams({
    client_id: getClientId(),
    redirect_uri: redirectUri ?? getDefaultRedirectUri(),
    response_type: 'code',
    scope: CALENDAR_SCOPE,
    access_type: 'offline', // requer refresh_token
    prompt: 'consent', // força emissão de refresh_token em re-auth
    include_granted_scopes: 'true',
    state,
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

/**
 * Troca o authorization code por tokens.
 * Retorna refreshToken apenas se o Google o emitir (1ª autorização).
 *
 * @param redirectUri DEVE bater com o usado em buildAuthUrl.
 */
export async function exchangeCode(code: string, redirectUri?: string): Promise<CalendarTokens> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: getClientId(),
      client_secret: getClientSecret(),
      redirect_uri: redirectUri ?? getDefaultRedirectUri(),
      grant_type: 'authorization_code',
    }),
  });

  if (!res.ok) {
    throw new Error(`[CalendarOAuth] Falha na troca de code (HTTP ${res.status}).`);
  }

  const data = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };

  if (!data.access_token) {
    throw new Error('[CalendarOAuth] Resposta sem access_token.');
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token, // pode ser undefined em re-auth
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
}

/**
 * Troca um refresh_token por um access_token novo.
 * Não retorna novo refresh_token (Google reusa o existente).
 */
export async function refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresAt: number }> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: getClientId(),
      client_secret: getClientSecret(),
      grant_type: 'refresh_token',
    }),
  });

  if (!res.ok) {
    throw new Error(`[CalendarOAuth] Falha ao renovar access_token (HTTP ${res.status}).`);
  }

  const data = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) {
    throw new Error('[CalendarOAuth] Refresh sem access_token (token revogado?).');
  }

  return {
    accessToken: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
}

/** Retorna o email da conta Google associada ao access_token. */
export async function getCalendarEmail(accessToken: string): Promise<string> {
  const res = await fetch(USERINFO_ENDPOINT, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`[CalendarOAuth] Falha ao obter userinfo (HTTP ${res.status}).`);
  }
  const data = (await res.json()) as { email?: string };
  if (!data.email) {
    throw new Error('[CalendarOAuth] userinfo sem email.');
  }
  return data.email;
}
