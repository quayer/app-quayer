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
}

export interface RefreshTokenPayload {
  userId: string
  tokenId: string
}

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production'
)

/**
 * Verify Access Token (Edge Runtime compatible)
 */
export async function verifyAccessToken(token: string): Promise<AccessTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET, {
      issuer: 'quayer',
      audience: 'quayer-api',
    })

    return {
      userId: payload.userId as string,
      email: payload.email as string,
      role: payload.role as UserRole,
      currentOrgId: payload.currentOrgId as string | null,
      organizationRole: payload.organizationRole as string | undefined,
    }
  } catch (error) {
    console.error('Error verifying access token:', error)
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
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null
  }
  return authHeader.substring(7)
}
