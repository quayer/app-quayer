/**
 * SCIM 2.0 /Users/:id endpoint
 *
 * GET    /api/scim/v2/Users/:id — Get a single user
 * PUT    /api/scim/v2/Users/:id — Full replace of user
 * PATCH  /api/scim/v2/Users/:id — Partial update (Operations array)
 * DELETE /api/scim/v2/Users/:id — Soft-delete (deactivate)
 *
 * Auth: Bearer token (ScimToken) → organizationId
 * Responses follow RFC 7644 SCIM 2.0 format.
 */

import { NextRequest } from 'next/server'
import { database as db } from '@/server/services/database'
import {
  authenticateScim,
  scimError,
  toScimUser,
  getScimBaseUrl,
  scimAuditLog,
  SCIM_USER_SCHEMA,
} from '../scim-utils'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * Shared helper: look up user + their UserOrganization in the given org.
 */
async function findUserInOrg(userId: string, organizationId: string) {
  const userOrg = await db.userOrganization.findFirst({
    where: {
      userId,
      organizationId,
    },
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

  return userOrg
}

/**
 * GET /api/scim/v2/Users/:id
 */
export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await authenticateScim(request)
  if (auth instanceof Response) return auth
  const { organizationId } = auth

  const { id } = await context.params

  const userOrg = await findUserInOrg(id, organizationId)
  if (!userOrg) {
    return scimError(404, `User ${id} not found in organization`)
  }

  const baseUrl = getScimBaseUrl(request)
  const scimUser = toScimUser(userOrg.user, { isActive: userOrg.isActive }, baseUrl)

  return Response.json(scimUser)
}

/**
 * PUT /api/scim/v2/Users/:id
 *
 * Full replacement of user attributes.
 */
export async function PUT(request: NextRequest, context: RouteContext) {
  const auth = await authenticateScim(request)
  if (auth instanceof Response) return auth
  const { organizationId } = auth

  const { id } = await context.params

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return scimError(400, 'Invalid JSON body')
  }

  const userOrg = await findUserInOrg(id, organizationId)
  if (!userOrg) {
    return scimError(404, `User ${id} not found in organization`)
  }

  // Extract fields to update
  const nameObj = body.name as { givenName?: string; familyName?: string; formatted?: string } | undefined
  const displayName =
    (body.displayName as string) ||
    nameObj?.formatted ||
    [nameObj?.givenName, nameObj?.familyName].filter(Boolean).join(' ') ||
    undefined

  const userName = body.userName as string | undefined
  const active = body.active as boolean | undefined

  // Build update data
  const userUpdate: Record<string, unknown> = {}
  if (displayName !== undefined) userUpdate.name = displayName
  if (userName !== undefined) userUpdate.email = userName.toLowerCase()

  // Update user fields if any
  let updatedUser = userOrg.user
  if (Object.keys(userUpdate).length > 0) {
    updatedUser = await db.user.update({
      where: { id },
      data: userUpdate,
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
        updatedAt: true,
      },
    })
  }

  // Update active status on UserOrganization
  let updatedUserOrg = userOrg
  if (active !== undefined) {
    updatedUserOrg = await db.userOrganization.update({
      where: { id: userOrg.id },
      data: { isActive: active },
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
  }

  await scimAuditLog('scim_user_updated', organizationId, {
    userId: id,
    method: 'PUT',
    changes: { ...userUpdate, active },
  })

  const baseUrl = getScimBaseUrl(request)
  const scimUser = toScimUser(
    updatedUser,
    { isActive: active !== undefined ? active : updatedUserOrg.isActive },
    baseUrl
  )

  return Response.json(scimUser)
}

/**
 * PATCH /api/scim/v2/Users/:id
 *
 * Partial update via SCIM Operations array.
 * Supports op: "replace" for active, name, userName.
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await authenticateScim(request)
  if (auth instanceof Response) return auth
  const { organizationId } = auth

  const { id } = await context.params

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return scimError(400, 'Invalid JSON body')
  }

  const userOrg = await findUserInOrg(id, organizationId)
  if (!userOrg) {
    return scimError(404, `User ${id} not found in organization`)
  }

  const operations = body.Operations as Array<{
    op: string
    path?: string
    value?: unknown
  }> | undefined

  if (!operations || !Array.isArray(operations)) {
    return scimError(400, 'Operations array is required for PATCH')
  }

  const userUpdate: Record<string, unknown> = {}
  let activeUpdate: boolean | undefined

  for (const op of operations) {
    if (op.op.toLowerCase() !== 'replace') {
      // Only "replace" is supported for now
      continue
    }

    if (op.path === 'active' || op.path === 'urn:ietf:params:scim:schemas:core:2.0:User:active') {
      activeUpdate = Boolean(op.value)
    } else if (op.path === 'userName' || op.path === 'urn:ietf:params:scim:schemas:core:2.0:User:userName') {
      if (typeof op.value === 'string') {
        userUpdate.email = op.value.toLowerCase()
      }
    } else if (op.path === 'name.givenName') {
      // Update given name — combine with existing family name
      const currentParts = userOrg.user.name.trim().split(/\s+/)
      const familyName = currentParts.slice(1).join(' ')
      userUpdate.name = [op.value, familyName].filter(Boolean).join(' ')
    } else if (op.path === 'name.familyName') {
      const currentParts = userOrg.user.name.trim().split(/\s+/)
      const givenName = currentParts[0] || ''
      userUpdate.name = [givenName, op.value].filter(Boolean).join(' ')
    } else if (op.path === 'name') {
      const nameVal = op.value as { givenName?: string; familyName?: string; formatted?: string } | undefined
      if (nameVal) {
        userUpdate.name =
          nameVal.formatted ||
          [nameVal.givenName, nameVal.familyName].filter(Boolean).join(' ')
      }
    } else if (!op.path) {
      // No path — value is a partial user object
      const val = op.value as Record<string, unknown> | undefined
      if (val) {
        if (val.active !== undefined) activeUpdate = Boolean(val.active)
        if (typeof val.userName === 'string') userUpdate.email = (val.userName as string).toLowerCase()
        if (val.name) {
          const n = val.name as { givenName?: string; familyName?: string; formatted?: string }
          userUpdate.name = n.formatted || [n.givenName, n.familyName].filter(Boolean).join(' ')
        }
        if (typeof val.displayName === 'string') userUpdate.name = val.displayName
      }
    }
  }

  // Apply user updates
  let updatedUser = userOrg.user
  if (Object.keys(userUpdate).length > 0) {
    updatedUser = await db.user.update({
      where: { id },
      data: userUpdate,
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
        updatedAt: true,
      },
    })
  }

  // Apply active status
  if (activeUpdate !== undefined) {
    await db.userOrganization.update({
      where: { id: userOrg.id },
      data: { isActive: activeUpdate },
    })
  }

  await scimAuditLog('scim_user_patched', organizationId, {
    userId: id,
    method: 'PATCH',
    operations: operations.map((o) => ({ op: o.op, path: o.path })),
  })

  const baseUrl = getScimBaseUrl(request)
  const scimUser = toScimUser(
    updatedUser,
    { isActive: activeUpdate !== undefined ? activeUpdate : userOrg.isActive },
    baseUrl
  )

  return Response.json(scimUser)
}

/**
 * DELETE /api/scim/v2/Users/:id
 *
 * Soft-delete: sets UserOrganization.isActive = false.
 * Does NOT delete the User record.
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  const auth = await authenticateScim(request)
  if (auth instanceof Response) return auth
  const { organizationId } = auth

  const { id } = await context.params

  const userOrg = await findUserInOrg(id, organizationId)
  if (!userOrg) {
    return scimError(404, `User ${id} not found in organization`)
  }

  // Soft delete — deactivate membership
  await db.userOrganization.update({
    where: { id: userOrg.id },
    data: { isActive: false },
  })

  await scimAuditLog('scim_user_deprovisioned', organizationId, {
    userId: id,
    email: userOrg.user.email,
  })

  // SCIM DELETE returns 204 No Content
  return new Response(null, { status: 204 })
}
