/**
 * JWT Token Generation and Verification
 *
 * Gerenciamento de Access Tokens e Refresh Tokens
 */

import jwt, { JwtPayload } from 'jsonwebtoken';
import { UserRole, OrganizationRole } from './roles';

/**
 * JWT Secrets - Usar variáveis de ambiente em produção
 */
const JWT_SECRET = process.env.JWT_SECRET || 'your_random_secret_key_here_change_in_production';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || JWT_SECRET;

/**
 * Token expiration times
 */
const ACCESS_TOKEN_EXPIRY = '15m'; // 15 minutos
const REFRESH_TOKEN_EXPIRY = '7d'; // 7 dias

/**
 * Payload do Access Token
 */
export interface AccessTokenPayload {
  userId: string;
  email: string;
  role: UserRole;
  currentOrgId?: string | null;
  organizationRole?: OrganizationRole | null;
  needsOnboarding?: boolean; // Indica se usuário precisa completar onboarding
  type: 'access';
}

/**
 * Payload do Refresh Token
 */
export interface RefreshTokenPayload {
  userId: string;
  tokenId: string; // ID do RefreshToken no banco
  type: 'refresh';
}

/**
 * Payload do Magic Link Token
 */
export interface MagicLinkTokenPayload {
  email: string;
  tokenId: string; // ID do VerificationCode no banco
  type: 'magic-link-login' | 'magic-link-signup';
  name?: string; // Apenas para signup
}

/**
 * Gera Access Token JWT
 *
 * @param payload - Dados do usuário para incluir no token
 * @param expiresIn - Tempo de expiração (opcional, padrão: 15m)
 * @returns JWT token string
 *
 * @example
 * ```ts
 * const token = signAccessToken({
 *   userId: user.id,
 *   email: user.email,
 *   role: user.role,
 *   currentOrgId: user.currentOrgId,
 *   organizationRole: userOrg?.role
 * });
 * ```
 */
export function signAccessToken(
  payload: Omit<AccessTokenPayload, 'type'>,
  expiresIn: string = ACCESS_TOKEN_EXPIRY
): string {
  const fullPayload: AccessTokenPayload = {
    ...payload,
    type: 'access',
  };

  return jwt.sign(fullPayload, JWT_SECRET, {
    expiresIn,
    issuer: 'quayer',
    audience: 'quayer-api',
  });
}

/**
 * Gera Refresh Token JWT
 *
 * @param payload - userId e tokenId do refresh token
 * @param expiresIn - Tempo de expiração (opcional, padrão: 7d)
 * @returns JWT token string
 *
 * @example
 * ```ts
 * const refreshToken = signRefreshToken({
 *   userId: user.id,
 *   tokenId: savedRefreshToken.id
 * });
 * ```
 */
export function signRefreshToken(
  payload: Omit<RefreshTokenPayload, 'type'>,
  expiresIn: string = REFRESH_TOKEN_EXPIRY
): string {
  const fullPayload: RefreshTokenPayload = {
    ...payload,
    type: 'refresh',
  };

  return jwt.sign(fullPayload, JWT_REFRESH_SECRET, {
    expiresIn,
    issuer: 'quayer',
    audience: 'quayer-api',
  });
}

/**
 * Verifica e decodifica Access Token
 *
 * @param token - JWT token string
 * @returns Payload decodificado ou null se inválido
 *
 * @example
 * ```ts
 * const payload = verifyAccessToken(req.headers.authorization?.split(' ')[1]);
 * if (!payload) {
 *   throw new Error('Invalid token');
 * }
 * ```
 */
export function verifyAccessToken(token: string): AccessTokenPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      issuer: 'quayer',
      audience: 'quayer-api',
    }) as JwtPayload;

    if (decoded.type !== 'access') {
      return null;
    }

    return decoded as AccessTokenPayload;
  } catch (error) {
    console.error('Error verifying access token:', error);
    return null;
  }
}

/**
 * Verifica e decodifica Refresh Token
 *
 * @param token - JWT token string
 * @returns Payload decodificado ou null se inválido
 *
 * @example
 * ```ts
 * const payload = verifyRefreshToken(refreshToken);
 * if (!payload) {
 *   throw new Error('Invalid refresh token');
 * }
 * ```
 */
