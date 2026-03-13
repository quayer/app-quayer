/**
 * SCIM 2.0 Utility Functions
 *
 * Shared helpers for SCIM API routes:
 * - Auth extraction & validation
 * - User → SCIM resource mapping
 * - SCIM error formatting (RFC 7644)
 * - Audit logging
 */

import { NextResponse } from 'next/server'
import { validateScimToken } from '@/server/features/scim-tokens/validate-scim-token'
import { database as db } from '@/server/services/database'

// SCIM schemas
export const SCIM_USER_SCHEMA = 'urn:ietf:params:scim:schemas:core:2.0:User'
export const SCIM_LIST_SCHEMA = 'urn:ietf:params:scim:api:messages:2.0:ListResponse'
export const SCIM_ERROR_SCHEMA = 'urn:ietf:params:scim:api:messages:2.0:Error'

export const MAX_PAGE_SIZE = 100
export const DEFAULT_PAGE_SIZE = 100

/**
 * Extract and validate Bearer token from Authorization header.
 * Returns { organizationId, tokenId } or a NextResponse error.
 */
export async function authenticateScim(
  request: Request
): Promise<
  | { organizationId: string; tokenId: string }
  | NextResponse
> {
  const authHeader = request.headers.get('authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return scimError(401, 'Authorization header with Bearer token is required')
  }

  const token = authHeader.slice(7)
  const result = await validateScimToken(token)

  if (!result) {
    return scimError(401, 'Invalid or expired SCIM token')
  }

  return result
}

/**
 * Format a SCIM error response per RFC 7644 Section 3.12
 */
export function scimError(
  status: number,
  detail: string,
  scimType?: string
): NextResponse {
  const body: Record<string, unknown> = {
    schemas: [SCIM_ERROR_SCHEMA],
    status: String(status),
    detail,
  }
  if (scimType) {
    body.scimType = scimType
  }
  return NextResponse.json(body, { status })
}

/**
 * Build the base URL for SCIM resources from the incoming request.
 */
export function getScimBaseUrl(request: Request): string {
  const url = new URL(request.url)
  return `${url.origin}/api/scim/v2`
}

/**
 * Map a User + UserOrganization to SCIM User resource format.
 */
export function toScimUser(
  user: {
    id: string
    email: string
    name: string
    createdAt: Date
    updatedAt: Date
  },
  userOrg: {
    isActive: boolean
  } | null,
  baseUrl: string
) {
  // Parse name into given/family (simple split on first space)
  const nameParts = user.name.trim().split(/\s+/)
  const givenName = nameParts[0] || ''
  const familyName = nameParts.slice(1).join(' ') || ''

  return {
    schemas: [SCIM_USER_SCHEMA],
    id: user.id,
    userName: user.email,
    name: {
      givenName,
      familyName,
      formatted: user.name,
    },
    emails: [
      {
        value: user.email,
        type: 'work',
        primary: true,
      },
    ],
    active: userOrg?.isActive ?? true,
    meta: {
      resourceType: 'User',
      created: user.createdAt.toISOString(),
      lastModified: user.updatedAt.toISOString(),
      location: `${baseUrl}/Users/${user.id}`,
    },
  }
}

/**
 * Create an audit log entry for SCIM operations.
 */
export async function scimAuditLog(
  action: string,
  organizationId: string,
  metadata?: Record<string, unknown>,
  userId?: string
) {
  try {
    await db.auditLog.create({
      data: {
        action,
        resource: 'scim',
        userId: userId || 'system',
        organizationId,
        metadata: (metadata ?? undefined) as Record<string, string> | undefined,
      },
    })
  } catch (err) {
    console.error(`[SCIM AuditLog] Failed to write ${action}:`, err)
  }
}

/**
 * Parse SCIM filter string. Supports: userName eq "value"
 * Returns { attribute, operator, value } or null.
 */
export function parseScimFilter(
  filter: string | null
): { attribute: string; operator: string; value: string } | null {
  if (!filter) return null

  // Match: attribute op "value" or attribute op 'value'
  const match = filter.match(
    /^(\w+)\s+(eq|ne|co|sw|ew|gt|ge|lt|le)\s+["'](.+?)["']$/i
  )
  if (!match) return null

  return {
    attribute: match[1],
    operator: match[2].toLowerCase(),
    value: match[3],
  }
}
