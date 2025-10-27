/**
 * Google OAuth Service
 *
 * Serviço para autenticação via Google OAuth 2.0
 */

import { OAuth2Client } from 'google-auth-library';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/google-callback';

const oauth2Client = new OAuth2Client(
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI
);

/**
 * Gera URL de autorização do Google
 */
export function getGoogleAuthUrl(): string {
  const scopes = [
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
  ];

  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent', // Força mostrar tela de consentimento
  });
}

/**
 * Troca código de autorização por tokens
 */
export async function getGoogleTokens(code: string) {
  const { tokens } = await oauth2Client.getToken(code);
  return tokens;
}

/**
 * Obtém informações do usuário do Google
 */
export async function getGoogleUserInfo(accessToken: string) {
  oauth2Client.setCredentials({ access_token: accessToken });

  const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch Google user info');
  }

  const data = await response.json();

  return {
    id: data.id,
    email: data.email,
    name: data.name,
    picture: data.picture,
    verified_email: data.verified_email,
  };
}

/**
 * Verifica ID Token do Google
 */
export async function verifyGoogleIdToken(idToken: string) {
  const ticket = await oauth2Client.verifyIdToken({
    idToken,
    audience: GOOGLE_CLIENT_ID,
  });

  const payload = ticket.getPayload();

  if (!payload) {
    throw new Error('Invalid ID token');
  }

  return {
    id: payload.sub,
    email: payload.email!,
    name: payload.name!,
    picture: payload.picture,
    email_verified: payload.email_verified,
  };
}