export function verifyRefreshToken(token: string): RefreshTokenPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_REFRESH_SECRET, {
      issuer: 'quayer',
      audience: 'quayer-api',
    }) as JwtPayload;

    if (decoded.type !== 'refresh') {
      return null;
    }

    return decoded as RefreshTokenPayload;
  } catch (error) {
    console.error('Error verifying refresh token:', error);
    return null;
  }
}

/**
 * Decodifica token sem verificar assinatura (útil para debug)
 *
 * @param token - JWT token string
 * @returns Payload decodificado ou null
 */
export function decodeToken(token: string): JwtPayload | null {
  try {
    return jwt.decode(token) as JwtPayload;
  } catch (error) {
    console.error('Error decoding token:', error);
    return null;
  }
}

/**
 * Verifica se um token expirou
 *
 * @param token - JWT token string
 * @returns true se expirado
 */
export function isTokenExpired(token: string): boolean {
  const decoded = decodeToken(token);
  if (!decoded || !decoded.exp) return true;

  return Date.now() >= decoded.exp * 1000;
}

/**
 * Extrai token do header Authorization
 *
 * @param authHeader - Header Authorization (formato: "Bearer <token>")
 * @returns Token extraído ou null
 */
export function extractTokenFromHeader(authHeader: string | undefined): string | null {
  if (!authHeader) return null;

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null;
  }

  return parts[1];
}

/**
 * Calcula data de expiração baseada em string de tempo
 *
 * @param expiresIn - String de tempo (ex: '7d', '15m', '1h')
 * @returns Date de expiração
 */
export function getExpirationDate(expiresIn: string): Date {
  const now = Date.now();
  const match = expiresIn.match(/^(\d+)([smhd])$/);

  if (!match) {
    throw new Error('Invalid expiration format');
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  let milliseconds = 0;
  switch (unit) {
    case 's':
      milliseconds = value * 1000;
      break;
    case 'm':
      milliseconds = value * 60 * 1000;
      break;
    case 'h':
      milliseconds = value * 60 * 60 * 1000;
      break;
    case 'd':
      milliseconds = value * 24 * 60 * 60 * 1000;
      break;
  }

  return new Date(now + milliseconds);
}

/**
 * Gera Magic Link Token JWT (para login/signup sem código)
 *
 * @param payload - Email, tokenId e type (login ou signup)
 * @param expiresIn - Tempo de expiração (padrão: 10m)
 * @returns JWT token string
 *
 * @example
 * ```ts
 * const token = signMagicLinkToken({
 *   email: 'user@example.com',
 *   tokenId: verificationCode.id,
 *   type: 'magic-link-login'
 * });
 * ```
 */
export function signMagicLinkToken(
  payload: Omit<MagicLinkTokenPayload, 'type'> & { type: 'login' | 'signup'; name?: string },
  expiresIn: string = '10m'
): string {
  const fullPayload: MagicLinkTokenPayload = {
    email: payload.email,
    tokenId: payload.tokenId,
    type: payload.type === 'login' ? 'magic-link-login' : 'magic-link-signup',
    ...(payload.name && { name: payload.name }),
  };

  return jwt.sign(fullPayload, JWT_SECRET, {
    expiresIn,
    issuer: 'quayer',
    audience: 'quayer-api',
  });
}

/**
 * Verifica e decodifica Magic Link Token
 *
 * @param token - JWT token string
 * @returns Payload decodificado ou null se inválido
 *
 * @example
 * ```ts
 * const payload = verifyMagicLinkToken(token);
 * if (!payload) {
 *   throw new Error('Invalid magic link');
 * }
 * ```
 */
export function verifyMagicLinkToken(token: string): MagicLinkTokenPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      issuer: 'quayer',
      audience: 'quayer-api',
    }) as JwtPayload;

    if (!decoded.type || (!decoded.type.startsWith('magic-link'))) {
      return null;
    }

    return decoded as MagicLinkTokenPayload;
  } catch (error) {
    console.error('Error verifying magic link token:', error);
    return null;
  }
}
