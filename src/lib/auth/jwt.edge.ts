/**
 * JWT Edge Runtime Implementation
 *
 * Uses 'jose' library which is compatible with Edge Runtime
 */

import { jwtVerify, SignJWT } from 'jose'
import type { UserRole } from './roles'

export interface AccessTokenPayload {
  userId: string
  email: string
  role: UserRole
  currentOrgId: string | null
  organizationRole?: string
  needsOnboarding?: boolean
}

export interface RefreshTokenPayload {
  userId: string
  tokenId: string
}

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET environment variable is required')
  return new TextEncoder().encode(secret)
}
const JWT_SECRET = getJwtSecret()

/**
 * Verify Access Token (Edge Runtime compatible)
 */
export async function verifyAccessToken(token: string): Promise<AccessTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET, {
      issuer: 'quayer',
      audience: 'quayer-api',
    })

    if (payload.type !== 'access') return null

    return {
      userId: payload.userId as string,
      email: payload.email as string,
      role: payload.role as UserRole,
      currentOrgId: payload.currentOrgId as string | null,
      organizationRole: payload.organizationRole as string | undefined,
      needsOnboarding: payload.needsOnboarding as boolean | undefined,
    }
  } catch (error) {
    return null
  }
}

/**
 * Sign Access Token (Edge Runtime compatible)
 */
export async function signAccessToken(payload: AccessTokenPayload): Promise<string> {
  return await new SignJWT({
    userId: payload.userId,
    email: payload.email,
    role: payload.role,
    currentOrgId: payload.currentOrgId,
    organizationRole: payload.organizationRole,
    needsOnboarding: payload.needsOnboarding,
    type: 'access',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setIssuer('quayer')
    .setAudience('quayer-api')
    .setExpirationTime('15m')
    .sign(JWT_SECRET)
}

/**
 * Extract token from Authorization header
 */
export function extractTokenFromHeader(authHeader: string): string | null {
  if (!authHeader) return null

  const parts = authHeader.split(' ')
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null
  }

  return parts[1]
}
