/**
 * SCIM 2.0 /Users endpoint
 *
 * GET  /api/scim/v2/Users — List users with pagination & filter
 * POST /api/scim/v2/Users — Create (provision) a new user
 *
 * Auth: Bearer token (ScimToken) → organizationId
 * Responses follow RFC 7644 SCIM 2.0 format.
 */

import { NextRequest } from 'next/server'
import { database as db } from '@/server/services/database'
import { hashPassword } from '@/lib/auth/bcrypt'
import crypto from 'crypto'
import {
  authenticateScim,
  scimError,
  toScimUser,
  getScimBaseUrl,
  scimAuditLog,
  parseScimFilter,
  SCIM_LIST_SCHEMA,
  SCIM_USER_SCHEMA,
  MAX_PAGE_SIZE,
  DEFAULT_PAGE_SIZE,
} from './scim-utils'

/**
 * GET /api/scim/v2/Users
 *
 * List users in the organization with SCIM pagination.
 * Supports: startIndex, count, filter (userName eq "email")
 */
export async function GET(request: NextRequest) {
  const auth = await authenticateScim(request)
  if (auth instanceof Response) return auth
  const { organizationId } = auth

  const { searchParams } = new URL(request.url)
  const startIndex = Math.max(1, parseInt(searchParams.get('startIndex') || '1', 10))
  const count = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, parseInt(searchParams.get('count') || String(DEFAULT_PAGE_SIZE), 10))
  )
  const filter = searchParams.get('filter')

  // Build where clause
  const whereClause: Record<string, unknown> = {
    organizationId,
  }

  const parsed = parseScimFilter(filter)
  if (parsed) {
    if (parsed.attribute === 'userName' && parsed.operator === 'eq') {
      whereClause.user = { email: parsed.value }
    }
  }

  // Count total
  const totalResults = await db.userOrganization.count({ where: whereClause })

  // Fetch page (startIndex is 1-based in SCIM)
  const skip = startIndex - 1
  const userOrgs = await db.userOrganization.findMany({
    where: whereClause,
    skip,
    take: count,
    orderBy: { createdAt: 'asc' },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  })

  const baseUrl = getScimBaseUrl(request)

  const resources = userOrgs.map((uo) =>
    toScimUser(uo.user, { isActive: uo.isActive }, baseUrl)
  )

  return Response.json({
    schemas: [SCIM_LIST_SCHEMA],
    totalResults,
    startIndex,
    itemsPerPage: resources.length,
    Resources: resources,
  })
}

/**
 * POST /api/scim/v2/Users
 *
 * Provision a new user in the organization.
 * Creates User + UserOrganization. Sends welcome email if email service available.
 */
export async function POST(request: NextRequest) {
  const auth = await authenticateScim(request)
  if (auth instanceof Response) return auth
  const { organizationId } = auth

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return scimError(400, 'Invalid JSON body')
  }

  // Validate required SCIM fields
  const schemas = body.schemas as string[] | undefined
  if (
    !schemas ||
    !Array.isArray(schemas) ||
    !schemas.includes(SCIM_USER_SCHEMA)
  ) {
    return scimError(400, 'Missing or invalid schemas array')
  }

  const userName = body.userName as string | undefined
  if (!userName || typeof userName !== 'string') {
    return scimError(400, 'userName (email) is required', 'invalidValue')
  }

  // Extract name
  const nameObj = body.name as { givenName?: string; familyName?: string; formatted?: string } | undefined
  const displayName =
    (body.displayName as string) ||
    nameObj?.formatted ||
    [nameObj?.givenName, nameObj?.familyName].filter(Boolean).join(' ') ||
    userName.split('@')[0]

  // Check if user already exists in this org
  const existingUser = await db.user.findUnique({
    where: { email: userName.toLowerCase() },
    include: {
      organizations: {
        where: { organizationId },
      },
    },
  })

  if (existingUser && existingUser.organizations.length > 0) {
    return scimError(409, 'User already exists in this organization', 'uniqueness')
  }

  // Look up default role from verified domains or use 'user'
  let defaultRoleId: string | null = null
  const emailDomain = userName.toLowerCase().split('@')[1]
  if (emailDomain) {
    const verifiedDomain = await db.verifiedDomain.findFirst({
      where: {
        organizationId,
        domain: emailDomain,
        verifiedAt: { not: null },
      },
      select: { defaultRoleId: true },
    })
    if (verifiedDomain?.defaultRoleId) {
      defaultRoleId = verifiedDomain.defaultRoleId
    }
  }

  // If no defaultRoleId from domain, find the system 'user' role
  if (!defaultRoleId) {
    const userRole = await db.customRole.findFirst({
      where: { organizationId, slug: 'user', isSystem: true },
      select: { id: true },
    })
    if (userRole) {
      defaultRoleId = userRole.id
    }
  }

  const baseUrl = getScimBaseUrl(request)

  if (existingUser) {
    // User exists but not in this org — add them
    const userOrg = await db.userOrganization.create({
      data: {
        userId: existingUser.id,
        organizationId,
        role: 'user',
        customRoleId: defaultRoleId,
        isActive: body.active !== false,
      },
    })

    await scimAuditLog('scim_user_provisioned', organizationId, {
      userId: existingUser.id,
      email: userName,
      existingUser: true,
    })

    const scimUser = toScimUser(
      existingUser,
      { isActive: userOrg.isActive },
      baseUrl
    )

    return Response.json(scimUser, { status: 201 })
  }

  // Create brand new user
  const randomPassword = crypto.randomBytes(32).toString('hex')
  const hashedPassword = await hashPassword(randomPassword)

  const newUser = await db.user.create({
    data: {
      email: userName.toLowerCase(),
      name: displayName,
      password: hashedPassword,
      emailVerified: new Date(), // SCIM-provisioned users are pre-verified
      isActive: true,
      currentOrgId: organizationId,
    },
  })

  await db.userOrganization.create({
    data: {
      userId: newUser.id,
      organizationId,
      role: 'user',
      customRoleId: defaultRoleId,
      isActive: body.active !== false,
    },
  })

  await scimAuditLog('scim_user_provisioned', organizationId, {
    userId: newUser.id,
    email: userName,
    existingUser: false,
  })

  // Try to send welcome email (fire and forget)
  try {
    const { emailService } = await import('@/lib/email')
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'https://quayer.com'
    await emailService.send({
      to: userName.toLowerCase(),
      subject: 'Bem-vindo ao Quayer',
      html: `
        <h2>Bem-vindo ao Quayer!</h2>
        <p>Sua conta foi provisionada automaticamente pela sua organização.</p>
        <p>Acesse <a href="${appUrl}">${appUrl}</a> e faça login com seu email.</p>
        <p>Como sua conta foi criada via provisionamento automático, use "Esqueci minha senha" para definir sua senha.</p>
      `,
    })
  } catch (emailErr) {
    console.error('[SCIM] Failed to send welcome email:', emailErr)
  }

  const scimUser = toScimUser(
    newUser,
    { isActive: true },
    baseUrl
  )

  return Response.json(scimUser, { status: 201 })
}
